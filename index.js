if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config({ ignoreEnvFile: true, silent: true });
}
console.log('--- DEBUG: ENTORNO DISPONIBLE EN RAILWAY ---');
console.log(Object.keys(process.env).join(', '));
console.log('--------------------------------------------');
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const db = require('./services/supabase');
const reminders = require('./services/reminders');

const { handleCommand } = require('./handlers/commands');
const { handleOnboarding } = require('./handlers/onboarding');
const { handleMainFlow } = require('./handlers/main');

const app = express();
app.use(express.json());

const token = process.env.TELEGRAM_BOT_TOKEN;
// Solo usaremos webhook
const bot = new TelegramBot(token);

app.post('/webhook', async (req, res) => {
    res.sendStatus(200); // Responder OK rápido a Telegram

    const update = req.body;

    if (!update.message) return; // Ignore updates that aren't messages for now

    const msg = update.message;
    // Solo procesamos texto por ahora, como solicitó el usuario en la fase 1 (omitir audio)
    if (!msg.text) {
        if (msg.voice) {
            await bot.sendMessage(msg.chat.id, "Por ahora solo proceso texto. El soporte de voz vendrá en una próxima actualización.");
            return;
        }
        await bot.sendMessage(msg.chat.id, "Por ahora solo proceso texto. Las imágenes y otros elementos están en mi roadmap.");
        return;
    }

    const telegramId = msg.from.id.toString();

    try {
        // 1. Buscar o crear usuario
        let user = await db.getUserByTelegramId(telegramId);

        if (!user) {
            user = await db.createUser({
                telegram_id: telegramId,
                // Algunos campos opcionales que extraemos de telegram por default
                name: msg.from.first_name || 'Nuevo Usuario',
            });
        }

        // 2. Revisar estado de onboarding
        if (!user.onboarding_complete) {
            await handleOnboarding(bot, msg, user);
            return;
        }

        // 3. Revisar Comandos Explícitos
        const isCommand = await handleCommand(bot, msg, user);
        if (isCommand) {
            return;
        }

        // 4. Flujo Principal (Claude)
        await handleMainFlow(bot, msg, user);

    } catch (error) {
        console.error('Error procesando mensaje:', error);
        await bot.sendMessage(msg.chat.id, "Ocurrió un error inesperado. Intenta nuevamente en unos momentos.");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`[KODA] Servidor KODA v0.1 iniciado en el puerto ${PORT}`);
    // Iniciar Cron Job
    reminders.startCron(bot);
});
