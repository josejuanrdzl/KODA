require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Adding 'weather' module access to 'corporate' plan just in case...");

    const { data: planModules } = await supabase.from('plan_modules')
        .select('*')
        .eq('module_slug', 'weather')
        .eq('plan_slug', 'corporate');

    if (!planModules || planModules.length === 0) {
        await supabase.from('plan_modules').insert([{ plan_slug: 'corporate', module_slug: 'weather', is_included: true }]);
        console.log("Added 'weather' to 'corporate' plan.");
    } else {
        console.log("'corporate' plan already has 'weather'.");
    }

    // Also enable for 'business', 'team', and 'personal' because we love weather
    const plans = ['business', 'team', 'personal'];
    for (const p of plans) {
        const { data: pm } = await supabase.from('plan_modules')
            .select('*')
            .eq('module_slug', 'weather')
            .eq('plan_slug', p);
        if (!pm || pm.length === 0) {
            await supabase.from('plan_modules').insert([{ plan_slug: p, module_slug: 'weather', is_included: true }]);
        }
    }

    console.log("Done checking plans.");
}

run();
