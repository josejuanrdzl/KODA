const db = require('../services/supabase');
const claude = require('../services/claude');
const { parseActions } = require('../utils/actionParser');
const { classifyIntent } = require('../koda-platform/lib/backend/intent');
const whisper = require('../services/whisper'); // Nuevo servicio Whisper
const { sendChannelMessage } = require('../utils/messenger'); // Integración WhatsApp
const { routeMessage } = require('../koda-platform/lib/backend/module.router'); // Modular router

async function handleMainFlow(bot, msg, user, options = {}) {

    const chatId = msg.chat.id;
    const channel = msg._channel || 'telegram';
    let userText = msg.text || '';
    let isAudio = false;

    // Detectar si el mensaje es de voz, audio o video_note
    if (msg.voice || msg.audio || msg.video_note) {
        isAudio = true;

        let fileId = null;
        let duration = 0;

        if (msg.voice) {
            fileId = msg.voice.file_id;
            duration = msg.voice.duration;
        } else if (msg.audio) {
            fileId = msg.audio.file_id;
            duration = msg.audio.duration;
        } else if (msg.video_note) {
            fileId = msg.video_note.file_id;
            duration = msg.video_note.duration;
        }

        // Mostrar indicador temporal
        const tempMsg = await sendChannelMessage(bot, chatId, "🎙️ Transcribiendo tu audio...", {}, channel);

        // Llamar a Whisper
        const transcript = await whisper.transcribeAudio(bot, fileId);

        // Borrar el mensaje de "Transcribiendo"
        try {
            await bot.deleteMessage(chatId, tempMsg.message_id);
        } catch (e) { console.log('Error borrando msj transcribiendo', e); }

        if (!transcript) {
            await sendChannelMessage(bot, chatId, "No logré entender el audio o hubo un problema al transcribirlo, ¿puedes repetirlo o escribirlo?", {}, channel);
            return; // Terminar flujo
        }

        userText = transcript;

        // Agregar nota interna si el audio dura más de 5 minutos (300 segundos)
        if (duration > 300) {
            userText += `\n\n[INSTRUCCIÓN INTERNA: Este audio duró más de 5 minutos. Si el usuario te estaba dictando algo largo y notas que hay valor en conservarlo, ofrécele al final de tu respuesta guardarlo como una nota larga (SAVE_NOTE).]`;
        }
    }

    // Detectar reenvíos (forwards de Telegram)
    const isForwarded = Boolean(msg.forward_date || msg.forward_from || msg.forward_origin || msg.forward_sender_name);

    // Si es un reenvío, inyectamos una instrucción clara a Claude
    if (isForwarded) {
        userText = `[MENSAJE REENVIADO DE TERCERO]: "${userText}"\n\n[INSTRUCCIÓN INTERNA]: Analiza el tono de este mensaje de un tercero, su posible intención oculta (sin juzgar, solo perspectiva) y dame 2 opciones de respuesta (una firme/clara y otra más suave/conciliadora). Usa tu acción SAVE_ANALYSIS al final.`;
    }

    // --- ENFORCEMENT DE LÍMITES ---
    if (user.plan_status === 'suspended') {
        const text = "⚠️ Tu cuenta está suspendida por falta de pago. Por favor actualiza tu método de pago ingresando a tu portal con el comando /plan.";
        if (options.returnReply) return text;
        await sendChannelMessage(bot, chatId, text, {}, channel);
        return;
    }

    if (user.plan === 'starter' && (user.messages_today || 0) >= 15) {
        const text = "⏳ Alcanzaste tu límite de 15 mensajes hoy en el plan Starter. Para seguir platicando y desbloquear todo el potencial de KODA, por favor actualiza tu plan con el comando /upgrade.";
        if (options.returnReply) return text;
        await sendChannelMessage(bot, chatId, text, {}, channel);
        return;
    }
    // ------------------------------

    // Actualizar last_active_at y messages_today
    await db.updateUser(user.id, {
        last_active_at: new Date().toISOString(),
        messages_today: (user.messages_today || 0) + 1
    });

    // Construir el payload del mensaje
    const messagePayload = {
        user_id: user.id,
        channel: channel,
        role: 'user',
        content: userText,
        content_type: isAudio ? 'audio' : 'text'
    };

    if (isAudio) {
        messagePayload.audio_transcript = userText;
    }

    // Guardar mensaje entrante
    await db.saveMessage(messagePayload);

    // Context Injection Check (Read-Only Modules / FX Rates, Weather, etc.)
    // Note: This logic is adapted from the modular router to maintain context parity
    let injectedContext = "";
    const { contextInjectors, checkModuleAccess } = require('../koda-platform/lib/backend/module.router');

    const injectionPromises = Object.entries(contextInjectors).map(async ([slug, injector]) => {
        if (injector.regex.test(userText)) {
            const hasAccess = await checkModuleAccess(user, slug);
            if (hasAccess) {
                try {
                    const data = await injector.handler(user, msg);
                    if (data) {
                        console.log(`[handleMainFlow] Contexto inyectado por módulo: ${slug}`);
                        return `\n[SISTEMA - DATOS DE MÓDULO ${slug.toUpperCase()}]:\n${data}\n`;
                    }
                } catch (e) {
                    console.error(`[handleMainFlow] Error injecting context for ${slug}:`, e.message);
                }
            }
        }
        return null;
    });

    const injectionResults = await Promise.all(injectionPromises);
    injectedContext = injectionResults.filter((r) => r !== null).join('');

    if (injectedContext) {
        userText = `${injectedContext}\n[MENSAJE DEL USUARIO]:\n${userText}`;
    }

    // Notificar al usuario que estamos pensando (Solo soportado real en Telegram)
    if (channel === 'telegram') {
        bot.sendChatAction(chatId, 'typing');
    }

    try {
        // 1. Obtener contexto del usuario
        const [recentMessages, recentNotes, recentMemories, activeReminders, recentJournals, emotionalTimeline, activeHabits] = await Promise.all([
            db.getRecentMessages(user.id, 10),
            db.getRecentNotes(user.id, 5),
            db.getRecentMemories(user.id, 10),
            db.getActiveReminders(user.id),
            db.getRecentJournalEntries(user.id, 5),
            db.getEmotionalTimeline(user.id, 7),
            db.getActiveHabits(user.id)
        ]);

        // 2. Generar respuesta con Claude
        // Asegurarse de que chatHistory esté en el orden correcto (los más antiguos primero para Claude)
        const chatHistory = [...recentMessages].reverse();

        // Configurar modelo según intención
        const targetModel = classifyIntent(userText);

        const aiResponse = await claude.generateResponse(
            user,
            userText,
            chatHistory,
            recentMemories,
            recentNotes,
            activeReminders,
            recentJournals,
            emotionalTimeline,
            activeHabits,
            [], // disabledModules
            targetModel // targetModel
        );

        // 3. Parsear acciones de la respuesta
        const { strippedText, actions } = parseActions(aiResponse.text);

        // 4. Ejecutar acciones detectadas
        for (const action of actions) {
            console.log('Detectada Acción de KODA:', action.type);
            try {
                if (action.type === 'SAVE_NOTE') {
                    await db.saveNote(user.id, action.payload.content, action.payload.tag);
                }
                else if (action.type === 'SAVE_REMINDER') {
                    await db.saveReminder(user.id, action.payload.content, action.payload.remind_at);
                }
                else if (action.type === 'DELETE_REMINDER') {
                    await db.deleteReminder(action.payload.id);
                }
                else if (action.type === 'SAVE_MEMORY') {
                    await db.saveMemory(user.id, action.payload.category, action.payload.key, action.payload.value, action.payload.context);
                }
                else if (action.type === 'SAVE_JOURNAL') {
                    await db.saveJournalEntry(user.id, action.payload.content, action.payload.mood_score, action.payload.mood_label, action.payload.summary);
                    await db.saveEmotionalTimeline(user.id, action.payload.mood_score, action.payload.mood_label, 'diario');
                }
                else if (action.type === 'SAVE_ANALYSIS') {
                    await db.saveMessageAnalysis(user.id, msg.text || '', action.payload.alias, action.payload.tone, action.payload.summary);
                }
                else if (action.type === 'CREATE_HABIT') {
                    await db.createHabit(user.id, action.payload.name, action.payload.description, action.payload.frequency, action.payload.reminder_time);
                }
                else if (action.type === 'LOG_HABIT') {
                    await db.logHabitCompletion(action.payload.habit_id, user.id, action.payload.completed, action.payload.note);
                }
                else if (action.type === 'UPDATE_HABIT_STATUS') {
                    await db.updateHabitStatus(action.payload.habit_id, user.id, action.payload.status);
                }
            } catch (actionError) {
                console.error(`Error procesando acción ${action.type}:`, actionError.message);
            }
        }

        // 5. Guardar respuesta del asistente
        await db.saveMessage({
            user_id: user.id,
            channel: channel,
            role: 'assistant',
            content: strippedText,
            content_type: 'text',
            tokens_in: aiResponse.tokensIn,
            tokens_out: aiResponse.tokensOut,
            model_used: targetModel
        });

        // 6. Enviar mensaje de vuelta al usuario
        if (options.returnReply) {
            return strippedText;
        }

        try {
            await sendChannelMessage(bot, chatId, strippedText, { parse_mode: 'Markdown' }, channel);
        } catch (sendErr) {
            console.error('Send message error, falling back to plain text:', sendErr);
            await sendChannelMessage(bot, chatId, strippedText, {}, channel);
        }

    } catch (error) {
        console.error('Error in main flow:', error);
        const errText = 'Estoy teniendo problemas técnicos. Inténtalo en unos minutos.';
        if (options.returnReply) return errText;
        await sendChannelMessage(bot, chatId, errText, {}, channel);
    }
}

module.exports = {
    handleMainFlow
};
