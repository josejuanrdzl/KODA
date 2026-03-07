const db = require('../services/supabase');
const claude = require('../services/claude');
const { parseActions } = require('../utils/actionParser');

async function handleMainFlow(bot, msg, user) {
    const telegramId = user.telegram_id;
    const chatId = msg.chat.id;
    const userText = msg.text || '';

    // Actualizar last_active_at y messages_today
    await db.updateUser(user.id, {
        last_active_at: new Date().toISOString(),
        messages_today: (user.messages_today || 0) + 1
    });

    // Guardar mensaje entrante
    await db.saveMessage({
        user_id: user.id,
        channel: 'telegram',
        role: 'user',
        content: userText,
        content_type: 'text'
    });

    // Notificar al usuario que estamos pensando
    bot.sendChatAction(chatId, 'typing');

    try {
        // 1. Obtener contexto del usuario
        const [recentMessages, recentNotes, recentMemories, activeReminders] = await Promise.all([
            db.getRecentMessages(user.id, 10),
            db.getRecentNotes(user.id, 5),
            db.getRecentMemories(user.id, 10),
            db.getActiveReminders(user.id)
        ]);

        // 2. Generar respuesta con Claude
        // Asegurarse de que chatHistory esté en el orden correcto (los más antiguos primero para Claude)
        const chatHistory = [...recentMessages].reverse();

        const aiResponse = await claude.generateResponse(
            user,
            userText,
            chatHistory,
            recentMemories,
            recentNotes,
            activeReminders
        );

        // 3. Parsear acciones de la respuesta
        const { strippedText, actions } = parseActions(aiResponse.text);

        // 4. Ejecutar acciones detectadas
        for (const action of actions) {
            console.log('Detectada Acción de KODA:', action.type);
            if (action.type === 'SAVE_NOTE') {
                await db.saveNote(user.id, action.payload.content, action.payload.tag);
            }
            else if (action.type === 'SAVE_REMINDER') {
                await db.saveReminder(user.id, action.payload.content, action.payload.remind_at);
            }
            else if (action.type === 'SAVE_MEMORY') {
                await db.saveMemory(user.id, action.payload.category, action.payload.key, action.payload.value, action.payload.context);
            }
        }

        // 5. Guardar respuesta del asistente
        await db.saveMessage({
            user_id: user.id,
            channel: 'telegram',
            role: 'assistant',
            content: strippedText,
            content_type: 'text',
            tokens_in: aiResponse.tokensIn,
            tokens_out: aiResponse.tokensOut,
            model_used: 'claude-sonnet-4-6'
        });

        // 6. Enviar mensaje de vuelta al usuario
        try {
            await bot.sendMessage(chatId, strippedText, { parse_mode: 'Markdown' });
        } catch (sendErr) {
            console.log('Markdown parse error, falling back to plain text');
            await bot.sendMessage(chatId, strippedText);
        }

    } catch (error) {
        console.error('Error in main flow:', error);
        await bot.sendMessage(chatId, 'Estoy teniendo problemas técnicos. Inténtalo en unos minutos.');
    }
}

module.exports = {
    handleMainFlow
};
