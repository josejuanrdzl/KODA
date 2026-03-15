import TelegramBot from 'node-telegram-bot-api';
import { redis } from '../redis';
import db from './services/supabase';
import axios from 'axios';

// Cache keys
const CACHE_KEY_GLOBAL_ENGINES = 'koda:ai:engines';
const CACHE_KEY_BYOK_PREFIX = 'byok:';

// Config
const DEFAULT_FALLBACK_ENGINE = {
    provider: 'static',
    model: 'fallback',
    apiKey: '',
    id: 'static-fallback'
};

const TELEGRAM_ALERTS_CHAT_ID = '390509861'; // JJR

export async function alertJJR(message: string): Promise<void> {
    try {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (!botToken) return;
        
        const bot = new TelegramBot(botToken, { polling: false });
        await bot.sendMessage(
            TELEGRAM_ALERTS_CHAT_ID, 
            `🚨 KODA Alert:\n${message}\n${new Date().toISOString()}`
        );
    } catch (e) {
        // Just log, don't cascade failures
        console.error('[Alert JJR] Failed to send telegram alert:', e);
    }
}

export async function getBYOKEngine(userId: string): Promise<{ provider: string, model: string, apiKey: string } | null> {
    try {
        const cacheKey = `${CACHE_KEY_BYOK_PREFIX}${userId}`;
        
        // 1. Check Redis Cache
        const cached = await redis.get(cacheKey);
        if (cached && typeof cached === 'string') {
            return JSON.parse(cached);
        }

        // 2. Fetch from DB
        const { data, error } = await db.supabase
            .from('user_ai_keys')
            .select('*')
            .eq('user_id', userId)
            .eq('is_active', true)
            .eq('is_verified', true)
            .maybeSingle();

        if (error || !data) return null;

        // 3. Decrypt Key and build engine obj (Assuming an unlock function or the key is plain enough for this transition)
        // Here you would use a proper descryption routine. For now, we simulate returning the decrypted key.
        const apiKey = data.api_key_enc; // Replace with actual decryption logic using process.env.KODA_ENCRYPTION_KEY

        const engine = {
            provider: data.provider,
            model: data.model_id,
            apiKey: apiKey
        };

        // 4. Cache for 1 hour
        await redis.set(cacheKey, JSON.stringify(engine), { ex: 3600 });
        
        return engine;

    } catch (e) {
        console.error(`[AI Selector] Error fetching BYOK for user ${userId}:`, e);
        return null;
    }
}

async function getGlobalEnginesFromDB() {
    const { data, error } = await db.supabase
        .from('ai_engines')
        .select('*')
        .eq('is_active', true)
        .eq('status', 'active')
        .order('priority', { ascending: true });
        
    if (error || !data || data.length === 0) {
        return null; // Force fallback
    }

    return data;
}

export async function selectAIEngine(userId: string): Promise<{ provider: string, model: string, apiKey: string, id?: string }> {
    try {
        // 1. Check BYOK
        const byokEngine = await getBYOKEngine(userId);
        if (byokEngine && byokEngine.apiKey) {
            return byokEngine;
        }

        // 2. Load Global Engines Cache
        let enginesStr = await redis.get(CACHE_KEY_GLOBAL_ENGINES);
        let engines = [];

        if (enginesStr && typeof enginesStr === 'string') {
            engines = JSON.parse(enginesStr);
        } else {
            const dbEngines = await getGlobalEnginesFromDB();
            if (dbEngines) {
                engines = dbEngines;
                await redis.set(CACHE_KEY_GLOBAL_ENGINES, JSON.stringify(engines), { ex: 300 }); // 5 minutes cache
            }
        }

        // 3. Iterate ordered engines to find one with a valid API key in environment
        for (const engine of engines) {
            const secretName = engine.api_key_secret;
            const apiKey = process.env[secretName];
            
            if (apiKey) {
                return {
                    id: engine.id,
                    provider: engine.provider,
                    model: engine.model_id,
                    apiKey: apiKey
                };
            }
        }

        // 4. If nothing works or we get here, trigger disaster fallback
        alertJJR('⚠️ Sin engines de IA disponibles en backend environment variables');
        return DEFAULT_FALLBACK_ENGINE;

    } catch (e) {
        console.error(`[AI Selector] Fatal error selecting engine:`, e);
        alertJJR('⚠️ Exception during AI Engine selection');
        return DEFAULT_FALLBACK_ENGINE;
    }
}

export async function handleEngineError(engineId: string, error: any): Promise<void> {
    if (!engineId || engineId === 'static-fallback') return;

    try {
        console.error(`[AI Selector] Engine ${engineId} failed. Updating metrics...`, error?.message);

        // 1. Get current failures & Increment using RPC or read/update
        const { data: engine, error: getErr } = await db.supabase
            .from('ai_engines')
            .select('id, consecutive_failures, display_name')
            .eq('id', engineId)
            .single();

        if (getErr || !engine) return;

        const newFailures = engine.consecutive_failures + 1;

        // 2. Assess degradation
        let newStatus = 'active';
        if (newFailures >= 10) {
            newStatus = 'down';
        } else if (newFailures >= 3) {
            newStatus = 'degraded';
        }

        // 3. Execute Update
        await db.supabase
            .from('ai_engines')
            .update({ 
                consecutive_failures: newFailures,
                status: newStatus,
                last_checked_at: new Date().toISOString()
            })
            .eq('id', engineId);

        // 4. React if limits breached
        if (newFailures === 3) {
            await redis.del(CACHE_KEY_GLOBAL_ENGINES); // Force invalidate
            alertJJR(`⚠️ KODA: ${engine.display_name} degradado tras ${newFailures} fallos. Usando backup u offline.`);
        } else if (newFailures === 10) {
            await redis.del(CACHE_KEY_GLOBAL_ENGINES);
            alertJJR(`🚨 KODA CRITICAL: ${engine.display_name} DOWN tras 10 fallos.`);
        }

    } catch (e) {
        console.error(`[AI Selector] Error reporting engine failure:`, e);
    }
}

export async function healthCheckEngines(): Promise<void> {
    console.log('[AI Selector] Running Engine Health Check...');
    try {
        // Check ALL active engines, including degraded/down if they are meant to be active
        const { data: engines } = await db.supabase
            .from('ai_engines')
            .select('*')
            .eq('is_active', true);

        if (!engines || engines.length === 0) return;

        for (const engine of engines) {
            // Skip the static fallback
            if (engine.provider === 'static') continue;

            const apiKey = process.env[engine.api_key_secret];
            if (!apiKey) continue; // Skip engines without keys configured

            const isRecovering = engine.status !== 'active' || engine.consecutive_failures > 0;

            try {
                const startTime = Date.now();
                // Simple Ping (Varies per provider)
                if (engine.provider === 'anthropic') {
                    await axios.post('https://api.anthropic.com/v1/messages', {
                        model: engine.model_id,
                        max_tokens: 5,
                        messages: [{ role: 'user', content: 'ping' }]
                    }, {
                        headers: {
                            'x-api-key': apiKey,
                            'anthropic-version': '2023-06-01',
                            'content-type': 'application/json'
                        },
                        timeout: 10000
                    });
                } else if (engine.provider === 'openai') {
                    await axios.post('https://api.openai.com/v1/chat/completions', {
                        model: engine.model_id,
                        max_tokens: 5,
                        messages: [{ role: 'user', content: 'ping' }]
                    }, {
                        headers: {
                            'Authorization': `Bearer ${apiKey}`,
                            'content-type': 'application/json'
                        },
                        timeout: 10000
                    });
                }

                const elapsed = Date.now() - startTime;

                // Ping OK!
                if (isRecovering) {
                    await db.supabase
                        .from('ai_engines')
                        .update({ 
                            consecutive_failures: 0, 
                            status: 'active',
                            last_checked_at: new Date().toISOString()
                        })
                        .eq('id', engine.id);

                    await redis.del(CACHE_KEY_GLOBAL_ENGINES); // Re-seed cache
                    alertJJR(`✅ KODA: [${engine.display_name}] recuperado y online. (${elapsed}ms)`);
                } else {
                    // Just update timestamp
                    await db.supabase.from('ai_engines').update({ last_checked_at: new Date().toISOString() }).eq('id', engine.id);
                }

            } catch (err: any) {
                console.error(`[AI Selector] HealthPing failed for ${engine.display_name} (${engine.model_id})`);
                await handleEngineError(engine.id, err);
            }
        }
    } catch (e) {
        console.error('[AI Selector] Global error running health checks', e);
    }
}
