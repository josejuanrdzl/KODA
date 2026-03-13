const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
    console.error("SUPABASE_URL is missing in environment");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
    console.log("=== KODA PRODUCTION DEBUG ===");

    // 1. Check Plans and Modules
    const { data: planModules, error: pmErr } = await supabase.from('plan_modules').select('*');
    if (pmErr) console.error("Error fetching plan_modules:", pmErr);
    else {
        console.log("\n--- Plan Modules Mapping ---");
        const mapping = {};
        planModules.forEach(pm => {
            if (!mapping[pm.plan_slug]) mapping[pm.plan_slug] = [];
            mapping[pm.plan_slug].push(`${pm.module_slug} (${pm.is_included ? 'ENABLED' : 'DISABLED'})`);
        });
        console.log(JSON.stringify(mapping, null, 2));
    }

    // 2. Check main user
    console.log("\n--- Users ---");
    const { data: users, error: userErr } = await supabase.from('users').select('id, name, telegram_id, tenant_id, plan');
    if (userErr) console.error("Error fetching users:", userErr);
    else {
        users.forEach(u => {
            console.log(`User: ${u.name} | ID: ${u.id} | Telegram: ${u.telegram_id} | Tenant: ${u.tenant_id} | Plan: ${u.plan}`);
        });
    }

    // 3. Check Tenants
    console.log("\n--- Tenants ---");
    const { data: tenants, error: tErr } = await supabase.from('tenants').select('*');
    if (tErr) console.error("Error fetching tenants:", tErr);
    else console.log(JSON.stringify(tenants, null, 2));

    // 4. Check Tables Existence
    console.log("\n--- Table Schema Checks ---");
    const tables = ['family_members', 'family_activities', 'luna_cycles', 'shopping_items'];
    for (const table of tables) {
        const { data, error, count } = await supabase.from(table).select('*', { count: 'exact', head: true });
        if (error) {
            console.log(`❌ Table ${table}: ${error.message} (Code: ${error.code})`);
        } else {
            console.log(`✅ Table ${table}: Exists (${count} rows)`);
        }
    }

    process.exit(0);
}

debug();
