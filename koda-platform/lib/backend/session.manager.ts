import { redis } from '../redis';
import db from './services/supabase';
import { toZonedTime, format } from 'date-fns-tz';
import { getHours, getDay } from 'date-fns';

export interface SessionObject {
    id: string; // alias for userId for backward compatibility
    userId: string;
    channel: string;
    channelUserId: string;
    plan: string;
    activeModules: string[];
    mode: 'koda' | 'chat' | 'flow' | 'silent';
    onboarding_complete: boolean;
    flowId: string | null;
    flowStep: number | null;
    flowData: object | null;
    flowOwner: string | null;
    city: string;
    travelCity: string | null;
    travelUntil: string | null;
    effectiveCity: string;
    country: string;
    lat: number | null;
    lng: number | null;
    timezone: string;
    localTime: string;
    localDate: string;
    localHour: number;
    dayOfWeek: string;
    isWeekend: boolean;
    responseMode: 'text' | 'voice' | 'both';
    language: 'es' | 'en';
    userName: string;
    lastModuleSlug: string;
    lastMessageAt: number;
    conversationTurn: number;
    temporal?: {
        localTime: string;
        localDate: string;
        localHour: number;
        dayOfWeek: string;
        isWeekend: boolean;
    };
}

export async function getSession(channel: string, channelUserId: string): Promise<SessionObject> {
    const cacheKey = `session:${channel}:${channelUserId}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
        let session: SessionObject;
        if (typeof cached === 'string') {
            session = JSON.parse(cached);
        } else {
            session = cached as unknown as SessionObject;
        }
        
        return enrichSessionWithLocation(session);
    }

    const sessionFromDb = await buildSessionFromDB(channel, channelUserId);
    return enrichSessionWithLocation(sessionFromDb);
}

export function enrichSessionWithLocation(session: SessionObject): SessionObject {
    const effectiveCity = getEffectiveCity(session);
    const temporal = calculateTemporal(session.timezone);

    session.effectiveCity = effectiveCity;
    session.temporal = temporal;

    // Actualizamos las variables planas por retrocompatibilidad temporal, aunque se preferirá el objeto temporal.
    session.localTime = temporal.localTime;
    session.localDate = temporal.localDate;
    session.localHour = temporal.localHour;
    session.dayOfWeek = temporal.dayOfWeek;
    session.isWeekend = temporal.isWeekend;

    return session;
}

export async function updateSession(session: SessionObject, updates: Partial<SessionObject>): Promise<SessionObject> {
    const updated = { ...session, ...updates };
    const cacheKey = `session:${updated.channel}:${updated.channelUserId}`;
    await redis.set(cacheKey, JSON.stringify(updated), { ex: 1800 });
    return updated;
}

export async function updateSessionAndDB(session: SessionObject, updates: Partial<SessionObject>): Promise<SessionObject> {
    const { supabase } = db as any;
    
    // Extrahir columnas modificables a DB
    const dbUpdates: any = {};
    if (updates.plan !== undefined) dbUpdates.plan = updates.plan;
    if (updates.city !== undefined) dbUpdates.city = updates.city;
    if (updates.country !== undefined) dbUpdates.country = updates.country;
    if (updates.timezone !== undefined) dbUpdates.timezone = updates.timezone;
    if (updates.travelCity !== undefined) dbUpdates.travel_city = updates.travelCity;
    if (updates.travelUntil !== undefined) dbUpdates.travel_until = updates.travelUntil;

    if (Object.keys(dbUpdates).length > 0) {
        await supabase.from('users').update(dbUpdates).eq('id', session.userId);
    }
    
    return await updateSession(session, updates);
}

export async function invalidateSession(channel: string, channelUserId: string): Promise<void> {
    const cacheKey = `session:${channel}:${channelUserId}`;
    await redis.del(cacheKey);
}

export function calculateTemporal(timezone: string) {
    // Default to 'America/Chihuahua' if missing or invalid
    const tz = timezone || 'America/Chihuahua';
    const zonedDate = toZonedTime(new Date(), tz);
    const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

    return {
        localTime: zonedDate.toISOString(),
        localDate: format(zonedDate, 'yyyy-MM-dd', { timeZone: tz }),
        localHour: getHours(zonedDate),
        dayOfWeek: DAYS[getDay(zonedDate)],
        isWeekend: [0, 6].includes(getDay(zonedDate))
    };
}

export function getEffectiveCity(userOrSession: { travelCity?: string | null, travel_city?: string | null, travelUntil?: string | null, travel_until?: string | null, city?: string | null, userId?: string }) {
    const tc = userOrSession.travelCity || userOrSession.travel_city;
    const tu = userOrSession.travelUntil || userOrSession.travel_until;

    if (tc && tu) {
        if (new Date(tu) > new Date()) {
            return tc;
        } else {
            // Limpiar viaje expirado
            if (userOrSession.userId) {
                db.supabase.from('users')
                    .update({ travel_city: null, travel_until: null })
                    .eq('id', userOrSession.userId)
                    .then(() => {}); // fire and forget
            }
        }
    }
    
    return userOrSession.city || 'Chihuahua';
}

async function buildSessionFromDB(channel: string, channelUserId: string): Promise<SessionObject> {
    const { supabase } = db as any;
    
    // Select user
    const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, name, plan, plan_status, city, country, lat, lng, timezone, travel_city, travel_until, exclusive_mode, exclusive_data, preferred_channel, koda_id, onboarding_complete')
        .eq(`${channel}_id`, channelUserId)
        .single();
        
    let finalUser = user;

    if (userError || !user) {
        // createNewUser
        finalUser = await createNewUser(channel, channelUserId);
    }

    // Active Modules
    const { data: planModules } = await supabase
        .from('plan_modules')
        .select('module_slug')
        .eq('plan', finalUser.plan)
        .eq('is_active', true);
        
    const activeModules = planModules ? planModules.map((m: any) => m.module_slug) : [];

    // Temporal
    const temporal = calculateTemporal(finalUser.timezone);

    const session: SessionObject = {
        id: finalUser.id,
        userId: finalUser.id,
        channel: channel,
        channelUserId: channelUserId,
        plan: finalUser.plan || 'free',
        activeModules: activeModules,
        mode: finalUser.exclusive_mode || 'koda',
        onboarding_complete: finalUser.onboarding_complete || false,
        flowId: finalUser.exclusive_data?.flowId || null,
        flowStep: finalUser.exclusive_data?.flowStep || null,
        flowData: finalUser.exclusive_data?.flowData || null,
        flowOwner: finalUser.exclusive_data?.flowOwner || null,
        city: finalUser.city,
        travelCity: finalUser.travel_city,
        travelUntil: finalUser.travel_until,
        effectiveCity: getEffectiveCity(finalUser as any),
        country: finalUser.country || 'MX',
        lat: finalUser.lat,
        lng: finalUser.lng,
        timezone: finalUser.timezone || 'America/Chihuahua',
        localTime: temporal.localTime,
        localDate: temporal.localDate,
        localHour: temporal.localHour,
        dayOfWeek: temporal.dayOfWeek,
        isWeekend: temporal.isWeekend,
        responseMode: 'text', // default
        language: 'es', // default
        userName: finalUser.name || 'Usuario',
        lastModuleSlug: 'core',
        lastMessageAt: Date.now(),
        conversationTurn: 0
    };

    const cacheKey = `session:${channel}:${channelUserId}`;
    await redis.set(cacheKey, JSON.stringify(session), { ex: 1800 });

    return session;
}

// Minimal placeholder for createNewUser, matching current route logic
async function createNewUser(channel: string, channelUserId: string) {
    const { supabase } = db as any;
    const newUserData = {
        [`${channel}_id`]: channelUserId,
        plan: 'free',
        timezone: 'America/Chihuahua',
        city: 'Chihuahua',
        country: 'MX'
    };
    
    // In actual implementation, we'd gather name from channel wrapper if possible
    const { data, error } = await supabase.from('users').insert(newUserData).select().single();
    if (error) {
        console.error('Error creating user:', error);
        throw error;
    }
    return data;
}
