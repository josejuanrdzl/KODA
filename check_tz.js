require('dotenv').config();
const { supabase } = require('./services/supabase');

async function check() {
    const { data, error } = await supabase.from('users').select('id, name, timezone');
    console.log(JSON.stringify(data, null, 2));
    process.exit(0);
}
check();
