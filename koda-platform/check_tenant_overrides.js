const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkTenantModules() {
    console.log("Checking tenant_modules table...");
    const { data: overrides, error } = await supabase.from('tenant_modules').select('*');
    if (error) {
        console.error("Error fetching overrides:", error);
        return;
    }

    if (overrides.length === 0) {
        console.log("No explicit overrides found in tenant_modules.");
    } else {
        overrides.forEach(o => {
            console.log(`Tenant: ${o.tenant_id} | Module: ${o.module_slug} | Enabled: ${o.enabled_at} | Disabled: ${o.disabled_at}`);
        });
    }
}

checkTenantModules();
