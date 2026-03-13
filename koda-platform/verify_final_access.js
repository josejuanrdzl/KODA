const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function verify() {
    console.log("Checking Modules...");
    const { data: modules } = await supabase.from('modules').select('slug, name');
    console.log("Registered Modules:", modules.map(m => m.slug));

    console.log("\nChecking Tenants and their Plans...");
    const { data: tenants } = await supabase.from('tenants').select('id, name, plan');
    console.log("Tenants:", tenants);

    const planSlugs = [...new Set(tenants.map(t => t.plan))];
    console.log("\nUnique Plan Slugs in Tenants:", planSlugs);

    console.log("\nChecking Plan Modules for these plans...");
    const { data: planModules } = await supabase
        .from('plan_modules')
        .select('plan_slug, module_slug, is_included')
        .in('plan_slug', planSlugs);

    planSlugs.forEach(plan => {
        const modulesForPlan = planModules.filter(pm => pm.plan_slug === plan);
        console.log(`\nPlan: ${plan}`);
        modulesForPlan.forEach(pm => {
            console.log(` - ${pm.module_slug}: ${pm.is_included ? 'ENABLED' : 'DISABLED'}`);
        });
    });

    console.log("\nChecking if 'gmail' and 'calendar' are in registered modules...");
    const hasGmail = modules.some(m => m.slug === 'gmail');
    const hasCalendar = modules.some(m => m.slug === 'calendar');
    console.log(`Gmail registered: ${hasGmail}`);
    console.log(`Calendar registered: ${hasCalendar}`);
}

verify();
