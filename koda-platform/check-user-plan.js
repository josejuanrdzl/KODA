require('dotenv').config({ path: '/Users/joserodriguez/KODA/.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: plans } = await supabase.from('plans').select('*');
    console.log("Plans table:", plans);
    const { data: user } = await supabase.from('users').select('plan, tenant_id').eq('telegram_id', '390509861').single();
    console.log("User:", user);
    if (user.tenant_id) {
        const { data: tenant } = await supabase.from('tenants').select('plan').eq('id', user.tenant_id).single();
        console.log("Tenant:", tenant);
    }
}
check();
