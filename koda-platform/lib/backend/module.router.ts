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

import { handleOnboarding } from '../modules/onboarding/onboarding.handler';
import { redis } from '../redis';

export async function checkModuleAccess(user: any, moduleSlug: string): Promise<boolean> {
    if (!user || !user.tenant_id || !user.plan) {
        return false;
    }

    try {
        const { data: tenantModule, error: tenantErr } = await supabase
            .from('tenant_modules')
            .select('enabled_at, disabled_at')
            .eq('tenant_id', user.tenant_id)
            .eq('module_slug', moduleSlug)
            .maybeSingle();

        if (tenantModule) {
            if (tenantModule.enabled_at && !tenantModule.disabled_at) return true;
            if (tenantModule.disabled_at) return false;
        }

        let planSlug = user.plan;
        if (user.tenant_id) {
            const { data: tenant } = await supabase.from('tenants').select('plan').eq('id', user.tenant_id).single();
            if (tenant && tenant.plan) planSlug = tenant.plan;
        }

        const { data: planModule, error: planErr } = await supabase
            .from('plan_modules')
            .select('is_included')
            .eq('plan_slug', planSlug)
            .eq('module_slug', moduleSlug)
            .single();

        if (planErr && planErr.code === 'PGRST116') return false;
        
        return planModule?.is_included === true;
    } catch (err) {
        console.error(`[checkModuleAccess] Excepción verificando acceso:`, err);
        return false;
    }
}

async function getKodaCommands() {
    try {
        let commandsStr = await redis.get('koda:commands:active');
        if (!commandsStr) {
            const { data } = await supabase
                .from('koda_commands')
                .select('*')
                .eq('is_active', true)
                .order('priority', { ascending: false }); // smaller priority executes first? The db might use ascending. Usually priority 1 > priority 2 if it's descending order? Let's use ascending. Or wait, original plan: prioritize by priority order. Actually we just iterate them as returned.
                // Assuming priority is ordered higher first or whatever is fetched. Let's do ascending for a 1=highest priority logic.
            if (data && data.length > 0) {
                await redis.set('koda:commands:active', JSON.stringify(data), { ex: 300 });
                return data;
            }
            return [];
        }
        return typeof commandsStr === 'string' ? JSON.parse(commandsStr) : commandsStr;
    } catch (e) {
        console.error('Error fetching commands', e);
        // Fallback to db on redis failure
        const { data } = await supabase.from('koda_commands').select('*').eq('is_active', true).order('priority', { ascending: true });
        return data || [];
    }
}

export async function routeMessage(bot: any, msg: any, user: any, options: any): Promise<any> {
    const text = msg.text?.toLowerCase().trim() || '';

    // --- DIRECT CONNECTION INTENT INTERCEPTION ---
    const msgLower = text;
    const usernameMatch = text.match(/@([a-z0-9_]+)/);
    
    const connectionTriggers = [
        'conectar con', 'contactar con', 'hablar con',
        'chat con', 'quiero conectar', 'quiero contactar',
        'mensaje a', 'escribir a'
    ];
    
    const hasConnectionTrigger = connectionTriggers.some(
        t => msgLower.includes(t)
    );

    if (usernameMatch && hasConnectionTrigger) {
        const targetKodaId = '@' + usernameMatch[1].toLowerCase();
        return await connectByUsername(bot, user.id, targetKodaId, user);
    }

    // --- 1. EXCLUSIVE MODE BYPASS ---
    // If a module holds strict exclusive control over this user's flow
    if (user.exclusive_mode) {
        const mode = user.exclusive_mode;
        console.log(`[Router] User ${user.id} locked in exclusive mode: ${mode}`);
        
        switch (mode) {
            case 'onboarding':
                return await handleOnboarding(bot, msg, user, options);
            case 'chat':
                return await handleDirectMessages(bot, msg, user, options);
            case 'settings':
                return await handleSettings(bot, msg, user, options);
            case 'action_pending':
                return await handleConnectionAction(bot, msg, user, options);
            default:
                // If it's something else not mapped here, maybe let it through or clear it?
                // we'll pass it to main flow if not known
                break;
        }
    }

    // --- 2. ENFORCE ONBOARDING ---
    if (!user.onboarding_complete) {
        console.log(`[Router] User ${user.id} has not completed onboarding. Enforcing onboarding mode.`);
        if (user.exclusive_mode !== 'onboarding') {
            await supabase.from('users').update({ exclusive_mode: 'onboarding' }).eq('id', user.id);
            user.exclusive_mode = 'onboarding'; // update memory user state
        }
        return await handleOnboarding(bot, msg, user, options);
    }

    // --- 3. ADMIN RESET ---
    if (user.role === 'admin' && text.startsWith('/reset_onboarding')) {
        const targetTelegramId = text.split(' ')[1];
        if (!targetTelegramId) return "Uso: /reset_onboarding [telegram_id]";
        const { error } = await supabase.from('users').update({ 
            onboarding_complete: false, 
            exclusive_mode: 'onboarding',
            active_context: { mode: 'onboarding', step: 0, data: {} } 
        }).eq('telegram_id', targetTelegramId);
        
        if (error) return `Error al resetear onboarding: ${error.message}`;
        return `✅ Onboarding reseteado para el usuario ${targetTelegramId}.`;
    }

    // --- 4. DB-DRIVEN COMMAND LOAD & EXECUTION ---
    const commands = await getKodaCommands();
    let matchedCommand = null;

    for (const cmd of commands) {
        let isMatch = false;
        
        if (!cmd.trigger_pattern) continue;
        const pattern = cmd.trigger_pattern.toLowerCase();

        if (cmd.trigger_type === 'exact' && text === pattern) {
            isMatch = true;
        } else if (cmd.trigger_type === 'contains' && text.includes(pattern)) {
            isMatch = true;
        } else if (cmd.trigger_type === 'startsWith' && text.startsWith(pattern)) {
            isMatch = true;
        } else if (cmd.trigger_type === 'regex') {
            try {
                const regex = new RegExp(cmd.trigger_pattern, 'i');
                if (regex.test(text)) isMatch = true;
            } catch(e) {
                console.error('Invalid regex in command', cmd);
            }
        }

        // Connection intent interception logic explicitly mapped via command
        // i.e., @username connections should map via regex in the DB to 'connections' module.
        // If they want older connections logic too, it can be regex or just handled in db matching.
        // e.g. Regex: /@[a-z0-9_]+/ with contains 'conectar'. 
        // We will assume that the DB handles those triggers now, but will safely fallback.

        if (isMatch) {
            // Check module access
            if (await checkModuleAccess(user, cmd.target_module)) {
                matchedCommand = cmd;
                break;
            } else {
                console.log(`[Router] Command matched ${cmd.target_module} but user lacks access.`);
            }
        }
    }

    if (matchedCommand) {
        console.log(`[Router] Executing command for module: ${matchedCommand.target_module}`);
        const module = matchedCommand.target_module;

        // Interactive Handlers
        if (module === 'settings') return await handleSettings(bot, msg, user, options);
        if (module === 'messaging') return await handleDirectMessages(bot, msg, user, options);
        if (module === 'connections') return await handleConnections(bot, msg, user, options);
        if (module === 'gmail') return await handleGmailModule(bot, msg, user, options);
        if (module === 'calendar') return await handleCalendarModule(bot, msg, user, options);

        // Read-only info fetchers (Context injectors)
        let injectedData = null;
        try {
            if (module === 'weather') {
                 const match = text.match(/en\s+([a-zA-Z\s]+)(\?|$)/i);
                 const city = match ? match[1].trim() : undefined;
                 injectedData = await getWeather(user.id, city);
            } else if (module === 'fx-rates') {
                 injectedData = await getExchangeRates('MXN');
            } else if (module === 'spotify') {
                 injectedData = await searchSpotify(text);
            } else if (module === 'sports') {
                 const match = text.match(/(nfl|nba|mlb|nhl|f1|liga mx|premier league|la liga|champions|europa league|mls)/i);
                 let league = 'ligamx';
                 if (match) {
                     league = match[1].toLowerCase().replace(/\s+/g, '');
                     if (league === 'champions') league = 'championsleague';
                 }
                 injectedData = await fetchSportsData(league);
            } else if (module === 'luna') {
                 injectedData = await processLunaContext(user.id);
            } else if (module === 'shopping') {
                 const list = await db.getOrCreateDefaultShoppingList(user.id);
                 const items = await db.getShoppingItems(list.id);
                 const pending = items.filter((i: any) => !i.is_checked);
                 if (pending.length === 0) injectedData = "La lista de compras está actualmente vacía.";
                 else injectedData = "Lista de compras pendiente actual:\n" + pending.map((i: any) => `- ${i.name} ${i.quantity ? `(${i.quantity})` : ''}`).join('\n');
            } else if (module === 'familia') {
                 injectedData = await getFamilyContext(user.id);
            }

            if (injectedData) {
                // Prepend context for main flow
                msg.text = `\n[SISTEMA - DATOS DE MÓDULO ${module.toUpperCase()}]:\n${injectedData}\n\n[MENSAJE DEL USUARIO]:\n${msg.text}`;
            }
        } catch (e) {
            console.error(`[Router] Error executing context fetcher for ${module}:`, e);
        }
        
        // If it was a context module, we don't return here, we let it fall through to main flow with injected text
        // UNLESS the command is defined as 'static' in the future, but currently those require falling back to main flow or specific handlers
    }

    // --- older connection handler bypass in case DB is missing the command temporally ---
    const connectionRegex = /@[a-z0-9_]+/;
    const connectionKeywords = ["conectar", "contactar", "hablar con", "mensaje a", "escribir a", "chat con"];
    if (!matchedCommand && connectionRegex.test(text) && connectionKeywords.some(keyword => text.includes(keyword))) {
        return await handleConnections(bot, msg, user, options);
    }

    // --- 5. FALLBACK MAIN CONVERSATIONAL / INTENT FLOW ---
    if (matchedCommand) {
        options.activeModule = matchedCommand.target_module;
    }
    return await handleMainFlow(bot, msg, user, options);
}

// Clean up performContextInjection to appease old imports if any outside reference it, just export empty
export async function performContextInjection(msg: any, user: any): Promise<string> { return ""; }
export const contextInjectors = {};
