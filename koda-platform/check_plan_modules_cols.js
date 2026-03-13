const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkPlanModulesSchema() {
    console.log("--- Checking plan_modules columns ---");
    const { data, error } = await supabase.from('plan_modules').select('*').limit(1);
    if (error) {
        console.error("Error:", error);
    } else {
        if (data && data.length > 0) {
            console.log("Columns:", Object.keys(data[0]));
        } else {
            console.log("No rows found in plan_modules.");
            // Try to get columns by inserting/selecting something or use a better way if available
            // but for now, let's just see if we can get any data.
        }
    }
}

checkPlanModulesSchema();
