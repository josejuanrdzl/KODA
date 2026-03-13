const db = require('../services/supabase');
const claude = require('../services/claude');
const { parseActions } = require('../utils/actionParser');
const { classifyIntent } = require('../intent');
const { checkModuleAccess, performContextInjection } = require('../module.router');
const whisper = require('../services/whisper'); // Nuevo servicio Whisper
const { sendChannelMessage } = require('../utils/messenger'); // Integración WhatsApp

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
        console.log(`[AUDIO TRANSCRIPT]: "${userText}"`);
        
        // Re-calculate context injection based on the transcribed text
        msg.text = userText; // Update msg.text so performContextInjection can see it
        const extraContext = await performContextInjection(msg, user);
        if (extraContext) {
            userText = msg.text; // Use the updated text with injected data
        }

        // Agregar nota interna si el audio dura más de 5 minutos (300 segundos)
        if (duration > 300) {
            userText += `\n\n[INSTRUCCIÓN INTERNA: Este audio duró más de 5 minutos. Si el usuario te estaba dictando algo largo y notas que hay valor en conservarlo, ofrécele al final de tu respuesta guardarlo como una nota larga (SAVE_NOTE).]`;
        }
    }

    // Módulos
    const hasJournal = await checkModuleAccess(user, 'journal');
    const hasHabits = await checkModuleAccess(user, 'habits');
    const hasMessageAnalysis = await checkModuleAccess(user, 'message_analysis');
    const hasWeather = await checkModuleAccess(user, 'weather');
    const hasFxRates = await checkModuleAccess(user, 'fx-rates');
    const hasSpotify = await checkModuleAccess(user, 'spotify');
    const hasSports = await checkModuleAccess(user, 'sports');
    const hasLuna = await checkModuleAccess(user, 'luna');
    const hasGmail = await checkModuleAccess(user, 'gmail');
    const hasCalendar = await checkModuleAccess(user, 'calendar');
    const hasMessaging = await checkModuleAccess(user, 'messaging');
    const hasMemory = await checkModuleAccess(user, 'memory');

    const disabledModules = [];
    if (!hasJournal) disabledModules.push('journal');
    if (!hasHabits) disabledModules.push('habits');
    if (!hasMessageAnalysis) disabledModules.push('message_analysis');
    if (!hasWeather) disabledModules.push('weather');
    if (!hasFxRates) disabledModules.push('fx-rates');
    if (!hasSpotify) disabledModules.push('spotify');
    if (!hasSports) disabledModules.push('sports');
    if (!hasLuna) disabledModules.push('luna');
    if (!hasGmail) disabledModules.push('gmail');
    if (!hasCalendar) disabledModules.push('calendar');
    if (!hasMessaging) disabledModules.push('messaging');
    if (!hasMemory) disabledModules.push('memory');

    // Detectar reenvíos (forwards de Telegram)
    const isForwarded = Boolean(msg.forward_date || msg.forward_from || msg.forward_origin || msg.forward_sender_name);

    // Si es un reenvío, inyectamos una instrucción clara a Claude
    if (isForwarded) {
        if (!hasMessageAnalysis) {
            const { sendModuleUpsell } = require('../utils/messenger');
            await sendModuleUpsell(bot, chatId, channel, 'Análisis de Mensajes (Terceros)');
            return;
        }
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

        // Extraer contexto de módulos para el prompt del sistema
        const injectionData = options.injectionData || {};
        const familyContext = injectionData.familia || null;

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
            disabledModules,
            targetModel,
            familyContext
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
                    if (!hasJournal) {
                        console.log('Blocked SAVE_JOURNAL due to plan restriction');
                    } else {
                        await db.saveJournalEntry(user.id, action.payload.content, action.payload.mood_score, action.payload.mood_label, action.payload.summary);
                        await db.saveEmotionalTimeline(user.id, action.payload.mood_score, action.payload.mood_label, 'diario');
                    }
                }
                else if (action.type === 'SAVE_ANALYSIS') {
                    if (!hasMessageAnalysis) {
                        console.log('Blocked SAVE_ANALYSIS due to plan restriction');
                    } else {
                        await db.saveMessageAnalysis(user.id, msg.text || '', action.payload.alias, action.payload.tone, action.payload.summary);
                    }
                }
                else if (action.type === 'CREATE_HABIT') {
                    if (!hasHabits) console.log('Blocked CREATE_HABIT due to plan restriction');
                    else await db.createHabit(user.id, action.payload.name, action.payload.description, action.payload.frequency, action.payload.reminder_time);
                }
                else if (action.type === 'LOG_HABIT') {
                    if (!hasHabits) console.log('Blocked LOG_HABIT due to plan restriction');
                    else await db.logHabitCompletion(action.payload.habit_id, user.id, action.payload.completed, action.payload.note);
                }
                else if (action.type === 'UPDATE_HABIT_STATUS') {
                    if (!hasHabits) console.log('Blocked UPDATE_HABIT_STATUS due to plan restriction');
                    else await db.updateHabitStatus(action.payload.habit_id, user.id, action.payload.status);
                }
                else if (action.type === 'LUNA_LOG_CYCLE') {
                    const hasLuna = await checkModuleAccess(user, 'luna');
                    if (hasLuna) {
                        try {
                            await db.logCycle(user.id, action.payload.cycle_start, action.payload.cycle_length, action.payload.notes);
                        } catch (e) {
                            console.error('Error in LUNA_LOG_CYCLE:', e);
                        }
                    } else console.log('Blocked LUNA_LOG_CYCLE due to module restriction');
                }
                else if (action.type === 'LUNA_LOG_SYMPTOM') {
                    const hasLuna = await checkModuleAccess(user, 'luna');
                    if (hasLuna) {
                        try {
                            await db.logSymptom(user.id, action.payload.symptom);
                        } catch (e) {
                            console.error('Error in LUNA_LOG_SYMPTOM:', e);
                        }
                    } else console.log('Blocked LUNA_LOG_SYMPTOM due to module restriction');
                }
                else if (action.type === 'ADD_SHOPPING_ITEM') {
                    const hasShopping = await checkModuleAccess(user, 'shopping');
                    if (hasShopping) {
                        const list = await db.getOrCreateDefaultShoppingList(user.id);
                        // payload should be "item1|item2" based on the prompt
                        const rawItems = action.payload || '';
                        let itemsToAdd = [];

                        if (typeof action.payload === 'object' && action.payload.content) {
                            itemsToAdd = action.payload.content.split('|');
                        } else if (typeof rawItems === 'string') {
                            itemsToAdd = rawItems.split('|');
                        }

                        for (const itemName of itemsToAdd) {
                            if (itemName.trim()) {
                                await db.addShoppingItem(list.id, itemName.trim());
                            }
                        }
                    } else console.log('Blocked ADD_SHOPPING_ITEM due to module restriction');
                }
                else if (action.type === 'MARK_SHOPPING_COMPLETED') {
                    const hasShopping = await checkModuleAccess(user, 'shopping');
                    if (hasShopping) {
                        const list = await db.getOrCreateDefaultShoppingList(user.id);
                        const items = await db.getShoppingItems(list.id);
                        const pendingItems = items.filter(i => !i.is_completed);

                        const rawItems = action.payload || '';
                        let itemsToMark = [];
                        if (typeof action.payload === 'object' && action.payload.content) {
                            itemsToMark = action.payload.content.split('|');
                        } else if (typeof rawItems === 'string') {
                            itemsToMark = rawItems.split('|');
                        }

                        for (const itemQuery of itemsToMark) {
                            const q = itemQuery.trim().toLowerCase();
                            if (!q) continue;
                            const match = pendingItems.find(i => i.name.toLowerCase().includes(q) || q.includes(i.name.toLowerCase()));
                            if (match) {
                                await db.markItemCompleted(match.id, true);
                            }
                        }
                    }
                }
                else if (action.type === 'CLEAR_SHOPPING_LIST') {
                    const hasShopping = await checkModuleAccess(user, 'shopping');
                    if (hasShopping) {
                        const list = await db.getOrCreateDefaultShoppingList(user.id);
                        const items = await db.getShoppingItems(list.id);
                        const pendingItems = items.filter(i => !i.is_completed);
                        for (const item of pendingItems) {
                            await db.markItemCompleted(item.id, true);
                        }
                    }
                }
                else if (action.type === 'SAVE_FAMILY_MEMBER') {
                    const hasFamilia = await checkModuleAccess(user, 'familia');
                    if (hasFamilia) {
                        try {
                            const params = action.payload.content ? action.payload.content.split('|') : (action.payload || '').split('|');
                            if (params.length >= 2) {
                                const [name, relation, birthdateStr, school, school_start, school_end] = params.map(p => p.trim() === 'null' || !p.trim() ? null : p.trim());
                                
                                let birthdate = null;
                                if (birthdateStr) {
                                    // Evitar shift de zona horaria: Parsear y extraer componentes locales
                                    const d = new Date(birthdateStr);
                                    if (!isNaN(d.getTime())) {
                                        // Si birthdateStr es solo YYYY-MM-DD, a veces el constructor de Date
                                        // lo asume como UTC. Para ser robustos, extraemos los componentes
                                        // pero si viene de Claude suele ser YYYY-MM-DD.
                                        if (birthdateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                                            birthdate = birthdateStr;
                                        } else {
                                            const year = d.getFullYear();
                                            const month = String(d.getMonth() + 1).padStart(2, '0');
                                            const day = String(d.getDate()).padStart(2, '0');
                                            birthdate = `${year}-${month}-${day}`;
                                        }
                                    }
                                }
                                
                                await db.saveFamilyMemberSafe(user.id, {
                                    name, relation, birthdate, school, school_start, school_end
                                });
                            }
                        } catch (e) {
                            console.error('Error in SAVE_FAMILY_MEMBER:', e);
                        }
                    } else console.log('Blocked SAVE_FAMILY_MEMBER due to module restriction');
                }
                else if (action.type === 'SAVE_FAMILY_ACTIVITY') {
                    const hasFamilia = await checkModuleAccess(user, 'familia');
                    if (hasFamilia) {
                         try {
                            const params = action.payload.content ? action.payload.content.split('|') : (action.payload || '').split('|');
                            if (params.length >= 6) {
                                const [memberName, name, daysStr, start_time, end_time, location] = params.map(p => p.trim() === 'null' || !p.trim() ? null : p.trim());
                                const day_of_week = daysStr ? daysStr.split(',').map(d => parseInt(d.trim())).filter(n => !isNaN(n)) : null;
                                
                                await db.saveFamilyActivity(user.id, memberName, {
                                    name, day_of_week, start_time, end_time, location
                                });
                            }
                        } catch (e) {
                           console.error('Error in SAVE_FAMILY_ACTIVITY:', e);
                        }
                    } else console.log('Blocked SAVE_FAMILY_ACTIVITY due to module restriction');
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
