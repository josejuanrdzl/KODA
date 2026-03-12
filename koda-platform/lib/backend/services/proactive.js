const cron = require('node-cron');
const db = require('./supabase');
const claude = require('./claude');
const { sendChannelMessage } = require('../utils/messenger');
const { getWeather } = require('../handlers/weather.handler');
const { getExchangeRates } = require('../handlers/fx-rates.handler');
const { checkModuleAccess } = require('../module.router');

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
                let injectedContext = '';

                if (localHour === 8) {
                    activeType = 'morning';
                    promptInstruction = 'Escribe un mensaje corto y muy motivador de buenos días para empezar con energía. Incluye alguna curiosidad breve o consejo rápido.';

                    // CHECK IF WEATHER MODULE IS ENABLED
                    const hasWeather = await checkModuleAccess(user, 'weather');
                    if (hasWeather) {
                        try {
                            const weatherData = await getWeather(user.id);
                            injectedContext += `\n[SISTEMA - DATOS DE MÓDULO WEATHER (PRONÓSTICO HOY)]:\n${weatherData}\nMenciona brevemente cómo estará el clima hoy en tu mensaje de buenos días de forma natural.`;
                        } catch (e) {
                            console.error("Error fetching weather for proactive message", e);
                        }
                    }

                    // CHECK IF FX-RATES MODULE IS ENABLED
                    const hasFxRates = await checkModuleAccess(user, 'fx-rates');
                    if (hasFxRates) {
                        try {
                            const fxData = await getExchangeRates('MXN');
                            injectedContext += `\n[SISTEMA - DATOS DE MÓDULO FX-RATES (TIPO DE CAMBIO HOY)]:\n${fxData}\nSi es relevante o útil, menciona el tipo de cambio actual de forma muy breve y natural.`;
                        } catch (e) {
                            console.error("Error fetching fx rates for proactive message", e);
                        }
                    }

                    // CHECK IF SPORTS MODULE IS ENABLED
                    const hasSports = await checkModuleAccess(user, 'sports');
                    if (hasSports) {
                        try {
                            // Import it dynamically or ensure it's at the top
                            const { fetchSportsData } = require('../handlers/sports.handler');
                            // We can fetch a top league by default, e.g., 'ligamx' or a summary
                            const sportsData = await fetchSportsData('ligamx');
                            injectedContext += `\n[SISTEMA - DATOS DE MÓDULO SPORTS (PARTIDOS HOY)]:\n${sportsData}\nDado que al usuario le interesan los deportes, menciona si hay algún partido interesante hoy de forma muy breve.`;
                        } catch (e) {
                            console.error("Error fetching sports for proactive message", e);
                        }
                    }

                    // CHECK IF LUNA MODULE IS ENABLED
                    const hasLuna = await checkModuleAccess(user, 'luna');
                    if (hasLuna) {
                        try {
                            const { processLunaContext } = require('../handlers/luna.handler');
                            const lunaData = await processLunaContext(user.id);
                            if (lunaData && !lunaData.includes('no ha registrado')) {
                                injectedContext += `\n[SISTEMA - DATOS DE MÓDULO LUNA (CICLO ACTUAL)]:\n${lunaData}\nAdapta ligeramente tu tono de buenos días según su fase del ciclo (ej. más empatía y calma si está en menstruación/lútea, más energía si está en folicular/ovulación). No seas invasivo, sólo tómalo en cuenta.`;
                            }
                        } catch (e) {
                            console.error("Error fetching luna data for proactive message", e);
                        }
                    }

                    // CHECK IF FAMILIA MODULE IS ENABLED
                    const hasFamilia = await checkModuleAccess(user, 'familia');
                    if (hasFamilia) {
                        try {
                            const { getFamilyContext } = require('../handlers/familia.handler');
                            const nowTz = new Date().toLocaleString("en-US", { timeZone: userTz });
                            const today = new Date(nowTz);
                            const familyData = await getFamilyContext(user.id, today);
                            if (familyData && !familyData.includes('No tienes familiares registrados')) {
                                injectedContext += `\n[SISTEMA - DATOS DE MÓDULO FAMILIA (HOY)]:\n${familyData}\nMenciona sutilmente alguna actividad familiar de hoy (si la hay) o da un breve mensaje recordatorio. (Ejemplo: "Hoy tienes el partido de Sofia a las 17:00")`;
                            }
                        } catch (e) {
                            console.error("Error fetching familia data for proactive message", e);
                        }
                    }
                } else if (localHour === 14) {
                    activeType = 'checkin';
                    promptInstruction = 'Escribe un mensaje casual para preguntar cómo va su tarde y recordarle tomar agua o estirarse.';
                } else if (localHour === 19) {
                    activeType = 'evening';
                    promptInstruction = 'Escribe un mensaje de cierre de día laboral. Pregunta qué fue lo mejor de su día e invítalo a reflexionar escribiendo sobre su día (o usando /diario hoy).';

                    // CHECK IF SHOPPING MODULE IS ENABLED
                    const hasShopping = await checkModuleAccess(user, 'shopping');
                    if (hasShopping) {
                        try {
                            const list = await db.getOrCreateDefaultShoppingList(user.id);
                            const items = await db.getShoppingItems(list.id);
                            const pending = items.filter(i => !i.is_completed);
                            if (pending.length > 0) {
                                injectedContext += `\n[SISTEMA - DATOS DE MÓDULO SHOPPING (LISTA PENDIENTE)]:\nHay ${pending.length} artículos pendientes en su lista de compras del súper. Considera recordarle muy sutilmente que tiene compras pendientes al cerrar el día laboral.`;
                            }
                        } catch (e) {
                            console.error("Error fetching shopping for proactive message", e);
                        }
                    }
                } else if (localHour === 22) {
                    activeType = 'night';
                    promptInstruction = 'Escribe un mensaje breve de buenas noches, ayudando a desconectar y deseando un buen descanso.';
                }

                if (activeType) {
                    const lastSent = await getLastProactiveSent(user.id, activeType);
                    if (lastSent !== todayStr) {
                        console.log(`Enviando mensaje proactivo ${activeType} a ${user.name}`);
                        let userText = `[SISTEMA INTERNO]: Es hora del mensaje proactivo de tipo: ${activeType}. ${promptInstruction}`;
                        if (injectedContext) {
                            userText += `\\n${injectedContext}`;
                        }

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

                        const channel = user.whatsapp_id ? 'whatsapp' : 'telegram';
                        const targetId = channel === 'whatsapp' ? user.whatsapp_id : user.telegram_id;

                        if (targetId) {
                            try {
                                await sendChannelMessage(bot, targetId, strippedText, { parse_mode: 'Markdown' }, channel);
                            } catch (sendErr) {
                                await sendChannelMessage(bot, targetId, strippedText, {}, channel);
                            }

                            await db.saveMessage({
                                user_id: user.id,
                                channel: channel,
                                role: 'assistant',
                                content: strippedText,
                                content_type: 'text'
                            });
                        }

                        await markProactiveSent(user.id, activeType, todayStr);
                    }
                }
            }
        } catch (error) {
            console.error('Error en el cron proactivo:', error);
        }
    });

    // 5-minute cron for Live Sports
    cron.schedule('*/5 * * * *', async () => {
        try {
            const { fetchLiveMatches } = require('../handlers/sports.handler');
            const leaguesToCheck = ['ligamx', 'championsleague', 'nfl', 'nba'];

            let allLiveMatches = [];
            for (const league of leaguesToCheck) {
                const matches = await fetchLiveMatches(league);
                allLiveMatches = allLiveMatches.concat(matches);
            }

            if (allLiveMatches.length === 0) return;

            const users = await db.getAllUsers();
            for (const user of users) {
                const hasSports = await checkModuleAccess(user, 'sports');
                if (!hasSports) continue;

                // Build a summary of things that changed
                let updatesForUser = [];
                for (const match of allLiveMatches) {
                    const matchKey = `live_sports_${match.id}`;
                    const currentScoreStr = `${match.homeScore}-${match.awayScore}`;

                    const { data: mem } = await db.supabase
                        .from('memories')
                        .select('id, value')
                        .eq('user_id', user.id)
                        .eq('category', 'sports_live')
                        .eq('key', matchKey)
                        .limit(1);

                    const lastScore = mem && mem.length > 0 ? mem[0].value : null;

                    if (lastScore !== currentScoreStr) {
                        updatesForUser.push(`${match.homeTeam} ${match.homeScore} - ${match.awayScore} ${match.awayTeam} (${match.description})`);

                        if (mem && mem.length > 0) {
                            await db.supabase.from('memories').update({ value: currentScoreStr, updated_at: new Date().toISOString() }).eq('id', mem[0].id);
                        } else {
                            await db.supabase.from('memories').insert([{
                                user_id: user.id,
                                category: 'sports_live',
                                key: matchKey,
                                value: currentScoreStr,
                                context: 'auto'
                            }]);
                        }
                    }
                }

                if (updatesForUser.length > 0) {
                    // Send an update to the user
                    console.log(`Enviando actualización deportiva en vivo a ${user.name}`);
                    const userText = `[SISTEMA INTERNO]: Hay actualizaciones en partidos deportivos en vivo:\n${updatesForUser.join('\\n')}\nRedacta un mensaje MUY BREVE y emocionante informando al usuario sobre estos cambios en el marcador.`;

                    const aiResponse = await claude.generateResponse(
                        user,
                        userText,
                        [], [], [], [], [], []
                    );

                    const { parseActions } = require('../utils/actionParser');
                    const { strippedText } = parseActions(aiResponse.text);

                    const channel = user.whatsapp_id ? 'whatsapp' : 'telegram';
                    const targetId = channel === 'whatsapp' ? user.whatsapp_id : user.telegram_id;

                    if (targetId) {
                        try {
                            await sendChannelMessage(bot, targetId, strippedText, { parse_mode: 'Markdown' }, channel);
                        } catch (sendErr) {
                            await sendChannelMessage(bot, targetId, strippedText, {}, channel);
                        }

                        await db.saveMessage({
                            user_id: user.id,
                            channel: channel,
                            role: 'assistant',
                            content: strippedText,
                            content_type: 'text'
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Error en el cron de deportes en vivo:', error);
        }
    });

    console.log('Cron de proactividad inicializado (ejecución cada hora en punto y deportes cada 5 min).');
}

module.exports = {
    startCron
};
