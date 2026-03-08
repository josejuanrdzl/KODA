const db = require('../services/supabase');
const { sendChannelMessage } = require('../utils/messenger');

// Funciones para el formato de rachas
function getStreakMessage(streak) {
    if (streak === 0) return "¡Hoy es el día 1, a darle!";
    if (streak >= 1 && streak <= 2) return `¡Buen inicio! Llevas ${streak} días.`;
    if (streak >= 3 && streak <= 6) return `🔥 Racha de ${streak} días. ¡Sigue así!`;
    if (streak >= 7 && streak <= 13) return `🔥🔥 ¡Una semana seguida! Llevas ${streak} días.`;
    if (streak >= 14 && streak <= 29) return `⚡ ¡Impresionante! Dos semanas sin parar (${streak} días).`;
    if (streak >= 30) return `🏆 ¡Un mes! Esto ya es un hábito real. Racha: ${streak} días.`;
    return `Llevas ${streak} días.`;
}

// b) CHECK-IN DIARIO
// Agrupa los hábitos y envía el mensaje de check-in
async function sendDailyCheckins(bot, groupedCheckins) {
    for (const [userId, items] of Object.entries(groupedCheckins)) {
        try {
            if (items.length === 0) continue;

            const telegramId = items[0].telegram_id;
            const whatsappId = items[0].whatsapp_id; // Suponiendo que items traen info de user
            const channel = items[0].channel || (whatsappId ? 'whatsapp' : 'telegram');
            const targetId = channel === 'whatsapp' ? whatsappId : telegramId;

            let message = "⏰ *Hora de tus check-ins de hábitos!*\n\n";

            if (items.length === 1) {
                message += `¿Hoy completaste: **${items[0].name}**?`;
            } else {
                message += `Hoy te toca reportar varios hábitos:\n`;
                items.forEach(h => {
                    message += `- ¿${h.name}?\n`;
                });
                message += `\nCuéntame cómo te fue con ellos.`;
            }

            await sendChannelMessage(bot, targetId, message, { parse_mode: 'Markdown' }, channel);

            // Guardamos la intención en memory para darle contexto inminente a Claude
            // de que estamos esperando una respuesta a este check-in.
            await db.updateUser(userId, { pending_habit_checkin: true });
        } catch (e) {
            console.error('Error enviando check-ins diarios al usuario:', userId, e);
        }
    }
}

// c) LISTAR HÁBITOS Comando /habitos
async function sendHabitsList(bot, chatId, userId, channel = 'telegram') {
    try {
        const habits = await db.getActiveHabits(userId);

        if (habits.length === 0) {
            return sendChannelMessage(bot, chatId, "No tienes hábitos activos que estés rastreando actualmente. ¡Dime qué hábito quieres empezar y lo configuro!", {}, channel);
        }

        let text = "📊 *Tus Hábitos Activos*\n\n";
        habits.forEach((h, i) => {
            text += `${i + 1}. **${h.name}**\n`;
            text += `   🔥 Racha Actual: ${h.current_streak} días (Récord: ${h.longest_streak})\n`;
            text += `   ⏰ Recordatorio: ${h.reminder_time.substring(0, 5)}\n\n`;
        });

        await sendChannelMessage(bot, chatId, text, { parse_mode: 'Markdown' }, channel);
    } catch (e) {
        console.error('Error listando hábitos:', e);
        sendChannelMessage(bot, chatId, 'Hubo un error al recuperar tus hábitos.', {}, channel);
    }
}

// d) RESUMEN SEMANAL DE HÁBITOS
async function getWeeklySummary(userId) {
    const habits = await db.getActiveHabits(userId);
    if (!habits || habits.length === 0) return "No hay hábitos activos para resumir.";

    let summary = "📈 *Resumen de Hábitos*\n";
    habits.forEach(h => {
        summary += `- **${h.name}**: Racha de ${h.current_streak} días. Total: ${h.total_completions}.\n`;
    });
    return summary;
}

module.exports = {
    getStreakMessage,
    sendDailyCheckins,
    sendHabitsList,
    getWeeklySummary
};
