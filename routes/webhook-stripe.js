const express = require('express');
const router = express.Router();
const stripeService = require('../services/stripe');
const db = require('../services/supabase');
const { bot } = require('../index');

router.post('/', express.raw({ type: 'application/json' }), async (request, response) => {
    const sig = request.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
        event = stripeService.stripe.webhooks.constructEvent(request.body, sig, endpointSecret);
    } catch (err) {
        console.error(`Webhook Error: ${err.message}`);
        response.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }

    // Handle the event
    switch (event.type) {
        case 'customer.subscription.updated': {
            const subscription = event.data.object;
            await handleSubscriptionUpdated(subscription);
            break;
        }
        case 'customer.subscription.deleted': {
            const subscription = event.data.object;
            await handleSubscriptionDeleted(subscription);
            break;
        }
        case 'invoice.payment_succeeded': {
            const invoice = event.data.object;
            if (invoice.subscription) {
                const subscription = await stripeService.getSubscription(invoice.subscription);
                await handleSubscriptionUpdated(subscription);
            }
            break;
        }
        case 'invoice.payment_failed': {
            const invoice = event.data.object;
            if (invoice.subscription) {
                await handlePaymentFailed(invoice);
            }
            break;
        }
        case 'customer.subscription.trial_will_end': {
            const subscription = event.data.object;
            await handleTrialWillEnd(subscription);
            break;
        }
        default:
            console.log(`Unhandled event type ${event.type}`);
    }

    response.send();
});

async function handleSubscriptionUpdated(subscription) {
    const customerId = subscription.customer;
    const { data: users } = await db.supabase.from('users').select('*').eq('stripe_customer_id', customerId).limit(1);
    if (!users || users.length === 0) return;
    const user = users[0];

    const plan = subscription.metadata.plan || 'basic';
    let status = 'active';

    if (subscription.status === 'trialing') status = 'trial';
    else if (subscription.status === 'past_due' || subscription.status === 'unpaid') status = 'suspended';
    else if (subscription.status === 'canceled') status = 'cancelled';

    await db.updateUser(user.id, {
        plan: plan,
        plan_status: status,
        stripe_subscription_id: subscription.id
    });

    // Also upsert to subscriptions table
    const { data: existingSub } = await db.supabase.from('subscriptions').select('id').eq('stripe_subscription_id', subscription.id).limit(1);
    const subData = {
        user_id: user.id,
        plan: plan,
        status: status,
        currency: subscription.currency,
        amount: subscription.items.data[0].price.unit_amount / 100,
        stripe_subscription_id: subscription.id,
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null
    };

    if (existingSub && existingSub.length > 0) {
        await db.supabase.from('subscriptions').update(subData).eq('id', existingSub[0].id);
    } else {
        await db.supabase.from('subscriptions').insert([subData]);
    }
}

async function handleSubscriptionDeleted(subscription) {
    const customerId = subscription.customer;
    const { data: users } = await db.supabase.from('users').select('*').eq('stripe_customer_id', customerId).limit(1);
    if (!users || users.length === 0) return;
    const user = users[0];

    await db.updateUser(user.id, { plan_status: 'cancelled', plan: 'starter' });
    if (bot) {
        await bot.sendMessage(user.telegram_id, 'Tu suscripción ha sido cancelada. Tu cuenta ha vuelto al plan básico gratuito.', { parse_mode: 'Markdown' }).catch(() => { });
    }
}

async function handlePaymentFailed(invoice) {
    const customerId = invoice.customer;
    const { data: users } = await db.supabase.from('users').select('*').eq('stripe_customer_id', customerId).limit(1);
    if (!users || users.length === 0) return;
    const user = users[0];

    await db.updateUser(user.id, { plan_status: 'suspended' });
    const portalUrl = `${process.env.BASE_URL}/portal.html`;

    if (bot) {
        await bot.sendMessage(user.telegram_id, `⚠️ No pudimos procesar tu pago. Tu cuenta está suspendida.\n\nActualiza tu método de pago aquí: ${portalUrl}`, { parse_mode: 'Markdown' }).catch(() => { });
    }
}

async function handleTrialWillEnd(subscription) {
    const customerId = subscription.customer;
    const { data: users } = await db.supabase.from('users').select('*').eq('stripe_customer_id', customerId).limit(1);
    if (!users || users.length === 0) return;
    const user = users[0];

    const endDate = new Date(subscription.trial_end * 1000).toLocaleDateString('es-MX');
    const amount = (subscription.items.data[0].price.unit_amount / 100).toFixed(2);
    const currency = subscription.currency.toUpperCase();

    if (bot) {
        await bot.sendMessage(user.telegram_id, `⏰ Tu trial termina en 2 días. El ${endDate} se cobrará $${amount} ${currency} a tu tarjeta.\n\n¿Tienes alguna pregunta?`, { parse_mode: 'Markdown' }).catch(() => { });
    }
}

module.exports = router;
