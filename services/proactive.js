const cron = require('node-cron');
const db = require('./supabase');
const claude = require('./claude');

async function getLastProactiveSent(user_id, type) {
    const { data, error } = await db.supabase
        .from('memories')
        .select('value')
        .eq('user_id', user_id)
        .eq('category', 'proactive')
        .eq('key', type)
        .limit(1);
    if (error) {
        console.error('Error fetching proactive memory', error);
        return null;
    }
    return data && data.length > 0 ? data[0].value : null;
}

async function markProactiveSent(user_id, type, dateStr) {
    const { data: existing } = await db.supabase
        .from('memories')
        .select('id')
        .eq('user_id', user_id)
        .eq('category', 'proactive')
        .eq('key', type)
        .limit(1);

    if (existing && existing.length > 0) {
        await db.supabase.from('memories').update({ value: dateStr, updated_at: new Date().toISOString() }).eq('id', existing[0].id);
    } else {
        await db.supabase.from('memories').insert([{ user_id, category: 'proactive', key: type, value: dateStr, context: 'auto' }]);
    }
}

function startCron(bot) {
    // Run at the beginning of every hour
    cron.schedule('0 * * * *', async () => {
        try {
            const users = await db.getAllUsers();
            const now = new Date();

            for (const user of users) {
                // Fetch proactive config from memories
                const { data: config } = await db.supabase
                    .from('memories')
                    .select('value')
                    .eq('user_id', user.id)
                    .eq('category', 'config')
                    .eq('key', 'proactive_enabled')
                    .limit(1);

                const isProactiveEnabled = config && config.length > 0 ? config[0].value !== 'false' : true;

                // If the user disabled proactive messaging via /config proactivo off, skip
                if (!isProactiveEnabled) continue;

                const userTz = user.timezone || 'America/Chihuahua';

                let localHour;
                let todayStr;
                try {
                    const localHourStr = now.toLocaleString("en-US", { timeZone: userTz, hour: '2-digit', hour12: false });
                    localHour = parseInt(localHourStr);
                    todayStr = now.toLocaleDateString("en-US", { timeZone: userTz });
                } catch (e) {
                    console.error("Timezone error for user", user.id, e);
                    continue; // Skip if invalid tz
                }

                let activeType = null;
                let promptInstruction = '';

                if (localHour === 8) {
                    activeType = 'morning';
                    promptInstruction = 'Escribe un mensaje corto y muy motivador de buenos días para empezar con energía. Incluye alguna curiosidad breve o consejo rápido.';
                } else if (localHour === 14) {
                    activeType = 'checkin';
                    promptInstruction = 'Escribe un mensaje casual para preguntar cómo va su tarde y recordarle tomar agua o estirarse.';
                } else if (localHour === 19) {
                    activeType = 'evening';
                    promptInstruction = 'Escribe un mensaje de cierre de día laboral. Pregunta qué fue lo mejor de su día e invítalo a reflexionar escribiendo sobre su día (o usando /diario hoy).';
                } else if (localHour === 22) {
                    activeType = 'night';
                    promptInstruction = 'Escribe un mensaje breve de buenas noches, ayudando a desconectar y deseando un buen descanso.';
                }

                if (activeType) {
                    const lastSent = await getLastProactiveSent(user.id, activeType);
                    if (lastSent !== todayStr) {
                        console.log(`Enviando mensaje proactivo ${activeType} a ${user.name}`);
                        const userText = `[SISTEMA INTERNO]: Es hora del mensaje proactivo de tipo: ${activeType}. ${promptInstruction}`;

                        const [recentMessages, recentNotes, recentMemories, activeReminders, recentJournals, emotionalTimeline] = await Promise.all([
                            db.getRecentMessages(user.id, 5),
                            db.getRecentNotes(user.id, 5),
                            db.getRecentMemories(user.id, 5),
                            db.getActiveReminders(user.id),
                            db.getRecentJournalEntries(user.id, 5),
                            db.getEmotionalTimeline(user.id, 5)
                        ]);

                        const chatHistory = [...recentMessages].reverse();

                        const aiResponse = await claude.generateResponse(
                            user,
                            userText,
                            chatHistory,
                            recentMemories,
                            recentNotes,
                            activeReminders,
                            recentJournals,
                            emotionalTimeline
                        );

                        const { parseActions } = require('../utils/actionParser');
                        const { strippedText } = parseActions(aiResponse.text);

                        try {
                            await bot.sendMessage(user.telegram_id, strippedText, { parse_mode: 'Markdown' });
                        } catch (sendErr) {
                            await bot.sendMessage(user.telegram_id, strippedText);
                        }

                        await db.saveMessage({
                            user_id: user.id,
                            channel: 'telegram',
                            role: 'assistant',
                            content: strippedText,
                            content_type: 'text'
                        });

                        await markProactiveSent(user.id, activeType, todayStr);
                    }
                }
            }
        } catch (error) {
            console.error('Error en el cron proactivo:', error);
        }
    });

    console.log('Cron de proactividad inicializado (ejecución cada hora en punto).');
}

module.exports = {
    startCron
};
