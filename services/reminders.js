const cron = require('node-cron');
const db = require('./supabase');

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
                    if (telegramId) {
                        const message = `⏰ ¡Recordatorio! ${reminder.content}. ¿Ya lo hiciste o lo pospongo?`;

                        // Enviar mensaje por telegram
                        await bot.sendMessage(telegramId, message);

                        // Marcar como enviado
                        await db.markReminderSent(reminder.id);

                        // Guardar en la conversación (opcional, como KODA)
                        await db.saveMessage({
                            user_id: reminder.user_id,
                            channel: reminder.channel || 'telegram',
                            role: 'assistant',
                            content: message,
                            content_type: 'text'
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Error en el cron de recordatorios:', error);
        }
    });

    console.log('Cron de recordatorios inicializado (ejecución cada minuto).');
}

module.exports = {
    startCron
};
