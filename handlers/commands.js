const db = require('../services/supabase');

async function handleCommand(bot, msg, user) {
    const text = msg.text || '';
    const chatId = msg.chat.id;

    if (!text.startsWith('/')) return false;

    const command = text.split(' ')[0].toLowerCase();

    switch (command) {
        case '/ayuda':
        case '/help':
            await bot.sendMessage(chatId, `🧠 *Comandos Disponibles KODA*
/notas o /notes — Lista tus últimas notas.
/recordatorios o /reminders — Lista tus recordatorios activos.
/config o /configurar — (Próximamente) Menú de configuración.
/perfil o /profile — Muestra tu perfil actual.
/diario o /journal — (Próximamente) Entrada formal en tu diario.
/feedback — Envía sugerencias sobre mi funcionamiento.`, { parse_mode: 'Markdown' });
            return true;

        case '/notas':
        case '/notes':
            const notas = await db.getRecentNotes(user.id, 10);
            if (notas.length === 0) {
                await bot.sendMessage(chatId, 'No tienes notas guardadas actualmente.');
            } else {
                const notasText = notas.map((n, i) => `${i + 1}. [${n.tag || 'general'}] ${n.content}`).join('\n');
                await bot.sendMessage(chatId, `📝 *Tus últimas 10 notas:*\n${notasText}`, { parse_mode: 'Markdown' });
            }
            return true;

        case '/recordatorios':
        case '/reminders':
            const recordatorios = await db.getActiveReminders(user.id);
            if (recordatorios.length === 0) {
                await bot.sendMessage(chatId, 'No tienes recordatorios activos.');
            } else {
                const recText = recordatorios.map((r, i) => `${i + 1}. ${r.content} (🕒 ${new Date(r.remind_at).toLocaleString()})`).join('\n');
                await bot.sendMessage(chatId, `⏰ *Tus recordatorios activos:*\n${recText}`, { parse_mode: 'Markdown' });
            }
            return true;

        case '/perfil':
        case '/profile':
            const fechaRegistro = new Date(user.created_at).toLocaleDateString();
            await bot.sendMessage(chatId, `👤 *Perfil de ${user.name}*
Tono: ${user.tone}
Género: ${user.gender}
Zona Horaria: ${user.timezone}
Registrado el: ${fechaRegistro}`, { parse_mode: 'Markdown' });
            return true;

        case '/diario':
        case '/journal':
            await bot.sendMessage(chatId, '📓 Dime cómo estuvo tu día y lo guardaré en tu Diario Personal.');
            return true;

        case '/feedback':
            await bot.sendMessage(chatId, '💡 Me encanta mejorar. ¿Qué sugerencia o problema te gustaría reportar? (Escríbelo en tu siguiente mensaje)');
            // In a more complex version, we could set a state here to save the next msg as feedback
            return true;

        case '/config':
        case '/configurar':
            await bot.sendMessage(chatId, '⚙️ Menú de configuración en desarrollo.');
            return true;

        default:
            await bot.sendMessage(chatId, 'Comando no reconocido. Prueba /ayuda');
            return true;
    }
}

module.exports = {
    handleCommand
};
