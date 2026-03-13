import { NextRequest, NextResponse } from 'next/server';
import { getTokensFromCode } from '@/lib/portal/google.auth';
const { supabase } = require('@/lib/backend/services/supabase');
import { encryptToken } from '@/lib/modules/executive/google.connector';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // This is our user.id
  const error = searchParams.get('error');

  const appUrl = process.env.FLY_APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (error) {
    return NextResponse.redirect(`${appUrl}/view/error?msg=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/view/error?msg=Missing parameters`);
  }

  try {
    const tokens = await getTokensFromCode(code);
    
    // Encrypt sensitive tokens
    const encAccess = encryptToken(tokens.access_token!);
    const encRefresh = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null;
    let expiryDate = null;
    if (tokens.expiry_date) {
        expiryDate = new Date(tokens.expiry_date).toISOString();
    }

    // UPSERT directly into connectors
    const connectorData: any = {
        user_id: state,
        type: 'gmail', // Correct type from Google Connector
        access_token_enc: encAccess,
        status: 'active',
        updated_at: new Date().toISOString()
    };
    if (encRefresh) connectorData.refresh_token_enc = encRefresh;
    if (expiryDate) connectorData.expires_at = expiryDate;

    // Check if it exists first
    const { data: existing } = await supabase
        .from('connectors')
        .select('id, refresh_token_enc')
        .eq('user_id', state)
        .eq('type', 'gmail')
        .single();
        
    if (existing) {
        // Only update, don't overwrite refresh token if new one is null
        if (!encRefresh && existing.refresh_token_enc) {
            delete connectorData.refresh_token_enc;
        }
        await supabase.from('connectors').update(connectorData).eq('id', existing.id);
    } else {
        await supabase.from('connectors').insert(connectorData);
    }

    return NextResponse.redirect(`${appUrl}/view/success`);

  } catch (err: any) {
    console.error('Error exchanging Google OAuth code:', err);
    return NextResponse.redirect(`${appUrl}/view/error?msg=OAuthExchangeError`);
  }
}
