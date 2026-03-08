const express = require('express');
const router = express.Router();
const stripeService = require('../services/stripe');
const db = require('../services/supabase');
const { bot } = require('../index');

router.post('/register', express.json(), async (req, res) => {
    try {
        const { telegram_username, name, email, payment_method_id, plan, currency } = req.body;

        if (!telegram_username || !name || !email || !payment_method_id || !plan || !currency) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Find user by username or whatsapp_id
        const cleanUsername = telegram_username.replace('@', '').toLowerCase().trim();

        // Let's find the user by username or whatsapp_id
        const { data: users, error: dbError } = await db.supabase
            .from('users')
            .select('*')
            .or(`telegram_username.ilike.%${cleanUsername}%,whatsapp_id.ilike.%${cleanUsername}%`)
            .limit(1);

        if (dbError) throw dbError;
        if (!users || users.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado. Por favor, asegúrate de haber hablado con KODA primero y usar tu @usuario exacto o número de WhatsApp (ej. +52...).' });
        }

        const user = users[0];

        // Ensure user is not already subscribed to a paid plan
        if (user.plan !== 'starter' && user.plan_status !== 'cancelled') {
            return res.status(400).json({ error: 'Ya tienes una suscripción activa.' });
        }

        // 1. Create Stripe Customer
        const customer = await stripeService.createCustomer(email, name, {
            telegram_id: user.telegram_id ? user.telegram_id.toString() : '',
            whatsapp_id: user.whatsapp_id ? user.whatsapp_id.toString() : '',
            user_id: user.id
        });

        // 2. Create Subscription with Trial
        const subscription = await stripeService.createSubscriptionWithTrial(
            customer.id,
            plan,
            currency,
            payment_method_id
        );

        // 3. Update Database
        const trialEndDate = new Date(subscription.trial_end * 1000);

        await db.updateUser(user.id, {
            stripe_customer_id: customer.id,
            stripe_subscription_id: subscription.id,
            plan: plan,
            plan_status: 'trial',
            trial_ends_at: trialEndDate.toISOString(),
            billing_currency: currency
        });

        // 4. Notify via Telegram or WhatsApp
        const formatter = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' });
        const amount = (subscription.items.data[0].price.unit_amount / 100).toFixed(2);

        if (bot) {
            const msg = `¡Listo! Tu trial de 3 días comenzó. El ${formatter.format(trialEndDate)} se hará el primer cobro de $${amount} ${currency.toUpperCase()}.\n\n¡Disfruta KODA al máximo!`;
            const channel = user.whatsapp_id ? 'whatsapp' : 'telegram';
            const chatId = channel === 'whatsapp' ? user.whatsapp_id : user.telegram_id;
            const { sendChannelMessage } = require('../utils/messenger');
            await sendChannelMessage(bot, chatId, msg, {}, channel).catch(() => { });
        }

        res.json({ success: true, message: 'Suscripción creada exitosamente.' });
    } catch (error) {
        console.error('Registration Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

router.post('/portal', express.json(), async (req, res) => {
    try {
        const { telegram_username } = req.body;
        const cleanUsername = telegram_username.replace('@', '').toLowerCase().trim();

        const { data: users } = await db.supabase
            .from('users')
            .select('stripe_customer_id')
            .or(`telegram_username.ilike.%${cleanUsername}%,whatsapp_id.ilike.%${cleanUsername}%`)
            .limit(1);

        if (!users || users.length === 0 || !users[0].stripe_customer_id) {
            return res.status(404).json({ error: 'No se encontró un cliente activo para ese usuario.' });
        }

        const session = await stripeService.createPortalSession(
            users[0].stripe_customer_id,
            `${process.env.BASE_URL}/portal.html`
        );

        res.json({ url: session.url });
    } catch (error) {
        console.error('Portal Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
