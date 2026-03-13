require("dotenv").config({ path: "/Users/joserodriguez/KODA/.env" });
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSportsAccess() {
    console.log("Checking plan_modules for sports...");

    // Check all modules specifically for the user's plan or default plans
    const { data: plans, error: planErr } = await supabase
        .from('plans')
        .select('*');

    console.log("Plans available:", plans?.map(p => p.slug));

    const { data: modules, error: modErr } = await supabase
        .from('plan_modules')
        .select('*')
        .eq('module_slug', 'sports');

    if (modErr) {
        console.error("Error fetching sports module:", modErr);
        return;
    }

    console.log("Sports module configured for plans:", modules?.map(m => m.plan_slug));
}

checkSportsAccess();
