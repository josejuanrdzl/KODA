const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: tenants, error } = await supabase.from('tenants').select('plan').limit(100);
    if (error) {
        console.error('Error fetching tenants:', error);
        return;
    }
    const plans = [...new Set(tenants.map(t => t.plan))];
    console.log('Plans found in tenants table:', plans);
}

check();
