require('dotenv').config({ path: '/Users/joserodriguez/KODA/.env' });
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data: moduleData, error: modErr } = await supabase.from('modules').select('*').eq('slug', 'spotify').single();
    console.log("Module error:", modErr);
    console.log("Module:", moduleData);

    const { data: plans, error: planErr } = await supabase.from('plan_modules').select('*').eq('module_slug', 'spotify');
    console.log("Plan modules error:", planErr);
    console.log("Plan modules:", plans);

    // Telegram ID is 390509861 based on logs
    const { data: user, error: userErr } = await supabase.from('users').select('*').eq('telegram_id', '390509861').single();
    console.log("User error:", userErr);
    console.log("User telegram:", user);

    if (user && user.tenant_id) {
        const { data: tenant } = await supabase.from('tenants').select('*').eq('id', user.tenant_id).single();
        console.log("Tenant:", tenant);

        let hasAccess = false;
        const planModules = plans.filter(pm => pm.plan_slug === tenant.plan && pm.is_included);
        if (planModules.length > 0) hasAccess = true;
        console.log("Has plan access:", hasAccess);
    }
}
check();
