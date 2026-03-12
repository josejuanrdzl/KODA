
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function findUser() {
    const { data, error } = await supabase.from('users').select('id').limit(1);
    if (error) {
        console.error("Error fetching users:", error);
        return;
    }
    console.log("Found user for testing:");
    console.log(JSON.stringify(data, null, 2));
}

findUser();
