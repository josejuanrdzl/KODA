import { redis } from '../redis';
import crypto from 'crypto';

const FLY_APP_URL = process.env.FLY_APP_URL || 'http://localhost:3000';

export async function createViewToken(userId: string, type: string, data: any, ttlMinutes = 30) {
    const token = crypto.randomUUID();
    const key = `portal:view:${token}`;
    const value = JSON.stringify({ userId, type, data, createdAt: Date.now() });
    
    await redis.set(key, value, { ex: ttlMinutes * 60 });
    
    return { token, url: `${FLY_APP_URL}/view/${type}?t=${token}` };
}

export async function getViewToken(token: string) {
    const key = `portal:view:${token}`;
    const value = await redis.get(key);
    
    if (!value) return null;
    
    try {
        return typeof value === 'string' ? JSON.parse(value) : value;
    } catch (e) {
        console.error("Error parsing view token:", e);
        return value;
    }
}

export async function createActionToken(userId: string, action: string, data: any, ttlMinutes = 30) {
    const token = crypto.randomUUID();
    const key = `portal:action:${token}`;
    const value = JSON.stringify({ userId, action, data, createdAt: Date.now() });
    
    await redis.set(key, value, { ex: ttlMinutes * 60 });
    
    return { token, url: `${FLY_APP_URL}/view/${action}?t=${token}` };
}

export async function getActionToken(token: string) {
    const key = `portal:action:${token}`;
    const value = await redis.get(key);
    
    if (!value) return null;
    
    try {
        return typeof value === 'string' ? JSON.parse(value) : value;
    } catch (e) {
        console.error("Error parsing action token:", e);
        return value;
    }
}

export async function consumeActionToken(token: string) {
    const key = `portal:action:${token}`;
    const value = await redis.get(key);
    
    if (!value) return null;
    
    await redis.del(key);
    
    try {
        return typeof value === 'string' ? JSON.parse(value) : value;
    } catch (e) {
        console.error("Error parsing action token:", e);
        return value;
    }
}

export async function getTokenTTL(token: string) {
    let ttl = await redis.ttl(`portal:view:${token}`);
    if (ttl > 0) return ttl;
    
    ttl = await redis.ttl(`portal:action:${token}`);
    return ttl > 0 ? ttl : 0;
}
