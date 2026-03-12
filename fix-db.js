require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Fetching all users...");
    const { data: users, error } = await supabase.from('users').select('*');

    if (error) {
        console.error("Error fetching users:", error);
        return;
    }

    console.log(`Found ${users.length} users. Checking for missing tenant_id or plan...`);

    // Setup default tenant
    let defaultTenantId;
    const { data: tenants } = await supabase.from('tenants').select('*').limit(1);
    if (tenants && tenants.length > 0) {
        defaultTenantId = tenants[0].id;
    } else {
        const { data: newTenant, error: tErr } = await supabase.from('tenants')
            .insert([{ name: 'KODA Default', status: 'active', plan: 'personal' }])
            .select()
            .single();
        if (newTenant) defaultTenantId = newTenant.id;
        else {
            console.error("Error creating default tenant:", tErr);
            return;
        }
    }

    // Ensure 'free' plan has 'weather'
    const { data: planModules } = await supabase.from('plan_modules').select('*').eq('module_slug', 'weather').eq('plan_slug', 'free');
    if (!planModules || planModules.length === 0) {
        await supabase.from('plan_modules').insert([{ plan_slug: 'free', module_slug: 'weather', is_included: true }]);
    }

    let updatedCount = 0;

    for (const user of users) {
        let needsUpdate = false;
        let updateData = {};

        if (!user.tenant_id) {
            updateData.tenant_id = defaultTenantId;
            needsUpdate = true;
        }

        // Assign 'free' plan if they don't have one, or if they have a weird plan that might not be mapped.
        // For safety, we'll just ensure they have a plan. If we want to force everyone to a working plan for dev:
        if (!user.plan) {
            updateData.plan = 'free';
            needsUpdate = true;
        }

        if (needsUpdate) {
            console.log(`Updating user ${user.id} (${user.telegram_id || user.whatsapp_id || 'unknown'}):`, updateData);
            const { error: updateError } = await supabase.from('users').update(updateData).eq('id', user.id);
            if (updateError) {
                console.error(`Failed to update user ${user.id}:`, updateError);
            } else {
                updatedCount++;
            }
        }
    }

    console.log(`Finished processing. Updated ${updatedCount} users.`);
}

run();
