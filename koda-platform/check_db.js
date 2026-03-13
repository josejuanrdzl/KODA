require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data: plans } = await supabase.from('plan_modules').select('*').in('module_slug', ['sports', 'spotify', 'weather', 'fx-rates', 'luna']);
    console.log('Modules in plan_modules:', plans);

    // Check what plans exist
    const { data: allPlans } = await supabase.from('plan_modules').select('plan_slug').limit(10);
    const uniquePlans = [...new Set(allPlans.map(p => p.plan_slug))];
    console.log('Unique active plans:', uniquePlans);

    if (!plans || !plans.find(p => p.module_slug === 'sports')) {
        console.log('Sports module missing for some plans!');
        for (const plan of uniquePlans) {
            await supabase.from('plan_modules').upsert({
                plan_slug: plan,
                module_slug: 'sports',
                is_included: true
            });
        }
        console.log('Inserted sports module for plans!');
    }
}
check();
