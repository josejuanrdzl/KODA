const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkPersonalPlanModules() {
    console.log("--- Checking plan_modules for 'personal' plan ---");
    const { data, error } = await supabase
        .from('plan_modules')
        .select('*')
        .eq('plan_slug', 'personal');
    
    if (error) {
        console.error("Error:", error);
    } else {
        console.log(`Found ${data.length} modules for personal plan:`);
        data.forEach(m => {
            console.log(` - Module: ${m.module_slug} | Included: ${m.is_included}`);
        });
    }
}

checkPersonalPlanModules();
