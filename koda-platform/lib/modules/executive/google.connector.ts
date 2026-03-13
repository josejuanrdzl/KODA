import * as crypto from 'crypto';
const db = require('../../backend/services/supabase');
const { supabase } = db;

const ENCRYPTION_KEY = process.env.KODA_ENCRYPTION_KEY || 'koda-default-encryption-key-32ch';
const ALGORITHM = 'aes-256-cbc';

// Helper to decrypt tokens
export function decryptToken(encryptedText: string): string {
    try {
        const parts = encryptedText.split(':');
        const iv = Buffer.from(parts.shift() as string, 'hex');
        const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
        const encrypted = parts.join(':');
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        console.error('[Google Connector] Error decrypting token:', e);
        return '';
    }
}

// Helper to encrypt tokens
export function encryptToken(text: string): string {
    const iv = crypto.randomBytes(16);
    const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Retrieves a valid Google access token for the user.
 * Refreshes it automatically if expired.
 */
export async function getGoogleToken(userId: string): Promise<{ access_token: string } | null> {
    const { data: connector, error } = await supabase
        .from('connectors')
        .select('access_token_enc, refresh_token_enc, expires_at')
        .eq('user_id', userId)
        .eq('type', 'gmail')
        .limit(1)
        .maybeSingle();

    if (error || !connector) {
        return null;
    }

    const { access_token_enc, refresh_token_enc, expires_at } = connector;
    let access_token = decryptToken(access_token_enc);
    const refresh_token = decryptToken(refresh_token_enc);

    const now = new Date();
    const expiresAtDate = new Date(expires_at);
    
    // Add a 5 minute buffer before actual expiration
    const bufferTime = new Date(now.getTime() + 5 * 60000);

    if (expiresAtDate < bufferTime && refresh_token) {
        console.log(`[Google Connector] Token expired for user ${userId}, refreshing...`);
        try {
            const response = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client_id: process.env.GOOGLE_CLIENT_ID,
                    client_secret: process.env.GOOGLE_CLIENT_SECRET,
                    refresh_token: refresh_token,
                    grant_type: 'refresh_token'
                })
            });

            const data = await response.json();

            if (data.access_token) {
                access_token = data.access_token;
                const newExpiresAt = new Date(now.getTime() + (data.expires_in * 1000)).toISOString();
                const newEncryptedAccessToken = encryptToken(access_token);

                await supabase.from('connectors')
                    .update({ 
                        access_token_enc: newEncryptedAccessToken,
                        expires_at: newExpiresAt
                    })
                    .eq('user_id', userId)
                    .eq('type', 'gmail');
                    
                console.log(`[Google Connector] Token refreshed successfully for user ${userId}.`);
            } else {
                 console.error('[Google Connector] Failed to refresh token, response:', data);
                 return null;
            }
        } catch (e) {
            console.error('[Google Connector] Error requesting token refresh:', e);
            return null;
        }
    }

    return { access_token };
}

/**
 * Wrapper to verify the user has a connected Google account.
 * Communicates with the user if they do not.
 */
export async function requireGmailConnector(userId: string, bot: any, options: any): Promise<boolean> {
    const tokenData = await getGoogleToken(userId);
    
    if (!tokenData) {
        const portalUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://koda.app';
        await bot.sendMessage(
            userId, 
            `Para usar las funciones de Google necesitas conectar tu cuenta.\n\nVisita el portal para conectar: ${portalUrl}/dashboard\n\nUna vez conectado, escríbeme "revisar mi correo" o "mi agenda" para empezar.`, 
            options
        );
        return false;
    }
    
    return true;
}
