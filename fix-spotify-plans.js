require('dotenv').config({ path: '/Users/joserodriguez/KODA/.env' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Adding 'spotify' module access to plans...");

    const plans = ['personal', 'team', 'business', 'enterprise'];
    const moduleSlug = 'spotify';

    // 1. Ensure the module exists in 'modules' table
    const { data: moduleData } = await supabase.from('modules').select('*').eq('slug', moduleSlug).maybeSingle();
    if (!moduleData) {
        const { error: insertErr } = await supabase.from('modules').insert([{
            slug: moduleSlug,
            name: 'Spotify',
            description: 'Búsqueda y recomendaciones musicales mediante Spotify'
        }]);
        if (insertErr) {
            console.error(`Failed to create module:`, insertErr);
        } else {
            console.log(`Created new module: ${moduleSlug}`);
        }
    } else {
        console.log(`Module ${moduleSlug} already exists.`);
    }

    // 2. Add to all plans
    for (const p of plans) {
        const { data: pm } = await supabase.from('plan_modules')
            .select('*')
            .eq('module_slug', moduleSlug)
            .eq('plan_slug', p);
        if (!pm || pm.length === 0) {
            const { error: pmErr } = await supabase.from('plan_modules').insert([{ plan_slug: p, module_slug: moduleSlug, is_included: true }]);
            if (pmErr) {
                console.error(`Error adding to plan ${p}:`, pmErr);
            } else {
                console.log(`Added '${moduleSlug}' to plan '${p}'.`);
            }
        } else {
            console.log(`Plan '${p}' already has '${moduleSlug}'.`);
        }
    }

    console.log("Done configuring spotify plan access.");
}

run();
