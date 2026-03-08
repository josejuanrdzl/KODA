const cron = require('node-cron');
const db = require('./supabase');
const { sendDailyCheckins } = require('../handlers/habits');
const { sendChannelMessage } = require('../utils/messenger');

function startCron(bot) {
    // Ejecutar cada minuto
    cron.schedule('* * * * *', async () => {
        try {
            // Obtener todos los recordatorios activos
            const reminders = await db.getActiveReminders();
            const now = new Date();

            for (const reminder of reminders) {
                const remindAt = new Date(reminder.remind_at);

                // Si el timestamp del recordatorio ya pasó o es ahora
                if (remindAt <= now) {
                    const telegramId = reminder.users?.telegram_id;
                    const whatsappId = reminder.users?.whatsapp_id;
                    const channel = whatsappId ? 'whatsapp' : 'telegram';
                    const targetId = channel === 'whatsapp' ? whatsappId : telegramId;

                    if (targetId) {
                        const message = `⏰ ¡Recordatorio! ${reminder.content}. ¿Ya lo hiciste o lo pospongo?`;

                        // Enviar mensaje por canal
                        await sendChannelMessage(bot, targetId, message, {}, channel);

                        // Marcar como enviado
                        await db.markReminderSent(reminder.id);

                        // Guardar en la conversación (opcional, como KODA)
                        await db.saveMessage({
                            user_id: reminder.user_id,
                            channel: channel,
                            role: 'assistant',
                            content: message,
                            content_type: 'text'
                        });
                    }
                }
            }

            // --- HABIT CHECK-INS ---
            // Formatear la hora actual en HH:mm:00 (hora local del servidor)
            const hours = now.getHours().toString().padStart(2, '0');
            const minutes = now.getMinutes().toString().padStart(2, '0');
            const currentTimeString = `${hours}:${minutes}:00`;

            const habitsDue = await db.getHabitsDueNow(currentTimeString);

            if (habitsDue.length > 0) {
                // Agrupar por user_id
                const groupedByUserId = {};
                for (const habit of habitsDue) {
                    if (!groupedByUserId[habit.user_id]) {
                        groupedByUserId[habit.user_id] = [];
                    }
                    // Avoid duplicating check-ins if they were already logged today
                    const loggedToday = await db.checkHabitLogExistsToday(habit.id);
                    if (!loggedToday) {
                        groupedByUserId[habit.user_id].push(habit);
                    }
                }

                await sendDailyCheckins(bot, groupedByUserId);
            }

        } catch (error) {
            console.error('Error en el cron de recordatorios o hábitos:', error);
        }
    });

    console.log('Cron de recordatorios y hábitos inicializado (ejecución cada minuto).');
}

module.exports = {
    startCron
};
