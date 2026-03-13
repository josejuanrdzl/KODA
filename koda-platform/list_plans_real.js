const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: plans, error } = await supabase.from('plans').select('slug');
    if (error) {
        console.error('Error fetching plans:', error);
        return;
    }
    console.log('Available plans:', plans.map(p => p.slug));
}

check();
