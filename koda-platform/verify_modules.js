const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: modules, error } = await supabase.from('modules').select('slug');
    if (error) {
        console.error('Error fetching modules:', error);
        return;
    }
    console.log('Available modules:', modules.map(m => m.slug));
    
    // Check specific ones
    const newModules = ['gmail', 'calendar', 'messaging', 'memory'];
    for (const slug of newModules) {
        if (modules.find(m => m.slug === slug)) {
            console.log(`✅ Module "${slug}" exists.`);
        } else {
            console.log(`❌ Module "${slug}" MISSING!`);
        }
    }
}

check();
