require("dotenv").config({ path: "/Users/joserodriguez/KODA/.env" });
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTables() {
    const { data: tables, error } = await supabase.rpc('get_tables'); // Or try to query information_schema
    if (error) {
        // Fallback to querying a specific table to see if it exists
        const { data, error: err2 } = await supabase.from('shopping_lists').select('*').limit(1);
        const { data: data3, error: err3 } = await supabase.from('shopping_items').select('*').limit(1);
        console.log("shopping_lists exists?", !err2, err2?.message);
        console.log("shopping_items exists?", !err3, err3?.message);
    } else {
        console.log("Tables:", tables);
    }
}

checkTables();
