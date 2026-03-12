require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function insertMissing() {
    const uniquePlans = ['personal', 'team', 'business', 'enterprise'];
    const modulesToAdd = ['weather', 'luna', 'journal', 'habits', 'message_analysis'];

    console.log('Inserting missing modules into active plans...');
    for (const plan of uniquePlans) {
        for (const mod of modulesToAdd) {
            await supabase.from('plan_modules').upsert({
                plan_slug: plan,
                module_slug: mod,
                is_included: true
            }, { onConflict: 'plan_slug,module_slug' });
        }
    }
    console.log('Done inserting missing modules for plans!');
}
insertMissing();
