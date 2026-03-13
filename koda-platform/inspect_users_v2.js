const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function inspectUsers() {
    console.log("--- Inspecting 'users' table structure ---");
    const { data: users, error: uErr } = await supabase.from('users').select('*').limit(1);
    if (uErr) console.error("Error fetching users:", uErr);
    else {
        console.log("Users row sample:", users[0]);
        console.log("Available columns:", Object.keys(users[0] || {}));
    }
}

inspectUsers();
