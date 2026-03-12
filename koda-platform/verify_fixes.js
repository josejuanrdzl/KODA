require("dotenv").config({ path: "/Users/joserodriguez/KODA/.env" });
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkState() {
    console.log("--- Diagnostic Check ---");
    
    // 1. Check Tables
    const tables = ['family_members', 'family_activities', 'luna_cycles'];
    for (const table of tables) {
        const { data, error, count } = await supabase
            .from(table)
            .select('*', { count: 'exact', head: true });
        
        if (error) {
            console.log(`❌ Table ${table}: Not found or Error (${error.message})`);
        } else {
            console.log(`✅ Table ${table}: Exists (Rows: ${count})`);
        }
    }

    // 2. Check API Keys in local environment (representative of production if .env is sync)
    console.log("\n--- Config Check ---");
    console.log(`EXCHANGE_RATE_API_KEY: ${process.env.EXCHANGE_RATE_API_KEY ? 'DEFINED' : 'MISSING'}`);
    console.log(`OPENWEATHER_API_KEY: ${process.env.OPENWEATHER_API_KEY ? 'DEFINED' : 'MISSING'}`);

    // 3. Check specific schema for family_members (relation vs relationship)
    console.log("\n--- Schema Detail Check ---");
    const { data: member, error: memberErr } = await supabase
        .from('family_members')
        .select('*')
        .limit(1)
        .maybeSingle();
    
    if (member) {
        console.log("Sample family_member keys:", Object.keys(member));
    } else if (memberErr) {
        console.log("Error fetching family_member sample:", memberErr.message);
    }
}

checkState();
