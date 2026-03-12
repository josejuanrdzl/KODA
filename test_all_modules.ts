
import { createClient } from '@supabase/supabase-js';
import { contextInjectors } from './koda-platform/lib/backend/module.router';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const TEST_USER_ID = '9786ab2b-31e3-48ff-a2e2-35e92dd5fcf6';

async function testModule(slug: string, query: string, user: any) {
    console.log(`\n--- Testing Module: ${slug.toUpperCase()} ---`);
    console.log(`Query: "${query}"`);
    
    const injector = contextInjectors[slug];
    if (!injector) {
        console.error(`Error: No injector found for slug ${slug}`);
        return;
    }

    if (injector.regex.test(query)) {
        try {
            const context = await injector.handler(user, { text: query });
            console.log(`Result Context:\n${context}`);
        } catch (error: any) {
            console.error(`Error executing handler for ${slug}:`, error.message || error);
        }
    } else {
        console.log(`Query did not match regex for ${slug}`);
    }
}

async function runTests() {
    console.log("Starting Module Verification Tests with real User ID...");
    
    const { data: user, error: userError } = await supabase.from('users').select('*').eq('id', TEST_USER_ID).single();
    if (userError || !user) {
        console.error("Error fetching test user:", userError);
        return;
    }

    console.log(`User ID: ${user.id}, Plan: ${user.plan}`);

    // Check if luna_cycles table exists by trying a select
    const { error: lunaTableError } = await supabase.from('luna_cycles').select('id').limit(1);
    if (lunaTableError && lunaTableError.code === 'PGRST204') {
        console.error("CRITICAL: Table 'luna_cycles' does not exist in the database.");
    }

    // List enabled modules for this plan
    const { data: enabledModules } = await supabase.from('plan_modules').select('module_slug').eq('plan_slug', user.plan).eq('is_included', true);
    console.log("Enabled modules for this plan:", enabledModules?.map(m => m.module_slug).join(', '));

    // Testing Sports
    await testModule('sports', '¿Cómo quedó el partido de la f1?', user);
    
    // Testing Spotify
    await testModule('spotify', 'Pon música de Bad Bunny', user);
    
    // Testing Luna
    await testModule('luna', '¿En qué fase de mi ciclo estoy?', user);
    
    // Testing Shopping
    await testModule('shopping', '¿Qué hay en la lista de compras?', user);
    
    // Testing Familia
    await testModule('familia', '¿Qué hay de mi familia hoy?', user);
    
    // Testing FX Rates (Type of change)
    await testModule('fx-rates', '¿A cuánto está el dólar?', user);

    console.log("\nTests completed.");
}

runTests();
