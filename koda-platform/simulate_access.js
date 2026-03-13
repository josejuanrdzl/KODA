const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Mocking the checkModuleAccess logic from module.router.ts
async function simulateCheckModuleAccess(user, moduleSlug) {
    console.log(`\n--- Simulating checkModuleAccess for module: ${moduleSlug} ---`);
    if (!user || !user.tenant_id || !user.plan) {
        console.error("Faltan datos del usuario (tenant_id o plan).");
        return false;
    }

    // 1. Verificar override por tenant
    const { data: tenantOverride, error: tenantErr } = await supabase
        .from('tenant_modules')
        .select('enabled')
        .eq('tenant_id', user.tenant_id)
        .eq('module_slug', moduleSlug)
        .maybeSingle();

    if (tenantErr) {
        console.error(`Error al verificar tenant_modules: ${tenantErr.message}`);
    }

    if (tenantOverride) {
        console.log(`Override found in tenant_modules: ${tenantOverride.enabled}`);
        return tenantOverride.enabled;
    }

    // 2. Si no hay override, verificar por plan
    let planSlug = user.plan;
    if (user.tenant_id) {
        const { data: tenant } = await supabase
            .from('tenants')
            .select('plan')
            .eq('id', user.tenant_id)
            .single();

        if (tenant && tenant.plan) {
            console.log(`Using tenant plan override: ${tenant.plan} (instead of ${user.plan})`);
            planSlug = tenant.plan;
        }
    }

    // Obtener el ID del plan
    const { data: planData } = await supabase
        .from('plans')
        .select('id')
        .eq('slug', planSlug)
        .single();

    if (!planData) {
        console.error(`Plan not found for slug: ${planSlug}`);
        return false;
    }
    const planId = planData.id;
    console.log(`Plan ID for ${planSlug}: ${planId}`);

    // Obtener el ID del módulo
    const { data: moduleData } = await supabase
        .from('modules')
        .select('id')
        .eq('slug', moduleSlug)
        .single();

    if (!moduleData) {
        console.error(`Module not found for slug: ${moduleSlug}`);
        return false;
    }
    const moduleId = moduleData.id;
    console.log(`Module ID for ${moduleSlug}: ${moduleId}`);

    // Verificar acceso en plan_modules
    const { data: planAccess, error: planErr } = await supabase
        .from('plan_modules')
        .select('enabled')
        .eq('plan_id', planId)
        .eq('module_id', moduleId)
        .single();

    if (planErr) {
        console.error(`Error al verificar plan_modules: ${planErr.message}`);
        return false;
    }

    console.log(`Plan access result: ${planAccess.enabled}`);
    return planAccess.enabled;
}

async function runSimulation() {
    const userId = '8d0f6704-521b-4913-801b-3bc0b6ea9720'; // JJ
    const { data: user } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
    
    console.log(`Simulating for User: ${user.name} (Plan: ${user.plan}, Tenant: ${user.tenant_id})`);

    const modulesToCheck = ['gmail', 'calendar', 'messaging', 'memory', 'spotify'];
    for (const slug of modulesToCheck) {
        const result = await simulateCheckModuleAccess(user, slug);
        console.log(`Final Result for ${slug}: ${result}`);
    }
}

runSimulation();
