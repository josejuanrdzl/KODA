const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data, error } = await supabase.from('users').select('active_context').limit(1);
    if (error) console.error(error);
    console.log('Sample active_context:', JSON.stringify(data[0]?.active_context));
}
check();
