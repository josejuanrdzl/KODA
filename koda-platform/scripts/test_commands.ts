require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');
const { routeMessage, loadCommands, invalidateCommandsCache } = require('../lib/backend/module.router');
const { getSession } = require('../lib/backend/session.manager');

const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function setupDB() {
    console.log("== 1. Insertando Comandos Base en BD ==");
    const inserts = [
        { trigger_type: 'exact', trigger_value: 'clima', module_slug: 'weather', intent: 'get_weather', priority: 10, plan_required: 'free', is_active: true },
        { trigger_type: 'exact', trigger_value: 'dólar', module_slug: 'fx-rates', intent: 'get_rate', priority: 10, plan_required: 'free', is_active: true },
        { trigger_type: 'exact', trigger_value: 'habitos', module_slug: 'habits', intent: 'list_habits', priority: 10, plan_required: 'free', is_active: true },
        { trigger_type: 'exact', trigger_value: 'hábitos', module_slug: 'habits', intent: 'list_habits', priority: 10, plan_required: 'free', is_active: true },
        { trigger_type: 'exact', trigger_value: 'recordatorios', module_slug: 'reminders', intent: 'list_reminders', priority: 10, plan_required: 'free', is_active: true },
        { trigger_type: 'exact', trigger_value: 'ayuda', module_slug: 'core', intent: 'show_commands', priority: 10, plan_required: 'free', is_active: true },
        { trigger_type: 'exact', trigger_value: 'configuracion', module_slug: 'settings', intent: 'show_menu', priority: 10, plan_required: 'free', is_active: true },
        { trigger_type: 'exact', trigger_value: 'configuración', module_slug: 'settings', intent: 'show_menu', priority: 10, plan_required: 'free', is_active: true },
        { trigger_type: 'exact', trigger_value: 'gmail', module_slug: 'gmail', intent: 'check_emails', priority: 10, plan_required: 'executive', is_active: true }
    ];

    for (const cmd of inserts) {
        // Find existing to avoid conflict if we don't have constraints
        const { data: existing } = await supabase.from('koda_commands').select('id').eq('trigger_value', cmd.trigger_value).single();
        if (existing) {
            await supabase.from('koda_commands').update(cmd).eq('id', existing.id);
        } else {
            await supabase.from('koda_commands').insert(cmd);
        }
    }

    const { data } = await supabase
        .from('koda_commands')
        .select('trigger_type, trigger_value, module_slug, intent, priority, plan_required')
        .eq('is_active', true)
        .order('priority', { ascending: true })
        .limit(20);

    console.log("Comandos Activos:", data);
}

const mockBot = {
    sendMessage: async (chatId, text) => {
        console.log(`\n[Bot] -> ${chatId}: ${text}`);
    }
};

async function testCommand(text, plan = 'free') {
    const userId = '12345';
    console.log(`\n--- Test: "${text}" (Plan: ${plan}) ---`);
    let session = await getSession('telegram', userId, userId);
    session.plan = plan; // Forzamos el plan para la prueba
    session.mode = 'koda';
    session.onboarding_complete = true; // Saltar onboarding

    try {
        const response = await routeMessage(mockBot, { text, chat: { id: userId } }, session, { aiEngine: null });
        console.log(`[Response]:`, response);
    } catch (e) {
        console.error("Error en router:", e);
    }
}

async function run() {
    await setupDB();
    // await invalidateCommandsCache(); // Limpiar cache para cargar nuevos

    
    console.log("\n== 2. Probando comandos básicos ==");
    await testCommand('clima');
    await testCommand('dolar');
    await testCommand('dólar');
    await testCommand('habitos');
    await testCommand('hábitos');
    await testCommand('ayuda');
    await testCommand('configuración');

    console.log("\n== 3. Probando límite de plan ==");
    await testCommand('gmail', 'free'); // Debería fallar o ir a LLM sin match
    await testCommand('gmail', 'executive'); // Debería hacer match
}

run().catch(console.error);
