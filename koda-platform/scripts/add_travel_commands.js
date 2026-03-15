const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '../.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function addLocationCommands() {
    const commands = [
        {
            trigger_value: '^(estoy en|viajo a|viaje a|llegue a|llegué a|me voy a)\\s+(.+)$',
            trigger_type: 'regex',
            module_slug: 'travel',
            intent: 'update_travel_city',
            priority: 4,
            is_active: true,
            description: 'Actualiza la ciudad de viaje temporal del usuario'
        },
        {
            trigger_value: '^(regrese|regresé|ya estoy (de regreso|en casa|en mi ciudad|aquí|aqui))$',
            trigger_type: 'regex',
            module_slug: 'travel',
            intent: 'clear_travel_city',
            priority: 4,
            is_active: true,
            description: 'Limpia la ciudad de viaje temporal del usuario'
        }
    ];

    for (const cmd of commands) {
        // Upsert might not work well without a unique constraint, let's just insert if not matching
        const { data: existing } = await supabase.from('koda_commands').select('*').eq('intent', cmd.intent).limit(1);

        if (existing && existing.length > 0) {
            const { error } = await supabase.from('koda_commands').update(cmd).eq('id', existing[0].id);
            if (error) console.error(`Error updating command ${cmd.intent}:`, error);
            else console.log(`Successfully updated command ${cmd.intent}`);
        } else {
            const { error } = await supabase.from('koda_commands').insert([cmd]);
            if (error) console.error(`Error adding command ${cmd.intent}:`, error);
            else console.log(`Successfully added command ${cmd.intent}`);
        }
    }
}

addLocationCommands();
