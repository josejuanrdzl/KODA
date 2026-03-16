const db = require('./services/supabase');
const { supabase } = db;
const { handleCommand } = require('./handlers/commands');
const { handleMainFlow } = require('./handlers/main');

// Import direct handlers
import { getWeather } from './handlers/weather.handler';
import { getExchangeRates } from './handlers/fx-rates.handler';
import { searchSpotify } from './handlers/spotify.handler';
import { fetchSportsData } from './handlers/sports.handler';
import { processLunaContext } from './handlers/luna.handler';
import { getFamilyContext } from './handlers/familia.handler';

// Import messaging handlers
import { handleKodaIdOnboarding } from '../modules/messaging/koda-id.handler';
import { handleConnections, connectByUsername, handleConnectionAction } from '../modules/messaging/connections.handler';
import { handleDirectMessages } from '../modules/messaging/direct-messages.handler';
import { handleRecallIntent } from '../modules/memory/recall.handler';

// Import executive handlers
import { handleGmailModule } from '../modules/executive/gmail.handler';
import { handleCalendarModule } from '../modules/executive/calendar.handler';

// Import Settings handler
import { handleSettings } from '../modules/onboarding/settings.handler';
import { handleTravelLocation } from './handlers/travel.handler';

import { handleOnboardingStart } from '../modules/onboarding/onboarding.handler';
import { isFlowActive, continueFlow } from './flow.engine';
import { redis } from '../redis';

export function hasModuleAccess(userPlan: string, requiredPlan: string): boolean {
    const PLAN_LEVELS: { [key: string]: number } = {
        'free': 0, 'lite': 1, 'lifestyle': 2,
        'executive': 3, 'business': 4
    };
    const uPlan = userPlan || 'free';
    const reqPlan = requiredPlan || 'free';
    return (PLAN_LEVELS[uPlan] || 0) >= (PLAN_LEVELS[reqPlan] || 0);
}

export async function loadCommands(): Promise<any[]> {
    const cached = await redis.get('koda:commands:all');
    if (cached) return JSON.parse(cached as string);

    const { data: commands, error } = await supabase
        .from('koda_commands')
        .select('id, trigger_type, trigger_value, module_slug, intent, priority, plan_required, is_active')
        .eq('is_active', true)
        .order('priority', { ascending: true });

    if (error) {
        console.error('[loadCommands] Error loading commands:', error);
        return [];
    }

    await redis.setex('koda:commands:all', 300, JSON.stringify(commands || []));
    return commands || [];
}

export function matchCommand(message: string, command: any): boolean {
    const msg = message.toLowerCase().trim();
    if (!command.trigger_value) return false;
    const val = command.trigger_value.toLowerCase();

    switch (command.trigger_type) {
        case 'exact':
            return msg === val;
        case 'contains':
            return msg.includes(val);
        case 'startsWith':
            return msg.startsWith(val);
        case 'regex':
            try {
                return new RegExp(command.trigger_value, 'i').test(message);
            } catch (e) {
                console.error('Invalid regex in command', command);
                return false;
            }
        default:
            return false;
    }
}

export async function findMatchingCommand(message: string, session: any): Promise<any | null> {
    const commands = await loadCommands();

    for (const command of commands) {
        if (!command.is_active) continue;
        
        // Verificar acceso al plan
        if (!hasModuleAccess(session.plan, command.plan_required)) {
            continue;
        }

        if (matchCommand(message, command)) {
            return command; // primer match gana
        }
    }

    return null; // ningún match
}

export async function invalidateCommandsCache(): Promise<void> {
    await redis.del('koda:commands:all');
}

export async function routeMessage(bot: any, msg: any, user: any, options: any): Promise<any> {
    const session = user; // BCF-02 alias
    const message = msg.text || '';

    // Normalizar: quitar slash, trim, lowercase
    let normalizedMessage = message.trim();
    if (normalizedMessage.startsWith('/')) {
        normalizedMessage = normalizedMessage.slice(1);
    }
    normalizedMessage = normalizedMessage.toLowerCase();

    // --- DIRECT CONNECTION INTENT INTERCEPTION ---
    const usernameMatch = normalizedMessage.match(/@([a-z0-9_]+)/);
    
    const connectionTriggers = [
        'conectar con', 'contactar con', 'hablar con',
        'chat con', 'quiero conectar', 'quiero contactar',
        'mensaje a', 'escribir a'
    ];
    
    const hasConnectionTrigger = connectionTriggers.some(
        t => normalizedMessage.includes(t)
    );

    if (usernameMatch && hasConnectionTrigger) {
        const targetKodaId = '@' + usernameMatch[1];
        return await connectByUsername(bot, session.id, targetKodaId, session);
    }

    // --- PASO 1: ¿Mensajería directa? ---
    if (user.mode === 'chat') {
        return await handleDirectMessages(bot, msg, user, options);
    }

    // --- PASO 2: ¿Flow activo? ---
    // Maneja onboarding en progreso, settings, confirmations, etc.
    if (isFlowActive(user)) {
        return await continueFlow(msg.text || '', user, options);
    }

    // --- PASO 3: ¿Trigger de cancelación sin flow? ---
    const CANCEL_TRIGGERS = ['cancelar', 'salir', 'stop', 'cancel', 'exit'];
    if (CANCEL_TRIGGERS.includes(normalizedMessage)) {
        return '¿En qué te ayudo?';
    }

    // --- PASO 3.5: Enforzar Onboarding inicial ---
    // Si no ha completado el onboarding y no está en flow, lo forzamos a iniciar.
    if (!user.onboarding_complete) {
        console.log(`[Router] User ${user.id} has not completed onboarding. Starting flow.`);
        return await handleOnboardingStart(user);
    }

    // --- 3. ADMIN RESET ---
    if (user.role === 'admin' && message.startsWith('/reset_onboarding')) {
        const targetTelegramId = message.split(' ')[1];
        if (!targetTelegramId) return "Uso: /reset_onboarding [telegram_id]";
        const { error } = await supabase.from('users').update({ 
            onboarding_complete: false, 
            exclusive_mode: 'onboarding',
            active_context: { mode: 'onboarding', step: 0, data: {} } 
        }).eq('telegram_id', targetTelegramId);
        
        if (error) return `Error al resetear onboarding: ${error.message}`;
        return `✅ Onboarding reseteado para el usuario ${targetTelegramId}`;
    }

    // --- PASO 4: CommandRegistry desde BD ---
    const matchedCommand = await findMatchingCommand(normalizedMessage, session);

    // Wrapper local para emular getModuleBySlug y execute()
    function getModuleBySlug(slug: string) {
        return {
            execute: async (envelope: any) => {
                const { userId, intent, location } = envelope;
                const mockMsg = { text: envelope.message };
                const mockOpts = { ...options, location, activeModule: slug };

                // Handlers interactivos
                if (slug === 'settings') return { response: await handleSettings(bot, mockMsg, session, mockOpts) };
                if (slug === 'travel') return { response: await handleTravelLocation(mockMsg, session, intent, mockOpts) };
                if (slug === 'messaging') return { response: await handleDirectMessages(bot, mockMsg, session, mockOpts) };
                if (slug === 'connections') return { response: await handleConnections(bot, mockMsg, session, mockOpts) };
                if (slug === 'gmail') return { response: await handleGmailModule(bot, mockMsg, session, mockOpts) };
                if (slug === 'calendar') return { response: await handleCalendarModule(bot, mockMsg, session, mockOpts) };
                if (slug === 'core' && intent === 'show_commands') {
                    return { response: "Comandos disponibles:\n- Clima\n- Dólar\n- Hábitos\n- Configuración\n- Ayuda" };
                }

                // Inyectores de contexto
                let injectedData = null;
                try {
                    if (slug === 'weather') {
                        const match = mockMsg.text.match(/en\s+([a-zA-Z\s]+)(\?|$)/i);
                        const city = match ? match[1].trim() : (mockOpts?.location?.city || undefined);
                        injectedData = await getWeather(userId, city);
                    } else if (slug === 'fx-rates') {
                        injectedData = await getExchangeRates('MXN');
                    } else if (slug === 'spotify') {
                        injectedData = await searchSpotify(mockMsg.text);
                    } else if (slug === 'sports') {
                        const match = mockMsg.text.match(/(nfl|nba|mlb|nhl|f1|liga mx|premier league|la liga|champions|europa league|mls)/i);
                        let league = 'ligamx';
                        if (match) {
                            league = match[1].toLowerCase().replace(/\s+/g, '');
                            if (league === 'champions') league = 'championsleague';
                        }
                        injectedData = await fetchSportsData(league);
                    } else if (slug === 'luna') {
                        injectedData = await processLunaContext(userId);
                    } else if (slug === 'shopping') {
                        const list = await db.getOrCreateDefaultShoppingList(userId);
                        const items = await db.getShoppingItems(list.id);
                        const pending = items.filter((i: any) => !i.is_checked);
                        if (pending.length === 0) injectedData = "La lista de compras está actualmente vacía.";
                        else injectedData = "Lista de compras pendiente:\n" + pending.map((i: any) => `- ${i.name} ${i.quantity ? `(${i.quantity})` : ''}`).join('\n');
                    } else if (slug === 'familia') {
                        injectedData = await getFamilyContext(userId);
                    } else if (slug === 'habits' || slug === 'reminders') {
                        // Dejamos que pase a handleMainFlow como recordatorio/hábito genérico
                        injectedData = `[El usuario está solicitando información sobre sus ${slug}]`; 
                    }
                } catch (e) {
                    console.error(`[Router] Error executing context fetcher for ${slug}:`, e);
                }

                // Si produjo datos inyectables, resolvemos el comando a través de Claude
                if (injectedData) {
                    mockMsg.text = `\n[SISTEMA - DATOS DE MÓDULO ${slug.toUpperCase()}]:\n${injectedData}\n\n[MENSAJE DEL USUARIO]:\n${mockMsg.text}`;
                    const finalResponse = await handleMainFlow(bot, mockMsg, session, mockOpts);
                    return { response: finalResponse };
                }

                return { response: "Módulo no implementado o sin respuesta." };
            }
        };
    }

    if (matchedCommand) {
        const moduleHandler = getModuleBySlug(matchedCommand.module_slug);

        if (moduleHandler) {
            const { updateSession } = require('./session.manager'); // Lazy load to avoid circular
            
            const result = await moduleHandler.execute({
                userId:    session.id, // En session manager es id
                userPlan:  session.plan,
                intent:    matchedCommand.intent,
                message:   message, // El original
                normalizedMsg: normalizedMessage,
                location:  { city: session.effectiveCity || session.city,
                             country: session.country,
                             lat: session.lat,
                             lng: session.lng },
                temporal:  session.temporal,
                aiEngine:  options.aiEngine,  // del Ítem 1
                context: {
                    flowData:        session.flowData,
                    memoryFragments: [],  // BCF-07 lo llenará en Ítem 6
                    userName:        session.first_name,
                }
            });

            // Actualizar session al final
            await updateSession(session, {
                lastModuleSlug: matchedCommand.module_slug,
                lastMessageAt:  Date.now(),
                conversationTurn: (session.conversationTurn || 0) + 1
            });

            return result.response;
        }
    }

    // --- older connection handler bypass in case DB is missing the command temporally ---
    const connectionRegex = /@[a-z0-9_]+/;
    const connectionKeywords = ["conectar", "contactar", "hablar con", "mensaje a", "escribir a", "chat con"];
    if (!matchedCommand && connectionRegex.test(normalizedMessage) && connectionKeywords.some(keyword => normalizedMessage.includes(keyword))) {
        return await handleConnections(bot, msg, session, options);
    }

    // --- PASO 5: Claude conversacional ---
    // (sin historial — solo mensaje actual)
    if (matchedCommand) {
        options.activeModule = matchedCommand.target_module;
    }
    return await handleMainFlow(bot, msg, session, options);
}

// Clean up performContextInjection to appease old imports if any
export async function performContextInjection(msg: any, user: any): Promise<string> { return ""; }
export const contextInjectors = {};
