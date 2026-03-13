const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const { data: plans, error: plansErr } = await supabase.from('plans').select('slug');
    const { data: modules, error: modsErr } = await supabase.from('modules').select('slug');

    if (plansErr || modsErr) {
        console.error('Error fetching plans/modules:', plansErr || modsErr);
        return;
    }

    const planSlugs = plans.map(p => p.slug);
    const moduleSlugs = modules.map(m => m.slug);

    console.log(`Granting ${moduleSlugs.length} modules to ${planSlugs.length} plans...`);

    for (const plan of planSlugs) {
        for (const mod of moduleSlugs) {
            const { error } = await supabase
                .from('plan_modules')
                .upsert({
                    plan_slug: plan,
                    module_slug: mod,
                    is_included: true,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'plan_slug, module_slug' });

            if (error) {
                console.error(`Failed to grant "${mod}" to "${plan}":`, error.message);
            } else {
                process.stdout.write('.');
            }
        }
    }
    console.log('\nDone!');
}

run();
