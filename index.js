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
const proactive = require('./services/proactive');

const { handleCommand } = require('./handlers/commands');
const { handleOnboarding } = require('./handlers/onboarding');
const { handleMainFlow } = require('./handlers/main');

const app = express();

// Webhook for Stripe needs raw body parser BEFORE express.json()
const stripeWebhook = require('./routes/webhook-stripe');
app.use('/webhook-stripe', express.raw({ type: 'application/json' }), stripeWebhook);

// Webhook for Twilio WhatsApp (needs urlencoded parser)
const whatsappWebhook = require('./routes/webhook-whatsapp');
app.use('/webhook-whatsapp', express.urlencoded({ extended: false }), whatsappWebhook);

app.use(express.json());
app.use(express.static('public')); // Serve the web portal files

const token = process.env.TELEGRAM_BOT_TOKEN;
// Solo usaremos webhook
const bot = new TelegramBot(token);
module.exports = { bot }; // Export bot early for routes

// Registration API
const registrationRoutes = require('./routes/registration');
app.use('/api', registrationRoutes);

// Admin API
const adminRoutes = require('./routes/admin');
app.use('/api/admin', adminRoutes);

app.post('/webhook', async (req, res) => {
    res.sendStatus(200); // Responder OK rápido a Telegram

    const update = req.body;

    if (!update.message) return; // Ignore updates that aren't messages for now

    const msg = update.message;
    // Procesar texto, voz, audio o video_note
    if (!msg.text && !msg.voice && !msg.audio && !msg.video_note) {
        await bot.sendMessage(msg.chat.id, "Por ahora solo proceso texto o notas de voz/video. Las imágenes y otros elementos están en mi roadmap.");
        return;
    }

    const telegramId = msg.from.id.toString();

    try {
        // 1. Buscar o crear usuario
        let user = await db.getUserByTelegramId(telegramId);

        const currentUsername = msg.from.username ? msg.from.username.toLowerCase() : null;

        if (!user) {
            user = await db.createUser({
                telegram_id: telegramId,
                telegram_username: currentUsername,
                // Algunos campos opcionales que extraemos de telegram por default
                name: msg.from.first_name || 'Nuevo Usuario',
            });
        } else if (user.telegram_username !== currentUsername && currentUsername) {
            // Actualizar username si no lo tenía o si cambió, para asegurar que el portal web lo pueda encontrar
            await db.updateUser(user.id, { telegram_username: currentUsername });
            user.telegram_username = currentUsername;
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
const stripeService = require('./services/stripe');

app.listen(process.env.PORT || 3000, async () => {
    console.log(`[KODA] Servidor KODA v0.1 iniciado en el puerto ${process.env.PORT || 3000}`);

    // Auto-crear productos y precios en Stripe si no existen
    await stripeService.initStripeProducts();
    // Iniciar Cron Job
    reminders.startCron(bot);
    proactive.startCron(bot);
});
