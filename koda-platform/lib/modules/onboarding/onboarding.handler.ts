import { sendChannelMessage } from '../../backend/utils/messenger';
const db = require('../../backend/services/supabase');
const { supabase } = db;

/**
 * Main handler for the General Onboarding Flow.
 * Intercepts messages when user.onboarding_complete is false or when exclusive_mode = 'onboarding'.
 */
export async function handleOnboarding(bot: any, msg: any, user: any, options: any): Promise<string | null> {
    const userId = user.id;
    const chatId = msg.chat.id;
    const text = msg.text?.trim() || '';
    const channel = msg._channel || 'telegram';
    
    let exclusiveData = user.exclusive_data || {};
    // Normalize step logic
    const step = exclusiveData.step || 0;
    const currentMsgId = msg.message_id || msg.MessageSid;

    console.log(`[Onboarding] User: ${user.id}, Step: ${step}, MsgId: ${currentMsgId}, Text: "${text}"`);

    // --- STEP 0: Initial Welcome ---
    if (step === 0) {
        console.log(`[Onboarding] Triggering Step 0 (Welcome) for user ${user.id}`);
        const welcomeMsg = `¡Hola! Soy *KODA*, tu copiloto inteligente. 🚀\n\nVoy a ser tu memoria, tu organizador y tu mano derecha. Todo lo que me digas lo recuerdo, y estoy disponible para ayudarte a gestionar tu vida personal y profesional.\n\nPara empezar, **¿cómo te llamas?** (Dime tu nombre como prefieras que te diga)`;
        
        await sendChannelMessage(bot, chatId, welcomeMsg, { parse_mode: 'Markdown' }, channel);
        
        await supabase.from('users').update({ 
            exclusive_data: { 
                ...exclusiveData, 
                step: 1, 
                last_msg_id: currentMsgId
            } 
        }).eq('id', userId);
        
        return null; // Handled
    }

    // --- STEP 1: Process Name ---
    if (step === 1) {
        if (currentMsgId && exclusiveData.last_msg_id === currentMsgId) {
             console.log(`[Onboarding] Ignoring message ${currentMsgId} in Step 1 as it triggered Step 0.`);
             return null;
        }

        if (!text) {
             await sendChannelMessage(bot, chatId, "Por favor, dime tu nombre para continuar:", {}, channel);
             return null;
        }

        // --- GREETING GUARD ---
        const cleanText = text.toLowerCase().replace(/^[¡!¿?.\s-,]+/, '').trim();
        const commonGreetings = ['hola', 'hi', 'hey', 'buenas', 'hello', 'start', '/start', 'buen dia', 'buenos', 'que onda'];
        if (commonGreetings.some(g => cleanText.startsWith(g)) && text.length < 30) {
             console.log(`[Onboarding] Greeting "${text}" detected in Step 1 for user ${user.id}. Re-triggering Step 0.`);
             return handleOnboarding(bot, msg, { ...user, exclusive_data: { ...exclusiveData, step: 0 } }, options);
        }
        
        await supabase.from('users').update({ 
            name: text,
            full_name: text,
            exclusive_data: { ...exclusiveData, step: 2 }
        }).eq('id', userId);

        const kodaIdMsg = `¡Mucho gusto, *${text}*! 🙌\n\nPara que podamos interactuar mejor, necesito que elijas tu *KODA ID*. Es un nombre único (como @usuario) que te servirá para que otros te encuentren.\n\n**Escribe el KODA ID que deseas** (solo letras, números y guiones bajos):`;
        
        await sendChannelMessage(bot, chatId, kodaIdMsg, { parse_mode: 'Markdown' }, channel);
        return null;
    }

    // --- STEP 2: Process KODA ID ---
    if (step === 2) {
        const requestedId = text.replace(/^@/, '').toLowerCase();
        
        if (!/^[a-z0-9_]{3,20}$/.test(requestedId)) {
             await sendChannelMessage(bot, chatId, "Formato inválido. Usa solo minúsculas, números y guiones bajos (3-20 caracteres). Intenta con otro:", {}, channel);
             return null;
        }

        const { data: existing } = await supabase.from('users').select('id').eq('koda_id', requestedId).maybeSingle();
        if (existing && existing.id !== userId) {
             await sendChannelMessage(bot, chatId, `⚠️ El KODA ID @${requestedId} ya está en uso. Por favor elige otro:`, {}, channel);
             return null;
        }

        await supabase.from('users').update({ 
             koda_id: requestedId,
             exclusive_data: { ...exclusiveData, step: 3 }
        }).eq('id', userId);

        const configMsg = `¡Perfecto! Tu KODA ID es *@${requestedId}*. ✅\n\nAhora, unas configuraciones rápidas:\n**¿Desde qué ciudad me escribes?** Esto me servirá para darte el clima y noticias locales.`;
        
        await sendChannelMessage(bot, chatId, configMsg, { parse_mode: 'Markdown' }, channel);
        return null;
    }

    // --- STEP 3: Process Configuration (City & Briefing Time) ---
    if (step === 3) {
        // Part A: City
        if (!exclusiveData.city) {
             await supabase.from('memories').upsert({
                 user_id: userId,
                 category: 'config',
                 key: 'ciudad',
                 value: text,
                 context: 'system'
             }, { onConflict: 'user_id, category, key' });

             await supabase.from('users').update({
                 exclusive_data: { ...exclusiveData, city: text }
             }).eq('id', userId);

             const timeMsg = `¡Entendido! Te tengo ubicado en *${text}*. 📍\n\n**¿A qué hora te gustaría recibir tu 'Good Morning KODA'?** Es un resumen de tu agenda, clima y pendientes para empezar el día. (Responde en formato HH:MM, ej: 08:30)`;
             
             await sendChannelMessage(bot, chatId, timeMsg, { parse_mode: 'Markdown' }, channel);
             return null;
        }

        // Part B: Morning Briefing Time
        const timeMatch = text.match(/^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/);
        if (!timeMatch) {
             await sendChannelMessage(bot, chatId, "⚠️ Por favor usa el formato HH:MM (ejemplo 07:45):", {}, channel);
             return null;
        }

        await supabase.from('users').update({
             proactive_good_morning: text,
             exclusive_data: { ...exclusiveData, step: 4 }
        }).eq('id', userId);

        // Recursive call to handle Step 4 immediately
        return handleOnboarding(bot, msg, { ...user, exclusive_data: { ...exclusiveData, step: 4 } }, options);
    }

    // --- STEP 4: Capabilities ---
    if (step === 4) {
        const plan = user.plan_slug || 'free';
        let capabilities = `¡Todo listo! Ya estamos configurados. Esto es lo que puedo hacer por ti:\n\n`;
        
        capabilities += `🧠 *Memoria Infinita*: Recuerdo todo lo que me digas.\n`;
        capabilities += `📅 *Agenda*: Puedo ver tus compromisos (conecta tu calendario).\n`;
        capabilities += `📧 *Gmail*: Puedo leer y resumir tus correos.\n`;
        capabilities += `💬 *Mensajería*: Puedo ayudarte a redactar y gestionar mensajes.\n\n`;
        
        if (plan === 'executive' || plan === 'business') {
             capabilities += `💼 *Modo Ejecutivo*: Tienes acceso a todas las herramientas avanzadas.`;
        } else {
             capabilities += `✨ *Plan Personal*: Tienes las funciones esenciales activas. Pregúntame si quieres saber más sobre los planes Executive.`;
        }

        await sendChannelMessage(bot, chatId, capabilities, { parse_mode: 'Markdown' }, channel);

        // --- STEP 5: Finalization ---
        await supabase.from('users').update({
             onboarding_complete: true,
             exclusive_mode: null,
             exclusive_data: null,
             active_context: { mode: 'koda' }
        }).eq('id', userId);

        return "¡Ahora sí, empecemos! ¿En qué puedo ayudarte hoy?";
    }

    return null;
}
