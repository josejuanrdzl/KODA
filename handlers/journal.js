const db = require('../services/supabase');
const { sendChannelMessage } = require('../utils/messenger');

async function handleJournalCommand(bot, chatId, user, param, channel = 'telegram') {
    if (param === 'hoy') {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const { data: entries } = await db.supabase
            .from('journal_entries')
            .select('*')
            .eq('user_id', user.id)
            .gte('created_at', todayStart.toISOString())
            .lte('created_at', todayEnd.toISOString())
            .limit(1);

        if (entries && entries.length > 0) {
            const current = entries[0];
            await sendChannelMessage(bot, chatId, `📓 *Tu Diario de Hoy:*\n\nResumen: ${current.summary}\nHumor: ${current.mood_label} (${current.mood_score}/10)\n\nOriginal:\n_${current.content}_`, { parse_mode: 'Markdown' }, channel);
        } else {
            await sendChannelMessage(bot, chatId, '📓 Aún no has escrito nada hoy en tu diario. Escribe tu experiencia y KODA la guardará. (Si usas reflexión emocional, lo detectará automáticamente).', {}, channel);
        }
    } else {
        // Resumen últimos 7 días
        const entries = await db.getRecentJournalEntries(user.id, 7);
        if (entries.length === 0) {
            await sendChannelMessage(bot, chatId, '📓 No tienes entradas recientes en tu diario. ¡Escribe sobre tu día para empezar!', {}, channel);
        } else {
            const sumText = entries.map(e => `*${new Date(e.created_at).toLocaleDateString('es-MX', { weekday: 'short', month: 'short', day: 'numeric' })}*: ${e.mood_label} (${e.mood_score}/10) - _${e.summary}_`).join('\n\n');
            await sendChannelMessage(bot, chatId, `📓 *Tus últimos días:*\n\n${sumText}\n\nEscribe \`/diario hoy\` para ver el detalle de hoy.`, { parse_mode: 'Markdown' }, channel);
        }
    }
}

module.exports = {
    handleJournalCommand
};
