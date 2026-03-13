
const db = require('./services/supabase');
const { supabase } = db;
const { handleCommand } = require('./handlers/commands');
const { handleOnboarding } = require('./handlers/onboarding');
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
import { handleConnections } from '../modules/messaging/connections.handler';
import { handleDirectMessages } from '../modules/messaging/direct-messages.handler';
import { handleRecallIntent } from '../modules/memory/recall.handler';

// Import executive handlers
import { handleGmailModule } from '../modules/executive/gmail.handler';
import { handleCalendarModule } from '../modules/executive/calendar.handler';

// Direct Intent Regex Map for Context Injection Handlers
export const contextInjectors: Record<string, { regex: RegExp, handler: (user: any, msg: any) => Promise<string | null> }> = {
    'weather': {
        regex: /clima|temperatura|llover|paraguas|frío|calor/i,
        handler: async (user: any, msg: any) => {
            const text = msg.text || '';
            const match = text.match(/en\s+([a-zA-Z\s]+)(\?|$)/i);
            const city = match ? match[1].trim() : undefined;
            return await getWeather(user.id, city);
        }
    },
    'fx-rates': {
        regex: /dólar|dolar|euro|libra|tipo de cambio|tipo cambio|tc|pesos/i,
        handler: async (user: any, msg: any) => {
            // Default to MXN based exchange rate
            return await getExchangeRates('MXN');
        }
    },
    'spotify': {
        regex: /música|canción|cancion|artista|spotify|recomienda.*música|recomiéndame/i,
        handler: async (user: any, msg: any) => {
            const text = msg.text || '';
            return await searchSpotify(text);
        }
    },
    'sports': {
        regex: /deporte|partido|marcador|juego|nfl|nba|mlb|nhl|f1|liga mx|premier league|la liga|champions|europa league|mls/i,
        handler: async (user: any, msg: any) => {
            const text = msg.text || '';
            const match = text.match(/(nfl|nba|mlb|nhl|f1|liga mx|premier league|la liga|champions|europa league|mls)/i);
            let league = 'ligamx'; // default
            if (match) {
                league = match[1].toLowerCase().replace(/\s+/g, '');
                if (league === 'champions') league = 'championsleague';
            }
            return await fetchSportsData(league);
        }
    },
    'luna': {
        regex: /menstruación|regla|periodo|ciclo|casi me baja|ovulación|cólicos|ovulando|luna/i,
        handler: async (user: any, msg: any) => {
            return await processLunaContext(user.id);
        }
    },
    'shopping': {
        regex: /compras|súper|supermercado|lista|agregar a|falta comprar|despensa/i,
        handler: async (user: any, msg: any) => {
            const list = await db.getOrCreateDefaultShoppingList(user.id);
            const items = await db.getShoppingItems(list.id);
            const pending = items.filter((i: any) => !i.is_checked);
            if (pending.length === 0) return "La lista de compras/supermercado está actualmente vacía.";
            return "Lista de compras pendiente actual:\n" + pending.map((i: any) => `- ${i.name} ${i.quantity ? `(${i.quantity})` : ''}`).join('\n');
        }
    },
    'familia': {
        regex: /familia|esposa|esposo|hijo|hija|mamá|papá|actividad familiar|escuela|colegio/i,
        handler: async (user: any, msg: any) => {
            return await getFamilyContext(user.id);
        }
    }
};


/**
 * Verifica si un usuario tiene acceso a un módulo específico.
 * 1. Revisa `tenant_modules` (override local para el tenant).
 * 2. Si no hay override local explícito, revisa `plan_modules` basado en el plan del usuario.
 * @param {object} user - Objeto usuario (necesita user.tenant_id y user.plan)
 * @param {string} moduleSlug - Slug del módulo (ej. 'journal', 'habits')
 * @returns {Promise<boolean>}
 */
export async function checkModuleAccess(user: any, moduleSlug: string): Promise<boolean> {
    if (!user || !user.tenant_id || !user.plan) {
        console.error("[checkModuleAccess] Faltan datos del usuario (tenant_id o plan).");
        return false; // Por defecto denegamos si la data está corrupta o incompleta
    }

    try {
        // 1. Verificar override en tenant_modules
        const { data: tenantModule, error: tenantErr } = await supabase
            .from('tenant_modules')
            .select('enabled_at, disabled_at')
            .eq('tenant_id', user.tenant_id)
            .eq('module_slug', moduleSlug)
            .maybeSingle();

        if (tenantErr) {
            console.error(`[checkModuleAccess] Error al verificar tenant_modules: ${tenantErr.message}`);
        }

        if (tenantModule) {
            if (tenantModule.enabled_at && !tenantModule.disabled_at) {
                return true;
            }
            if (tenantModule.disabled_at) {
                return false;
            }
        }

        // 2. Resolver el plan real del tenant (user.plan suele ser un legacy value como 'free')
        let planSlug = user.plan;
        if (user.tenant_id) {
            const { data: tenant } = await supabase
                .from('tenants')
                .select('plan')
                .eq('id', user.tenant_id)
                .single();
            if (tenant && tenant.plan) {
                planSlug = tenant.plan;
            }
        }

        // 3. Si no hay override local explícito, verificar plan_modules
        const { data: planModule, error: planErr } = await supabase
            .from('plan_modules')
            .select('is_included')
            .eq('plan_slug', planSlug)
            .eq('module_slug', moduleSlug)
            .single();

        if (planErr) {
            if (planErr.code === 'PGRST116') {
                // No row found - esto asume que si no está en plan_modules, no está incluido
                return false;
            }
            console.error(`[checkModuleAccess] Error al verificar plan_modules: ${planErr.message}`);
            return false;
        }

        return planModule?.is_included === true;
    } catch (err) {
        console.error(`[checkModuleAccess] Excepción verificando acceso:`, err);
        return false;
    }
}

/**
 * Performs context injection based on keywords in the message text.
 * prepends the context data to msg.text if matches are found.
 */
export async function performContextInjection(msg: any, user: any): Promise<string> {
    let injectedContext = "";
    const text = msg.text || '';
    
    const injectionData: Record<string, string> = {};
    const injectionPromises = Object.entries(contextInjectors).map(async ([slug, injector]) => {
        if (injector.regex.test(text)) {
            const hasAccess = await checkModuleAccess(user, slug);
            if (hasAccess) {
                try {
                    const data = await injector.handler(user, msg);
                    if (data) {
                        console.log(`[performContextInjection] Contexto inyectado por módulo: ${slug}`);
                        injectionData[slug] = data;
                        return `\n[SISTEMA - DATOS DE MÓDULO ${slug.toUpperCase()}]:\n${data}\n`;
                    }
                } catch (e) {
                    console.error(`[performContextInjection] Error injecting context for ${slug}:`, e);
                }
            } else {
                console.log(`[performContextInjection] Intent matched ${slug} but user lacks access.`);
            }
        }
        return null;
    });

    const injectionResults = await Promise.all(injectionPromises);
    injectedContext = injectionResults.filter(r => r !== null).join('');

    if (injectedContext) {
        msg.text = `${injectedContext}\n[MENSAJE DEL USUARIO]:\n${msg.text}`;
    }
    
    return injectedContext;
}

/**
 * Routes an incoming message to the appropriate handler (onboarding, command, main flow).
 */
export async function routeMessage(bot: any, msg: any, user: any, options: any): Promise<any> {
    if (!user.onboarding_complete) {
        return await handleOnboarding(bot, msg, user, options);
    }

    // --- Messaging Interceptors ---
    // Handle Direct Messages & Chat Context
    if (await handleDirectMessages(bot, msg, user, options)) return;
    
    // Handle KODA ID configuration
    if (await handleKodaIdOnboarding(bot, msg, user, options)) return;

    // Handle User Connections & Invites
    if (await handleConnections(bot, msg, user, options)) return;
    // ------------------------------

    const commandReply = await handleCommand(bot, msg, user, options);
    if (commandReply) {
        return commandReply;
    }

    // --- Memory Recall Intent ---
    if (await handleRecallIntent(bot, msg, user, options)) return;

    // --- Executive Modules ---
    if (await checkModuleAccess(user, 'gmail')) {
        if (await handleGmailModule(bot, msg, user, options)) return;
    }
    if (await checkModuleAccess(user, 'calendar')) {
        if (await handleCalendarModule(bot, msg, user, options)) return;
    }

    // Context Injection Check (Read-Only Modules)
    const injectedContext = await performContextInjection(msg, user);

    return await handleMainFlow(bot, msg, user, { ...options, injectedContext });
}
