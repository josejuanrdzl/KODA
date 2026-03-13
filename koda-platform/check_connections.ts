import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
    console.log("Checking DB...");
    const { data: connCountData, count, error: countErr } = await supabase.from('koda_connections').select('*', { count: 'exact', head: true });
    console.log("Total connections count:", count, countErr);

    const { data: recentConns, error: connErr1 } = await supabase.from('koda_connections').select('*').limit(50);
    console.log("Connections length:", recentConns?.length);
    if(recentConns && recentConns.length > 0) {
        console.log("Sample connection:", recentConns[0]);
    }
}

main().catch(console.error);
