import { sendChannelMessage } from '../../backend/utils/messenger';
const db = require('../../backend/services/supabase');
const { supabase } = db;
import { checkModuleAccess } from '../../backend/module.router';

/**
 * Main handler for the Settings and Configuration Menu.
 * Activated by triggers like "configuración", "ayuda", etc.
 */
export async function handleSettings(bot: any, msg: any, user: any, options: any): Promise<string | null> {
    const userId = user.id;
    const chatId = msg.chat.id;
    const text = msg.text?.trim() || '';
    const channel = msg._channel || 'telegram';
    
    let context = user.active_context;
    
    // If we are in messaging onboarding mode, delegate to sub-handler
    if (context?.mode === 'messaging_onboarding') {
        return await handleMessagingOnboarding(bot, msg, user, options);
    }

    if (context?.mode === 'google_onboarding') {
        return await handleGoogleOnboarding(bot, msg, user, options);
    }

    if (!context || context.mode !== 'settings') {
        context = { mode: 'settings', step: 'menu', data: {} };
    }

    const step = context.step;

    // --- MAIN MENU ---
    if (step === 'menu') {
        if (text === '0') {
            await supabase.from('users').update({ active_context: { mode: 'koda' } }).eq('id', userId);
            return "¡Entendido! Volvemos al chat normal. ¿En qué más puedo ayudarte?";
        }

        if (text === '1') {
            let capabilities = `🚀 *¿Qué puede hacer KODA por ti?*\n\n`;
            capabilities += `🧠 *Memoria*: Recuerdo todo lo que hablamos. Puedes preguntarme "qué hablamos ayer" o "recuerda que...".\n`;
            capabilities += `📅 *Agenda*: Conecto con tu Calendario para gestionar tus citas.\n`;
            capabilities += `📧 *Gmail*: Resumo tus correos y te ayudo a responder.\n`;
            capabilities += `🌤️ *Clima*: Reportes diarios y consultas en tiempo real.\n`;
            capabilities += `⚽ *Deportes*: Resultados y alertas de tus equipos favoritos.\n`;
            capabilities += `🛒 *Compras*: Gestiono tu lista del súper.\n`;
            capabilities += `👨‍👩‍👧 *Familia*: Registro actividades y cumples de tu familia.\n`;
            capabilities += `🌙 *Luna*: Seguimiento de salud femenina.\n\n`;
            capabilities += `Escribe *0* para volver al menú o cualquier cosa para salir.`;
            
            await sendChannelMessage(bot, chatId, capabilities, { parse_mode: 'Markdown' }, channel);
            return null;
        }

        if (text === '2') {
            await updateContext(userId, { ...context, step: 'profile_menu' });
            const profileMsg = `👤 *Configuración de Perfil*\n\n1. Cambiar Nombre (actual: ${user.name})\n2. Cambiar KODA ID (actual: @${user.koda_id || 'no definido'})\n\n0. Volver`;
            await sendChannelMessage(bot, chatId, profileMsg, { parse_mode: 'Markdown' }, channel);
            return null;
        }

        if (text === '3') {
            await updateContext(userId, { ...context, step: 'schedule_menu' });
            const scheduleMsg = `⏰ *Configuración de Horarios*\n\n` +
                `1. Good Morning KODA (${user.proactive_good_morning || '08:00'})\n` +
                `2. Resumen Tarde (${user.proactive_midday || '14:00'})\n` +
                `3. Cierre de Día (${user.proactive_end_of_day || '19:00'})\n` +
                `4. Buenas Noches (${user.proactive_good_night || '22:00'})\n\n` +
                `0. Volver`;
            await sendChannelMessage(bot, chatId, scheduleMsg, { parse_mode: 'Markdown' }, channel);
            return null;
        }

        if (text === '4') {
            await updateContext(userId, { ...context, step: 'module_menu' });
            const moduleMsg = `⚙️ *Configuración de Módulos*\n\n` +
                `1. Clima (Ciudad)\n` +
                `2. Deportes (Mis Equipos)\n` +
                `3. Familia (Miembros)\n\n` +
                `0. Volver`;
            await sendChannelMessage(bot, chatId, moduleMsg, { parse_mode: 'Markdown' }, channel);
            return null;
        }

        if (text === '5' || text === '7') {
            // Trigger Google Onboarding
            const moduleSlug = text === '5' ? 'gmail' : 'calendar';
            return await handleGoogleOnboarding(bot, msg, user, { ...options, initialModule: moduleSlug });
        }

        if (text === '6') {
            // Trigger Messaging Onboarding
            await updateContext(userId, { mode: 'messaging_onboarding', step: 'verify_id', data: {} });
            return await handleMessagingOnboarding(bot, msg, user, options);
        }

        if (text === '7') {
            // Handled by option 5 logic above to unify Google connection
        }

        if (text === '8') {
            const planMsg = `💳 *Tu Plan actual: ${user.plan?.toUpperCase() || 'PERSONAL'}*\n\n` +
                `• Almacenamiento: Ilimitado\n` +
                `• Soporte: Prioritario\n` +
                `• Módulos: Todos los disponibles activos.\n\n` +
                `_¿Quieres subir a un plan corporativo? Escribe "ventas" y te contacto._`;
            await sendChannelMessage(bot, chatId, planMsg, { parse_mode: 'Markdown' }, channel);
            return null;
        }

        // Show Main Menu if no valid option chosen
        const mainMenu = `⚙️ *Configuración - KODA*\n\n` +
            `1. 🚀 ¿Qué puedes hacer? (Capacidades)\n` +
            `2. 👤 Perfil (Nombre y KODA ID)\n` +
            `3. ⏰ Horarios (Briefing matutino, etc.)\n` +
            `4. 🔧 Módulos (Clima, Equipos, Familia)\n` +
            `5. 📧 Conectar Gmail\n` +
            `6. 💬 Mensajería KODA\n` +
            `7. 📅 Conectar Calendario\n` +
            `8. 💳 Mi Plan / Suscripción\n\n` +
            `0. Salir`;
        
        await sendChannelMessage(bot, chatId, mainMenu, { parse_mode: 'Markdown' }, channel);
        await updateContext(userId, { mode: 'settings', step: 'menu', data: {} });
        return null;
    }

    // --- GOOGLE ONBOARDING SUB-HANDLER ---
    if (context.mode === 'google_onboarding') {
        return await handleGoogleOnboarding(bot, msg, user, options);
    }

    // --- MESSAGING ONBOARDING SUB-HANDLER ---
    if (context.mode === 'messaging_onboarding') {
        return await handleMessagingOnboarding(bot, msg, user, options);
    }

    // --- PROFILE SUBMENU ---
    if (step === 'profile_menu') {
        if (text === '0') return goBackToMenu(bot, chatId, userId, channel);
        if (text === '1') {
            await updateContext(userId, { ...context, step: 'update_name' });
            return "¿Cómo quieres que te llame?";
        }
        if (text === '2') {
            await updateContext(userId, { ...context, step: 'update_koda_id' });
            return "Escribe tu nuevo KODA ID (ej: @mi_nombre):";
        }
    }

    if (step === 'update_name') {
        await supabase.from('users').update({ name: text, full_name: text }).eq('id', userId);
        return goBackToMenu(bot, chatId, userId, channel, `¡Listo! Ahora te diré *${text}*.`);
    }

    if (step === 'update_koda_id') {
        const requestedId = text.replace(/^@/, '').toLowerCase();
        if (!/^[a-z0-9_]{3,20}$/.test(requestedId)) {
            return "Formato inválido. Usa solo minúsculas, números y guiones bajos (3-20 caracteres).";
        }
        const { data: existing } = await supabase.from('users').select('id').eq('koda_id', requestedId).maybeSingle();
        if (existing && existing.id !== userId) {
            return `⚠️ El KODA ID @${requestedId} ya está en uso. Elige otro:`;
        }
        await supabase.from('users').update({ koda_id: requestedId }).eq('id', userId);
        return goBackToMenu(bot, chatId, userId, channel, `¡Perfecto! Tu KODA ID ahora es *@${requestedId}*.`);
    }

    // --- SCHEDULE SUBMENU ---
    if (step === 'schedule_menu') {
        if (text === '0') return goBackToMenu(bot, chatId, userId, channel);
        const map: any = { '1': 'proactive_good_morning', '2': 'proactive_midday', '3': 'proactive_end_of_day', '4': 'proactive_good_night' };
        if (map[text]) {
            await updateContext(userId, { ...context, step: 'update_schedule', data: { field: map[text] } });
            return "Escribe la hora en formato HH:MM (ej: 07:30):";
        }
    }

    if (step === 'update_schedule') {
        const timeMatch = text.match(/^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/);
        if (!timeMatch) return "⚠️ Por favor usa el formato HH:MM (ej: 08:30):";
        
        const field = context.data.field;
        await supabase.from('users').update({ [field]: text }).eq('id', userId);
        return goBackToMenu(bot, chatId, userId, channel, `¡Horario actualizado a las ${text}! ✅`);
    }

    // --- MODULE SUBMENU ---
    if (step === 'module_menu') {
        if (text === '0') return goBackToMenu(bot, chatId, userId, channel);
        if (text === '1') {
            await updateContext(userId, { ...context, step: 'update_city' });
            return "¿De qué ciudad quieres recibir el clima?";
        }
        if (text === '2') {
            return "Para configurar tus equipos de deportes, simplemente dime algo como: 'Sigo a los Cowboys' o 'Agrega al Real Madrid a mis favoritos'.";
        }
        if (text === '3') {
            const { data: count } = await supabase.from('family_members').select('id', { count: 'exact' }).eq('user_id', userId);
            return `Tienes ${count?.length || 0} miembros registrados en tu familia. Para agregar más, dime 'Agrega a mi hijo Pablo' o 'Recuerda el cumple de mi esposa'.`;
        }
    }

    if (step === 'update_city') {
        await supabase.from('memories').upsert({
            user_id: userId,
            category: 'config',
            key: 'ciudad',
            value: text,
            context: 'system'
        }, { onConflict: 'user_id, category, key' });
        
        return goBackToMenu(bot, chatId, userId, channel, `¡Entendido! Ciudad actualizada a *${text}*. 📍`);
    }


    return null;
}

/**
 * Sub-handler for the messaging onboarding flow.
 */
async function handleMessagingOnboarding(bot: any, msg: any, user: any, options: any): Promise<string | null> {
    const userId = user.id;
    const chatId = msg.chat.id;
    const text = msg.text?.trim() || '';
    const channel = msg._channel || 'telegram';
    let context = user.active_context;
    if (!context || context.mode !== 'messaging_onboarding') {
        context = { mode: 'messaging_onboarding', step: 'verify_id', data: {} };
    }
    const step = context.step;

    // STEP 1: VERIFY KODA ID
    if (step === 'verify_id') {
        if (!user.koda_id) {
            const msgId = "Para enviar y recibir mensajes entre usuarios KODA, primero necesitas tu @username.\n\n" +
                "Elige tu identificador único (letras, números y guión bajo, mínimo 3 caracteres). " +
                "Con este @ otros usuarios podrán encontrarte y escribirte.\n\n" +
                "Ejemplo: @juan, @maria_g, @carlos92";
            await sendChannelMessage(bot, chatId, msgId, { parse_mode: 'Markdown' }, channel);
            await updateContext(userId, { ...context, step: 'awaiting_koda_id' });
            return null;
        } else {
            // Already has KODA ID, skip to Step 2
            return await transitionToStep2(bot, chatId, userId, channel, context);
        }
    }

    if (step === 'awaiting_koda_id') {
        const requestedId = text.replace(/^@/, '').toLowerCase();
        if (!/^[a-z0-9_]{3,20}$/.test(requestedId)) {
            return "Formato inválido. Usa solo minúsculas, números y guiones bajos (3-20 caracteres).";
        }
        const { data: existing } = await supabase.from('users').select('id').eq('koda_id', requestedId).maybeSingle();
        if (existing && existing.id !== userId) {
            return `⚠️ El KODA ID @${requestedId} ya está en uso. Elige otro:`;
        }
        await supabase.from('users').update({ koda_id: requestedId }).eq('id', userId);
        return await transitionToStep2(bot, chatId, userId, channel, { ...context, step: 'awaiting_koda_id' });
    }

    // STEP 2: EXPLAIN SYSTEM
    if (step === 'explain_system') {
        if (/^(si|sí|yes|vale|ok|next)$/i.test(text)) {
            await updateContext(userId, { ...context, step: 'connect_options' });
            const connectMsg = "¡Vamos! Tengo dos formas de conectarte:\n\n" +
                "a) Genero un código para que tú lo compartas\n" +
                "b) Quiero conectarme con alguien por su @username\n\n" +
                "¿Cuál prefieres?";
            await sendChannelMessage(bot, chatId, connectMsg, { parse_mode: 'Markdown' }, channel);
            return null;
        } else if (/^(no)$/i.test(text)) {
            return await transitionToStep4(bot, chatId, userId, channel, context);
        }
    }

    // STEP 3: CONNECT OPTIONS
    if (step === 'connect_options') {
        const choice = text.toLowerCase();
        if (choice === 'a' || choice.includes('código') || choice.includes('codigo')) {
            // Generate Invite Code
            const { data: code, error } = await supabase.rpc('generate_invite_code');
            const inviteCode = (error || !code) ? `KODA-${Math.random().toString(36).substring(2, 6).toUpperCase()}` : code;
            
            await supabase.from('koda_connections').insert({
                user_id_1: userId,
                invite_code: inviteCode,
                status: 'pending',
                expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            });

            const reply = `Tu código de invitación es:\n\n🔑 *${inviteCode}*\n\n` +
                `Compártelo con quien quieras conectar. Expira en 24 horas.\n\n` +
                `Cuando lo reciba, solo tiene que escribirirme: 'Conectar ${inviteCode}' y quedarán enlazados.`;
            
            await sendChannelMessage(bot, chatId, reply, { parse_mode: 'Markdown' }, channel);
            return await transitionToStep4(bot, chatId, userId, channel, context);
        } else if (choice === 'b' || choice.includes('username') || choice.includes('usuario')) {
            await updateContext(userId, { ...context, step: 'awaiting_username_search' });
            return "¿Cuál es el @username de la persona?";
        }
    }

    if (step === 'awaiting_username_search') {
        const targetId = text.replace(/^@/, '').toLowerCase();
        const { data: targetUser } = await supabase.from('users').select('id, koda_id, name').eq('koda_id', targetId).maybeSingle();
        
        if (!targetUser) {
            await updateContext(userId, { ...context, step: 'connect_options' });
            return `No encontré ese @username en KODA. ¿Quieres intentar de nuevo o prefieres generar un código de invitación? (A/B)`;
        }

        // Send connection request
        const notifyText = `📨 *${user.name}* (@${user.koda_id}) quiere conectarse contigo en KODA.\n\nResponde *ACEPTAR* o *RECHAZAR*.`;
        await sendChannelMessage(bot, targetUser.id, notifyText, { parse_mode: 'Markdown' }, 'telegram'); // Target usually TG for now
        
        await sendChannelMessage(bot, chatId, `Solicitud enviada a @${targetId}. Te avisaré cuando responda.`, { parse_mode: 'Markdown' }, channel);
        return await transitionToStep4(bot, chatId, userId, channel, context);
    }

    // STEP 4: MESSAGE TYPES
    if (step === 'message_types') {
        await updateContext(userId, { ...context, step: 'privacy_config' });
        const privacyMsg = "Una última cosa — ¿cómo quieres que te encuentren?\n\n" +
            "Por defecto solo puedes conectarte mediante código de invitación. Puedes activar opciones adicionales:\n\n" +
            "🔍 *Por @username* — cualquiera que sepa tu @ puede pedirte conexión (tú decides si aceptas)\n" +
            "📱 *Por teléfono* — quien tenga tu número puede encontrarte en KODA\n\n" +
            "¿Quieres activar alguna de estas opciones? (SÍ / NO)";
        await sendChannelMessage(bot, chatId, privacyMsg, { parse_mode: 'Markdown' }, channel);
        return null;
    }

    // STEP 5: PRIVACY CONFIG
    if (step === 'privacy_config') {
        if (/^(si|sí|yes)$/i.test(text)) {
            await updateContext(userId, { ...context, step: 'choose_privacy' });
            return "¿Cuál quieres activar?\na) Por @username\nb) Por teléfono\nc) Ambas";
        } else {
            return await closeMessagingOnboarding(bot, chatId, userId, channel, "¡Entendido! Solo serás visible mediante código.");
        }
    }

    if (step === 'choose_privacy') {
        const choice = text.toLowerCase();
        let config = { username: false, phone: false };
        if (choice === 'a') config.username = true;
        if (choice === 'b') config.phone = true;
        if (choice === 'c') { config.username = true; config.phone = true; }
        
        await supabase.from('users').update({ discovery_config: config }).eq('id', userId);
        return await closeMessagingOnboarding(bot, chatId, userId, channel, "¡Configuración de privacidad guardada!");
    }

    return null;
}

async function transitionToStep2(bot: any, chatId: string, userId: string, channel: string, context: any) {
    const msg = "💬 *Mensajería KODA — cómo funciona*\n\n" +
        "KODA te permite enviar mensajes a otros usuarios sin importar si usan WhatsApp o Telegram.\n\n" +
        "Tu mensaje de Telegram llega al WhatsApp de tu contacto — y viceversa. KODA actúa como puente.\n\n" +
        "Para conectarte con alguien tienes 3 opciones:\n" +
        "1️⃣ *Código de invitación* (el más seguro)\n" +
        "2️⃣ *Por @username* (si conoces su @)\n" +
        "3️⃣ *QR en el portal web*\n\n" +
        "¿Quieres conectarte con alguien ahora? (SÍ / NO)";
    await updateContext(userId, { ...context, step: 'explain_system' });
    await sendChannelMessage(bot, chatId, msg, { parse_mode: 'Markdown' }, channel);
    return null;
}

async function transitionToStep4(bot: any, chatId: string, userId: string, channel: string, context: any) {
    const msg = "Cuando estés conectado con alguien, puedes:\n\n" +
        "💬 *MENSAJES NORMALES*\n'Abrir chat con @username'\n" +
        "Escribe libremente — KODA entrega el mensaje. Escribe 'salir' para volver conmigo.\n\n" +
        "🔒 *MENSAJES SECRETOS*\n'Mensaje secreto a @username'\n" +
        "El mensaje se borra 30 segundos después de leerser. Necesita un PIN secreto.\n\n" +
        "📋 *TUS CHATS*\n'Ver mis chats' — para ver conversaciones pendientes.";
    await updateContext(userId, { ...context, step: 'message_types' });
    await sendChannelMessage(bot, chatId, msg, { parse_mode: 'Markdown' }, channel);
    return null;
}

async function closeMessagingOnboarding(bot: any, chatId: string, userId: string, channel: string, prefix: string) {
    await updateContext(userId, { mode: 'koda' });
    return `${prefix}\n\n¡Onboarding de mensajería completado! Ya puedes conectar y chatear.`;
}

/**
 * Sub-handler for Google (Gmail & Calendar) onboarding.
 */
async function handleGoogleOnboarding(bot: any, msg: any, user: any, options: any): Promise<string | null> {
    const userId = user.id;
    const chatId = msg.chat.id;
    const text = msg.text?.trim().toLowerCase() || '';
    const channel = msg._channel || 'telegram';
    let context = user.active_context;

    if (!context || context.mode !== 'google_onboarding') {
        context = { 
            mode: 'google_onboarding', 
            step: 'check_plan', 
            data: { module: options.initialModule || 'gmail' } 
        };
    }

    const step = context.step;
    const moduleName = context.data.module === 'gmail' ? 'Gmail' : 'Calendario';

    // STEP 1: PLAN VERIFICATION
    if (step === 'check_plan') {
        const hasAccess = await checkModuleAccess(user, context.data.module);
        if (!hasAccess) {
            const upsellMsg = `🔒 El módulo de *${moduleName}* es parte de nuestros planes *Executive* y *Business*.\n\n` +
                `Tu plan actual (*${user.plan?.toUpperCase() || 'PERSONAL'}*) no lo incluye.\n\n` +
                `¿Te gustaría que un asesor te contacte para subir de nivel? (SÍ / NO)`;
            await updateContext(userId, { ...context, step: 'upsell' });
            await sendChannelMessage(bot, chatId, upsellMsg, { parse_mode: 'Markdown' }, channel);
            return null;
        }
        // Has access, move to connection check
        return await checkGoogleConnectionStatus(bot, chatId, userId, channel, context);
    }

    if (step === 'upsell') {
        if (/^(si|sí|yes|ventas)$/i.test(text)) {
            await updateContext(userId, { mode: 'koda' });
            return "¡Excelente! Un asesor de KODA se pondrá en contacto contigo pronto para ayudarte con el upgrade. 🚀";
        }
        return await goBackToMenu(bot, chatId, userId, channel, "Sin problema. Avísame si cambias de opinión.");
    }

    // STEP 2: CONNECTION STATUS (and Instructions)
    if (step === 'awaiting_connection') {
        if (text === 'listo' || text === 'ya' || text === 'conectado') {
            const { data: connector } = await supabase
                .from('connectors')
                .select('id')
                .eq('user_id', userId)
                .eq('type', 'gmail') // Both use 'gmail' type connectors usually
                .maybeSingle();

            if (connector) {
                return await finalizeGoogleOnboarding(bot, chatId, userId, channel, context, user);
            } else {
                return "Aún no detecto tu cuenta conectada. 🧐 Asegúrate de haber completado el proceso en el portal y escribe *LISTO* cuando termines.";
            }
        }
        if (text === '0' || text === 'cancelar') {
            return await goBackToMenu(bot, chatId, userId, channel);
        }
    }

    return null;
}

async function checkGoogleConnectionStatus(bot: any, chatId: string, userId: string, channel: string, context: any) {
    const { data: connector } = await supabase
        .from('connectors')
        .select('id')
        .eq('user_id', userId)
        .eq('type', 'gmail')
        .maybeSingle();

    if (connector) {
        const moduleName = context.data.module === 'gmail' ? 'Gmail' : 'Calendario';
        const msg = `✅ ¡Tu cuenta de Google ya está conectada!\n\n` +
            `Ya puedo ayudarte con tu *${moduleName}*.\n\n` +
            (context.data.module === 'gmail' 
                ? "Prueba diciéndome: '¿Tengo correos nuevos?' o 'Resume mi último correo de ayer'."
                : "Prueba diciéndome: '¿Qué tengo en mi agenda hoy?' o 'Agrega una reunión mañana a las 10am'.");
        
        await updateContext(userId, { mode: 'koda' });
        await sendChannelMessage(bot, chatId, msg, { parse_mode: 'Markdown' }, channel);
        return null;
    } else {
        const portalUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://koda.app';
        const instrMsg = `Para que pueda leer tu ${context.data.module === 'gmail' ? 'correo' : 'agenda'}, necesito que vincules tu cuenta de Google.\n\n` +
            `1️⃣ Ve a tu panel en: ${portalUrl}/dashboard\n` +
            `2️⃣ Haz clic en "Conectar Google"\n` +
            `3️⃣ Sigue los pasos de autorización de Google\n\n` +
            `Cuando hayas terminado, vuelve aquí y escribe *LISTO*.`;
        
        await updateContext(userId, { ...context, step: 'awaiting_connection' });
        await sendChannelMessage(bot, chatId, instrMsg, { parse_mode: 'Markdown' }, channel);
        return null;
    }
}

async function finalizeGoogleOnboarding(bot: any, chatId: string, userId: string, channel: string, context: any, user: any) {
    const isGmail = context.data.module === 'gmail';
    const msg = `🎉 ¡Perfecto! Conexión establecida con éxito.\n\n` +
        `Ahora soy tu asistente ejecutivo personal. Cada mañana a las *${user?.proactive_good_morning || '08:00'}* te daré un briefing con tus correos importantes y tu agenda del día.\n\n` +
        `¿Qué quieres probar primero?\n` +
        (isGmail ? "👉 '¿Tengo correos de mi jefe?'" : "👉 '¿A qué hora es mi primera cita?'");

    await updateContext(userId, { mode: 'koda' });
    await sendChannelMessage(bot, chatId, msg, { parse_mode: 'Markdown' }, channel);
    return null;
}

async function updateContext(userId: string, context: any) {
    await supabase.from('users').update({ active_context: context }).eq('id', userId);
}

async function goBackToMenu(bot: any, chatId: string, userId: string, channel: string, prefixMsg: string = '') {
    const mainMenu = (prefixMsg ? prefixMsg + '\n\n' : '') +
        `⚙️ *Configuración - KODA*\n\n` +
        `1. 🚀 ¿Qué puedes hacer? (Capacidades)\n` +
        `2. 👤 Perfil (Nombre y KODA ID)\n` +
        `3. ⏰ Horarios (Briefing matutino, etc.)\n` +
        `4. 🔧 Módulos (Clima, Equipos, Familia)\n` +
        `5. 📧 Conectar Gmail\n` +
        `6. 💬 Mensajería KODA\n` +
        `7. 📅 Conectar Calendario\n` +
        `8. 💳 Mi Plan / Suscripción\n\n` +
        `0. Salir`;

    await sendChannelMessage(bot, chatId, mainMenu, { parse_mode: 'Markdown' }, channel);
    await updateContext(userId, { mode: 'settings', step: 'menu', data: {} });
    return null;
}
