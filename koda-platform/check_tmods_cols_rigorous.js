const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkTenantModulesColumns() {
    console.log("--- Checking tenant_modules columns rigorously ---");
    // Get one row to see columns
    const { data, error } = await supabase.from('tenant_modules').select('*').limit(1);
    
    // If table is empty, we might not get columns this way.
    // Let's try to query specifically the common columns we use.
    const columnsToTest = ['id', 'tenant_id', 'module_slug', 'enabled_at', 'disabled_at', 'enabled'];
    
    for (const col of columnsToTest) {
        const { error: colErr } = await supabase.from('tenant_modules').select(col).limit(1);
        if (colErr) {
            console.log(`Column '${col}': NOT FOUND (${colErr.message})`);
        } else {
            console.log(`Column '${col}': FOUND`);
        }
    }
}

checkTenantModulesColumns();
