const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkUsers() {
    console.log("Checking Users table...");
    const { data: users, error } = await supabase.from('users').select('id, name, tenant_id, plan');
    if (error) {
        console.error("Error fetching users:", error);
        return;
    }

    users.forEach(u => {
        console.log(`User: ${u.name} (ID: ${u.id})`);
        console.log(` - Tenant ID: ${u.tenant_id}`);
        console.log(` - Plan: ${u.plan}`);
    });

    console.log("\nChecking Tenants table...");
    const { data: tenants } = await supabase.from('tenants').select('id, name, plan');
    console.log("Tenants:", tenants);
}

checkUsers();
