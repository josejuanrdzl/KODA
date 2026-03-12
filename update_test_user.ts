
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const TEST_USER_ID = '9786ab2b-31e3-48ff-a2e2-35e92dd5fcf6';

async function updatePlan() {
    console.log(`Updating user ${TEST_USER_ID} plan to personal...`);
    const { error } = await supabase.from('users').update({ plan: 'personal' }).eq('id', TEST_USER_ID);
    if (error) {
        console.error("Error updating plan:", error);
    } else {
        console.log("Plan updated successfully.");
    }
}

updatePlan();
