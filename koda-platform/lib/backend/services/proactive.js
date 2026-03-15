const cron = require('node-cron');
const axios = require('axios');
const db = require('./supabase');
const claude = require('./claude');
const { sendChannelMessage } = require('../utils/messenger');
const { getWeather } = require('../handlers/weather.handler');
const { getExchangeRates } = require('../handlers/fx-rates.handler');
const { checkModuleAccess } = require('../module.router');
const { selectAIEngine } = require('../ai.selector');

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

                const morningHour = user.proactive_good_morning ? parseInt(user.proactive_good_morning.split(':')[0]) : 8;
                const middayHour = user.proactive_midday ? parseInt(user.proactive_midday.split(':')[0]) : 14;
                const eveningHour = user.proactive_end_of_day ? parseInt(user.proactive_end_of_day.split(':')[0]) : 19;
                const nightHour = user.proactive_good_night ? parseInt(user.proactive_good_night.split(':')[0]) : 22;

                if (localHour === morningHour) {
                    activeType = 'morning';
                    promptInstruction = `Escribe un mensaje matutino muy completo y natural (estilo "Morning Briefing"). 
                    - Usa un tono ${user.plan === 'personal' || user.plan === 'starter' ? 'cálido y casual (lifestyle)' : 'profesional y ejecutivo'}.
                    - Integra las secciones de Clima, Tipo de Cambio, Familia y Deportes si están disponibles en el contexto inyectado.
                    - Redacta de forma fluida, NO como una lista.
                    - Máximo 300 palabras.`;

                    // SECTION 1: WEATHER (wttr.in)
                const hasWeather = await checkModuleAccess(user, 'weather');
                if (hasWeather) {
                    try {
                        const { data: locFacts } = await db.supabase
                            .from('memories')
                            .select('value')
                            .eq('user_id', user.id)
                            .eq('category', 'config')
                            .eq('key', 'ciudad')
                            .limit(1);

                        const city = locFacts && locFacts.length > 0 ? locFacts[0].value : null;
                        if (city) {
                                const weatherRes = await axios.get(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
                                if (weatherRes.data && weatherRes.data.current_condition) {
                                    const curr = weatherRes.data.current_condition[0];
                                    const high = weatherRes.data.weather[0].maxtempC;
                                    injectedContext += `\n[SISTEMA - DATOS DE MÓDULO WEATHER]:\nCiudad: ${city}, Temperatura: ${curr.temp_C}°C, Condición: ${curr.lang_es ? curr.lang_es[0].value : curr.weatherDesc[0].value}, Máxima hoy: ${high}°C\n`;
                                }
                            }
                        } catch (e) {
                            console.error("Error fetching wttr.in weather", e.message);
                        }
                    }

                    // SECTION 2: FX RATES (Banxico)
                    const hasFxRates = await checkModuleAccess(user, 'fx-rates');
                    if (hasFxRates) {
                        try {
                            const banxicoRes = await axios.get('https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF43718/datos/oportuno', {
                                headers: { 'Bmx-Token': process.env.BANXICO_TOKEN || 'a979203309a96e94474324f92376e19198305c48b2913e642398516d7a468d60' }
                            });
                            if (banxicoRes.data && banxicoRes.data.bmx && banxicoRes.data.bmx.series) {
                                const currentRate = parseFloat(banxicoRes.data.bmx.series[0].datos[0].dato);
                                
                                const { data: lastFxMem } = await db.supabase
                                    .from('memories')
                                    .select('value')
                                    .eq('user_id', user.id)
                                    .eq('category', 'finance')
                                    .eq('key', 'last_fx_usd_mxn')
                                    .limit(1);
                                
                                const lastRate = lastFxMem && lastFxMem.length > 0 ? parseFloat(lastFxMem[0].value) : null;
                                let diffText = "";
                                if (lastRate) {
                                    const diff = (currentRate - lastRate).toFixed(4);
                                    const arrow = currentRate > lastRate ? "↑" : "↓";
                                    diffText = ` (${arrow} ${Math.abs(diff)} respecto a ayer)`;
                                }

                                injectedContext += `\n[SISTEMA - DATOS DE MÓDULO FX-RATES]:\nUSD/MXN: $${currentRate}${diffText}\n`;

                                // Update memory for tomorrow
                                if (lastFxMem && lastFxMem.length > 0) {
                                    await db.supabase.from('memories').update({ value: currentRate.toString() }).eq('id', lastFxMem[0].id);
                                } else {
                                    await db.supabase.from('memories').insert([{ user_id: user.id, category: 'finance', key: 'last_fx_usd_mxn', value: currentRate.toString() }]);
                                }
                            }
                        } catch (e) {
                            console.error("Error fetching Banxico FX", e.message);
                        }
                    }

                    // SECTION 3: FAMILIA (Direct SQL via Supabase)
                    const hasFamilia = await checkModuleAccess(user, 'familia');
                    if (hasFamilia) {
                        try {
                            const nowTz = new Date().toLocaleString("en-US", { timeZone: userTz });
                            const today = new Date(nowTz);
                            const dayNum = today.getDay(); // 0=domingo
                            const month = today.getMonth() + 1;
                            const day = today.getDate();

                            // Activities
                            const { data: activities } = await db.supabase
                                .from('family_activities')
                                .select(`
                                    name, start_time,
                                    family_members!inner(name, user_id)
                                `)
                                .eq('family_members.user_id', user.id)
                                .contains('day_of_week', [dayNum]);

                            // Birthdays
                            const { data: birthdays } = await db.supabase
                                .from('family_members')
                                .select('name')
                                .eq('user_id', user.id)
                                .filter('birthdate', 'isnot', null);

                            const todaysBirthdays = (birthdays || []).filter(m => {
                                const b = new Date(m.birthdate);
                                return (b.getUTCMonth() + 1) === month && b.getUTCDate() === day;
                            });

                            if ((activities && activities.length > 0) || todaysBirthdays.length > 0) {
                                let famText = "[SISTEMA - DATOS DE MÓDULO FAMILIA]:\n";
                                if (todaysBirthdays.length > 0) {
                                    famText += `¡Cumpleaños de hoy!: ${todaysBirthdays.map(b => b.name).join(', ')} 🎂\n`;
                                }
                                if (activities && activities.length > 0) {
                                    famText += "Actividades hoy:\n" + activities.map(a => `- ${a.family_members.name}: ${a.name} a las ${a.start_time}`).join('\n');
                                }
                                injectedContext += `\n${famText}\n`;
                            }
                        } catch (e) {
                            console.error("Error fetching familia context for cron", e.message);
                        }
                    }

                    // SECTION 4: SPORTS (ESPN API)
                    const hasSports = await checkModuleAccess(user, 'sports');
                    if (hasSports) {
                        try {
                            const { data: teams } = await db.supabase
                                .from('user_sports_teams')
                                .select('*')
                                .eq('user_id', user.id);

                            if (teams && teams.length > 0) {
                                const leagueMap = {
                                    'sports-nfl': 'football/nfl',
                                    'sports-nba': 'basketball/nba',
                                    'sports-mlb': 'baseball/mlb',
                                    'sports-nhl': 'hockey/nhl',
                                    'sports-mls': 'soccer/usa.1',
                                    'sports-bbva': 'soccer/mex.1',
                                    'sports-epl': 'soccer/eng.1',
                                    'sports-laliga': 'soccer/esp.1'
                                };

                                let sportsMatches = [];
                                for (const team of teams) {
                                    const path = leagueMap[team.league_slug];
                                    if (!path) continue;

                                    const espnRes = await axios.get(`https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard`);
                                    if (espnRes.data && espnRes.data.events) {
                                        const teamMatch = espnRes.data.events.find(e => 
                                            e.competitions[0].competitors.some(c => c.team.displayName.toLowerCase().includes(team.team_name.toLowerCase()) || (team.team_id && c.team.id === team.team_id))
                                        );

                                        if (teamMatch) {
                                            const eventDate = new Date(teamMatch.date);
                                            // Check if it's today in user's timezone
                                            const eventDay = eventDate.toLocaleDateString("en-US", { timeZone: userTz });
                                            const todayDay = new Date().toLocaleDateString("en-US", { timeZone: userTz });
                                            
                                            if (eventDay === todayDay) {
                                                const home = teamMatch.competitions[0].competitors.find(c => c.homeAway === 'home').team.displayName;
                                                const away = teamMatch.competitions[0].competitors.find(c => c.homeAway === 'away').team.displayName;
                                                const time = eventDate.toLocaleTimeString("es-MX", { timeZone: userTz, hour: '2-digit', minute: '2-digit' });
                                                sportsMatches.push(`${home} vs ${away} a las ${time}`);
                                            }
                                        }
                                    }
                                }

                                if (sportsMatches.length > 0) {
                                    injectedContext += `\n[SISTEMA - DATOS DE MÓDULO SPORTS]:\nPartidos de tus equipos hoy:\n${sportsMatches.map(m => `- ${m}`).join('\n')}\n`;
                                }
                            }
                        } catch (e) {
                            console.error("Error fetching sports context for cron", e.message);
                        }
                    }

                    // SECTION 5: GMAIL
                    const hasGmail = await checkModuleAccess(user, 'gmail');
                    if (hasGmail) {
                        try {
                            const { getGoogleToken } = require('../modules/executive/google.connector');
                            const tokenData = await getGoogleToken(user.id);
                            if (tokenData) {
                                const listRes = await axios.get('https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread&maxResults=1', {
                                    headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
                                });
                                const unreadCount = listRes.data.resultSizeEstimate || (listRes.data.messages ? listRes.data.messages.length : 0);
                                if (unreadCount > 0) {
                                    injectedContext += `\n[SISTEMA - DATOS DE MÓDULO GMAIL]:\nTienes aproximadamente ${unreadCount} correos sin leer en tu bandeja de entrada.\n`;
                                }
                            }
                        } catch (e) {
                            console.error("Error fetching Gmail context for cron", e.message);
                        }
                    }

                    // SECTION 6: CALENDAR
                    const hasCalendar = await checkModuleAccess(user, 'calendar');
                    if (hasCalendar) {
                        try {
                            const { getGoogleToken } = require('../modules/executive/google.connector');
                            const tokenData = await getGoogleToken(user.id);
                            if (tokenData) {
                                const startStr = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
                                const endStr = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();
                                const queryUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(startStr)}&timeMax=${encodeURIComponent(endStr)}&singleEvents=true&orderBy=startTime`;
                                
                                const eventsRes = await axios.get(queryUrl, {
                                    headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
                                });
                                const events = eventsRes.data.items || [];
                                if (events.length > 0) {
                                    injectedContext += `\n[SISTEMA - DATOS DE MÓDULO CALENDAR]:\nEventos programados para hoy:\n`;
                                    events.forEach(evt => {
                                        const start = evt.start.dateTime ? new Date(evt.start.dateTime) : new Date(evt.start.date);
                                        const timeFormatter = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', timeZone: userTz });
                                        const timeStr = evt.start.dateTime ? timeFormatter.format(start) : 'Todo el día';
                                        injectedContext += `- ${timeStr}: ${evt.summary || 'Sin título'}\n`;
                                    });
                                }
                            }
                        } catch (e) {
                            console.error("Error fetching Calendar context for cron", e.message);
                        }
                    }
                } else if (localHour === middayHour) {
                    activeType = 'checkin';
                    promptInstruction = 'Escribe un mensaje casual para preguntar cómo va su tarde y recordarle tomar agua o estirarse.';
                } else if (localHour === eveningHour) {
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
                } else if (localHour === nightHour) {
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
                        const aiEngine = await selectAIEngine(user.id);

                        const aiResponse = await claude.generateResponse(
                            user,
                            userText,
                            chatHistory,
                            recentMemories,
                            recentNotes,
                            activeReminders,
                            recentJournals,
                            emotionalTimeline,
                            [], // activeHabits
                            [], // disabledModules
                            aiEngine,
                            null // familyContext
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

    // 5-minute cron for Live Sports (Delegated to specialized job)
    cron.schedule('*/5 * * * *', async () => {
        try {
            const { runSportsAlertsJob } = require('../jobs/sports-alerts.job');
            await runSportsAlertsJob(bot);
        } catch (error) {
            console.error('Error en el cron de deportes en vivo:', error);
        }
    });

    // Nightly cleanup of expired conversation memories
    cron.schedule('0 3 * * *', async () => {
        try {
            console.log('[Cron] Running nightly memory cleanup...');
            const { error } = await db.supabase.rpc('expire_old_memories');
            if (error) {
                console.error('[Cron] Error running memory cleanup:', error);
            } else {
                console.log('[Cron] Memory cleanup completed successfully.');
            }
        } catch (error) {
            console.error('[Cron] Error scheduling memory cleanup:', error);
        }
    });

    // 5-minute cron for AI Engine Health Check
    cron.schedule('*/5 * * * *', async () => {
        try {
            const { healthCheckEngines } = require('../ai.selector');
            await healthCheckEngines();
        } catch (error) {
            console.error('[Cron] Error en el AI Health Check:', error);
        }
    });

    console.log('Cron de proactividad inicializado (ejecución cada hora en punto y deportes cada 5 min).');
}

module.exports = {
    startCron
};
