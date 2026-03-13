const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function inspectSchema() {
    console.log("--- Inspecting 'plans' table ---");
    const { data: plans, error: plansErr } = await supabase.from('plans').select('*');
    if (plansErr) console.error(plansErr);
    else console.log("Plans:", plans);

    console.log("\n--- Inspecting 'tenant_modules' table structure (sample) ---");
    const { data: tMods, error: tErr } = await supabase.from('tenant_modules').select('*').limit(1);
    if (tErr) console.error("Error fetching tenant_modules:", tErr);
    else {
        console.log("Tenant Modules row sample:", tMods[0]);
        console.log("Available columns:", Object.keys(tMods[0] || {}));
    }

    console.log("\n--- Inspecting 'modules' table ---");
    const { data: mods, error: mErr } = await supabase.from('modules').select('*');
    if (mErr) console.error(mErr);
    else console.log("Modules:", mods.map(m => ({ id: m.id, slug: m.slug, name: m.name })));
}

inspectSchema();
