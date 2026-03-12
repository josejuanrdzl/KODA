
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const TEST_USER_ID = '9786ab2b-31e3-48ff-a2e2-35e92dd5fcf6';

async function investigate() {
    console.log("--- Investigating User ---");
    const { data: user, error: userError } = await supabase.from('users').select('*').eq('id', TEST_USER_ID).single();
    if (userError) return console.error("User Error:", userError);
    console.log("User:", JSON.stringify(user, null, 2));

    if (user.tenant_id) {
        console.log("\n--- Investigating Tenant ---");
        const { data: tenant, error: tenantError } = await supabase.from('tenants').select('*').eq('id', user.tenant_id).single();
        if (tenantError) console.error("Tenant Error:", tenantError);
        else console.log("Tenant:", JSON.stringify(tenant, null, 2));
    }

    console.log("\n--- Investigating Plan Modules for 'free' and 'personal' ---");
    const { data: planModules, error: pmError } = await supabase.from('plan_modules').select('*').in('plan_slug', ['free', 'personal']);
    if (pmError) console.error("Plan Modules Error:", pmError);
    else console.log("Plan Modules:", JSON.stringify(planModules, null, 2));

    console.log("\n--- Investigating Tenant Modules ---");
    if (user.tenant_id) {
        const { data: tModules, error: tmError } = await supabase.from('tenant_modules').select('*').eq('tenant_id', user.tenant_id);
        if (tmError) console.error("Tenant Modules Error:", tmError);
        else console.log("Tenant Modules:", JSON.stringify(tModules, null, 2));
    }
}

investigate();
