const db = require('../services/supabase');
const journal = require('./journal');
const { sendChannelMessage } = require('../utils/messenger');

async function handleCommand(bot, msg, user) {
    const text = msg.text || '';
    const chatId = msg.chat.id;
    const channel = msg._channel || 'telegram';

    if (!text.startsWith('/')) return false;

    const command = text.split(' ')[0].toLowerCase();

    switch (command) {
        case '/ayuda':
        case '/help':
            await sendChannelMessage(bot, chatId, `🧠 *Comandos Disponibles KODA*
/notas o /notes — Lista tus últimas notas.
/recordatorios o /reminders — Lista tus recordatorios activos.
/config o /configurar — Menú de configuración.
/perfil o /profile — Muestra tu perfil actual.
/diario o /journal — Entrada formal en tu diario.
/plan o /suscripcion — Revisa el estado de tu plan y facturación.
/upgrade — Mejora tu plan para quitar límites.
/cancelar — Cancela tu suscripción actual.
/feedback — Envía sugerencias sobre mi funcionamiento.

🎙️ *Nuevo:* ¡Ya recibo notas de voz y mensajes de video para transcribir automáticamente!
📋 *Nuevo:* Administra tus hábitos con /habitos`, { parse_mode: 'Markdown' }, channel);
            return true;

        case '/notas':
        case '/notes':
            const notas = await db.getRecentNotes(user.id, 10);
            if (notas.length === 0) {
                await sendChannelMessage(bot, chatId, 'No tienes notas guardadas actualmente.', {}, channel);
            } else {
                const notasText = notas.map((n, i) => `${i + 1}. [${n.tag || 'general'}] ${n.content}`).join('\n');
                await sendChannelMessage(bot, chatId, `📝 *Tus últimas 10 notas:*\n${notasText}`, { parse_mode: 'Markdown' }, channel);
            }
            return true;

        case '/recordatorios':
        case '/reminders':
            const recordatorios = await db.getActiveReminders(user.id);
            if (recordatorios.length === 0) {
                await sendChannelMessage(bot, chatId, 'No tienes recordatorios activos.', {}, channel);
            } else {
                const userTz = user.timezone || 'America/Chihuahua';
                const recText = recordatorios.map((r, i) => `${i + 1}. ${r.content} (🕒 ${new Date(r.remind_at).toLocaleString('es-MX', { timeZone: userTz })})`).join('\n');
                await sendChannelMessage(bot, chatId, `⏰ *Tus recordatorios activos:*\n${recText}`, { parse_mode: 'Markdown' }, channel);
            }
            return true;

        case '/perfil':
        case '/profile':
            const userTzProfile = user.timezone || 'America/Chihuahua';
            const fechaRegistro = new Date(user.created_at).toLocaleDateString('es-MX', { timeZone: userTzProfile });
            await sendChannelMessage(bot, chatId, `👤 *Perfil de ${user.name}*
Tono: ${user.tone}
Género: ${user.gender}
Zona Horaria: ${user.timezone}
Registrado el: ${fechaRegistro}`, { parse_mode: 'Markdown' }, channel);
            return true;

        case '/diario':
        case '/journal':
            const param = text.split(' ')[1]?.toLowerCase();
            if (param === 'hoy') {
                await journal.handleJournalCommand(bot, chatId, user, 'hoy', channel);
            } else {
                await journal.handleJournalCommand(bot, chatId, user, 'semana', channel);
            }
            return true;

        case '/feedback':
            await sendChannelMessage(bot, chatId, '💡 Me encanta mejorar. ¿Qué sugerencia o problema te gustaría reportar? (Escríbelo en tu siguiente mensaje)', {}, channel);
            // In a more complex version, we could set a state here to save the next msg as feedback
            return true;

        case '/config':
        case '/configurar':
            const configParams = text.split(' ');
            const configParam1 = configParams[1]?.toLowerCase();
            const configParam2 = configParams[2]?.toLowerCase();

            if (configParam1 === 'proactivo') {
                try {
                    if (configParam2 === 'on') {
                        await db.saveMemory(user.id, 'config', 'proactive_enabled', 'true', 'system');
                        await sendChannelMessage(bot, chatId, '🔔 Mensajes proactivos *activados*.', { parse_mode: 'Markdown' }, channel);
                    } else if (configParam2 === 'off') {
                        await db.saveMemory(user.id, 'config', 'proactive_enabled', 'false', 'system');
                        await sendChannelMessage(bot, chatId, '🔕 Mensajes proactivos *desactivados*.', { parse_mode: 'Markdown' }, channel);
                    }
                } catch (e) {
                    await sendChannelMessage(bot, chatId, 'Hubo un error al actualizar la configuración de proactividad en la base de datos.', {}, channel);
                }
                return true;
            }
            await sendChannelMessage(bot, chatId, '⚙️ *Menú de Configuración*\n\nPuedes habilitar o deshabilitar los mensajes proactivos (ej. buenos días, buenas noches).\n\nPara encenderlos, usa: `/config proactivo on`\nPara apagarlos, usa: `/config proactivo off`', { parse_mode: 'Markdown' }, channel);
            return true;

        case '/plan':
        case '/suscripcion':
            let planMsg = `💳 *Tu Suscripción a KODA*\n\nPlan actual: *${user.plan.toUpperCase()}*\nEstado: *${user.plan_status.toUpperCase()}*`;
            if (user.plan_status === 'trial' && user.trial_ends_at) {
                const date = new Date(user.trial_ends_at).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
                planMsg += `\n\nTu periodo de prueba gratis termina el: *${date}*`;
            }
            if (user.plan === 'starter') {
                planMsg += `\n\nMensajes enviados hoy: ${user.messages_today || 0}/15`;
            } else {
                planMsg += `\n\nPuedes administrar tu forma de pago y descargar facturas ingresando a tu portal con tu usuario de Telegram: ${process.env.BASE_URL}/portal.html`;
            }
            await sendChannelMessage(bot, chatId, planMsg, { parse_mode: 'Markdown' }, channel);
            return true;

        case '/upgrade':
            if (user.plan !== 'starter' && user.plan_status === 'active') {
                await sendChannelMessage(bot, chatId, `¡Ya tienes una suscripción activa (${user.plan.toUpperCase()})! Si deseas cambiarla, ingresa a tu portal de cliente: ${process.env.BASE_URL}/portal.html`, {}, channel);
            } else {
                await sendChannelMessage(bot, chatId, `🚀 *Sube de Nivel en KODA*\n\nEl plan Starter te permite 15 mensajes al día y memoria de 3 días.\nCon los planes de pago obtienes Memoria Ilimitada, Mensajes Diarios Ilimitados, Avisos Proactivos y más.\n\nEscoge tu plan e inicia tu Trial de 3 días GRATIS aquí: ${process.env.BASE_URL}`, {}, channel);
            }
            return true;

        case '/cancelar':
            if (user.plan === 'starter') {
                await sendChannelMessage(bot, chatId, 'Actualmente estás en el plan Starter gratuito. No hay suscripciones de pago que cancelar.', {}, channel);
            } else {
                await sendChannelMessage(bot, chatId, `⚠️ Si deseas cancelar tu suscripción a KODA, por favor ingresa a tu Portal de Cliente en el siguiente enlace y haz clic en "Cancelar Plan":\n${process.env.BASE_URL}/portal.html`, {}, channel);
            }
            return true;

        case '/habitos':
            const { sendHabitsList } = require('./habits');
            await sendHabitsList(bot, chatId, user.id);
            return true;

        default:
            await sendChannelMessage(bot, chatId, 'Comando no reconocido. Prueba /ayuda', {}, channel);
            return true;
    }
}

module.exports = {
    handleCommand
};
