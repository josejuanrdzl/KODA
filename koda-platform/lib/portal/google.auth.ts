import { google } from 'googleapis';
import jwt from 'jsonwebtoken';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const REDIRECT_URI = (process.env.FLY_APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000') + '/api/auth/google/callback';

export const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  REDIRECT_URI
);

// Define scopes required for KODA (Gmail, Calendar, UserInfo)
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
];

export function getAuthUrl(state: string) {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // Force to get refresh token
    scope: SCOPES,
    state // Used to pass the KODA user.id through the OAuth flow
  });
}

export async function generateGoogleAuthUrl(userId: string, telegramId: string) {
  // 1. Crear el payload
  const payload = { userId, telegramId };
  
  // 2. Firmar el JWT (expira en 10 min)
  const token = jwt.sign(
    payload, 
    process.env.KODA_JWT_SECRET || 'dev-secret-key-123',
    { expiresIn: '10m' }
  );

  // 3. Generar la URL con el JWT en el 'state'
  return getAuthUrl(token);
}

export async function getTokensFromCode(code: string) {
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}
