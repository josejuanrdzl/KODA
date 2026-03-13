if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config({ ignoreEnvFile: true, silent: true });
}
const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy', {
    apiVersion: '2023-10-16',
});

// Cache for price IDs
let priceIds = {
    basic: { usd: null, mxn: null },
    executive: { usd: null, mxn: null },
    corporate: { usd: null, mxn: null }
};

const PLAN_DETAILS = {
    basic: { name: 'KODA Basic', usd: 499, mxn: 9900 },
    executive: { name: 'KODA Executive', usd: 1299, mxn: 24900 },
    corporate: { name: 'KODA Corporate', usd: 2499, mxn: 49900 }
};

async function initStripeProducts() {
    console.log('Verifying Stripe products and prices...');
    try {
        const products = await stripe.products.list({ active: true });

        for (const [planKey, details] of Object.entries(PLAN_DETAILS)) {
            let product = products.data.find(p => p.name === details.name);

            if (!product) {
                console.log(`Creating product: ${details.name}`);
                product = await stripe.products.create({
                    name: details.name,
                    description: `Suscripción a ${details.name}`
                });
            }

            const prices = await stripe.prices.list({ product: product.id, active: true });

            // USD Price
            let usdPrice = prices.data.find(p => p.currency === 'usd' && p.unit_amount === details.usd);
            if (!usdPrice) {
                console.log(`Creating USD price for ${details.name}`);
                usdPrice = await stripe.prices.create({
                    product: product.id,
                    unit_amount: details.usd,
                    currency: 'usd',
                    recurring: { interval: 'month' }
                });
            }
            priceIds[planKey].usd = usdPrice.id;

            // MXN Price
            let mxnPrice = prices.data.find(p => p.currency === 'mxn' && p.unit_amount === details.mxn);
            if (!mxnPrice) {
                console.log(`Creating MXN price for ${details.name}`);
                mxnPrice = await stripe.prices.create({
                    product: product.id,
                    unit_amount: details.mxn,
                    currency: 'mxn',
                    recurring: { interval: 'month' }
                });
            }
            priceIds[planKey].mxn = mxnPrice.id;
        }
        console.log('Stripe products initialized.', priceIds);
    } catch (error) {
        console.error('Error initializing Stripe products:', error.message);
    }
}

async function createCustomer(email, name, metadata) {
    return await stripe.customers.create({
        email,
        name,
        metadata
    });
}

async function createSubscriptionWithTrial(customerId, planKey, currency, paymentMethodId) {
    const priceId = priceIds[planKey.toLowerCase()]?.[currency.toLowerCase()];
    if (!priceId) throw new Error(`Price ID not found for plan ${planKey} in ${currency}`);

    // Attach payment method to customer and set as default
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId }
    });

    return await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        trial_period_days: 3,
        metadata: { plan: planKey }
    });
}

async function getSubscription(subscriptionId) {
    return await stripe.subscriptions.retrieve(subscriptionId);
}

async function createPortalSession(customerId, returnUrl) {
    return await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
    });
}

module.exports = {
    stripe,
    initStripeProducts,
    createCustomer,
    createSubscriptionWithTrial,
    getSubscription,
    createPortalSession,
    priceIds
};
