const db = require('../../backend/services/supabase');
const { supabase } = db;

// Handler for KODA ID Onboarding
export async function handleKodaIdOnboarding(bot: any, msg: any, user: any, options: any): Promise<boolean> {
    const text = msg.text?.trim() || '';
    
    // Commands to start changing or viewing KODA ID
    if (/^(elegir mi username|cambiar mi @|cuál es mi koda id|mi @koda|koda id)$/i.test(text)) {
        if (user.koda_id && !text.toLowerCase().includes('cambiar') && !text.toLowerCase().includes('elegir')) {
            await bot.sendMessage(user.id, `Tu KODA ID actual es: @${user.koda_id}\n\nSi deseas cambiarlo, dime "cambiar mi koda id".`, options);
            return true;
        }

        const context = { mode: 'koda_id_setup', step: 'awaiting_username' };
        await supabase.from('users').update({ active_context: context }).eq('id', user.id);
        await bot.sendMessage(user.id, "¡Genial! Vamos a configurar tu KODA ID.\n\nEscribe el nombre de usuario que deseas (solo letras, números y guiones bajos, mínimo 3 caracteres). Ej: juan_perez", options);
        return true;
    }

    // Processing the requested username
    if (user.active_context?.mode === 'koda_id_setup' && user.active_context?.step === 'awaiting_username') {
        let requestedId = text.replace(/^@/, '').toLowerCase();
        
        // Wait to exit flow
        if (/^(cancelar|salir)$/i.test(requestedId)) {
            await supabase.from('users').update({ active_context: { mode: 'koda' } }).eq('id', user.id);
            await bot.sendMessage(user.id, "Configuración de KODA ID cancelada.", options);
            return true;
        }

        // Validation
        if (!/^[a-z0-9_]{3,20}$/.test(requestedId)) {
            await bot.sendMessage(user.id, "Formato inválido. Usa solo minúsculas, números y guiones bajos (3-20 caracteres). Intenta de nuevo:", options);
            return true;
        }

        // Check availability
        const { data: existing } = await supabase.from('users').select('id').eq('koda_id', requestedId).maybeSingle();
        if (existing && existing.id !== user.id) {
            await bot.sendMessage(user.id, `El KODA ID @${requestedId} ya está en uso. Por favor elige otro:`, options);
            return true;
        }

        // Save it
        await supabase.from('users').update({ 
            koda_id: requestedId, 
            active_context: { mode: 'koda' } // Reset context
        }).eq('id', user.id);

        await bot.sendMessage(user.id, `¡Listo! Tu KODA ID ha sido configurado como @${requestedId}.\n\nAhora otros usuarios pueden buscarte o puedes invitarlos usando "conectar con alguien".`, options);
        return true;
    }

    return false;
}
