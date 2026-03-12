import { createClient } from "@supabase/supabase-js";

// Client for Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: {
        fetch: (...args) => fetch(args[0], { ...args[1], cache: 'no-store' })
    }
});
