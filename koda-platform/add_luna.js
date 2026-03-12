require("dotenv").config({ path: "/Users/joserodriguez/KODA/.env" });
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function addLunaAccess() {
    console.log("Inserting into 'modules' table...");
    const { error: modInsertErr } = await supabase
        .from('modules')
        .upsert([{
            slug: 'luna',
            name: 'Luna',
            description: 'Clima femenino y ciclo menstrual',
            is_public: true
        }], { onConflict: 'slug' });

    if (modInsertErr) {
        console.error("Error inserting into modules:", modInsertErr);
        return;
    }

    console.log("Fetching active plans...");
    const { data: plans, error: planErr } = await supabase
        .from('plans')
        .select('*');

    if (planErr) {
        console.error("Error fetching plans:", planErr);
        return;
    }

    const uniquePlans = [...new Set(plans.map(p => p.slug))];
    console.log("Plans to update:", uniquePlans);

    const modulesToUpsert = [];
    for (const plan of uniquePlans) {
        modulesToUpsert.push({
            plan_slug: plan,
            module_slug: 'luna',
            is_included: true
        });
    }

    console.log("Upserting luna for all plans...");
    const { error: upsertErr } = await supabase
        .from('plan_modules')
        .upsert(modulesToUpsert, { onConflict: 'plan_slug, module_slug' });

    if (upsertErr) {
        console.error("Error upserting luna:", upsertErr);
    } else {
        console.log("Successfully added luna access to all plans!");
    }
}

addLunaAccess();
