require("dotenv").config({ path: "/Users/joserodriguez/KODA/.env" });
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkModules() {
    console.log("Fetching modules schema...");
    const { data: mods, error } = await supabase
        .from('modules')
        .select('*')
        .limit(1);

    if (error) {
        console.error("Error fetching modules:", error);
        return;
    }
    console.log("First module:", mods[0]);
}

checkModules();
