require('dotenv').config();
const { supabase } = require('./lib/backend/services/supabase');

const modules = [
    'weather',
    'fx-rates',
    'spotify',
    'sports',
    'luna',
    'shopping',
    'familia',
    'gmail',
    'calendar',
    'messaging',
    'memory'
];

const plans = [
    'free',
    'starter',
    'personal',
    'executive',
    'business'
];

async function grantAllAccess() {
    console.log('🚀 Iniciando actualización de permisos globales...');

    const rows = [];
    for (const plan of plans) {
        for (const module of modules) {
            rows.push({
                plan_slug: plan,
                module_slug: module,
                is_included: true,
                updated_at: new Date().toISOString()
            });
        }
    }

    try {
        const { data, error } = await supabase
            .from('plan_modules')
            .upsert(rows, { onConflict: 'plan_slug,module_slug' });

        if (error) {
            console.error('❌ Error al actualizar plan_modules:', error.message);
        } else {
            console.log(`✅ Éxito: Se han habilitado ${rows.length} combinaciones de plan/módulo.`);
        }
    } catch (err) {
        console.error('❌ Excepción durante la actualización:', err);
    }
}

grantAllAccess();
