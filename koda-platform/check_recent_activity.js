const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkRecentActivity() {
    console.log("Checking recent conversations...");
    const { data: convs, error } = await supabase
        .from('conversations')
        .select('user_id, content, created_at, role')
        .order('created_at', { ascending: false })
        .limit(20);
    
    if (error) {
        console.error("Error fetching conversations:", error);
        return;
    }

    const uniqueUserIds = [...new Set(convs.map(c => c.user_id))];
    console.log(`Unique users talking recently: ${uniqueUserIds}`);

    console.log("\nFetching details for 5 most recent messages:");
    for (const c of convs.slice(0, 5)) {
        console.log(`[${c.created_at}] User ${c.user_id} (${c.role}): ${c.content.substring(0, 50)}...`);
    }

    console.log("\nChecking User details for these users:");
    const { data: users } = await supabase
        .from('users')
        .select('id, name, tenant_id, plan')
        .in('id', uniqueUserIds);
    
    users.forEach(u => {
        console.log(`User: ${u.name} (ID: ${u.id}) | Tenant: ${u.tenant_id} | Plan: ${u.plan}`);
    });
}

checkRecentActivity();
