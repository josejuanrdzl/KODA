import { NextRequest, NextResponse } from 'next/server';
import { getAuthUrl } from '@/lib/portal/google.auth';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const state = searchParams.get('state');

  if (!state) {
    return NextResponse.json({ error: 'Missing state parameter for user identification' }, { status: 400 });
  }

  const authUrl = getAuthUrl(state);
  return NextResponse.redirect(authUrl);
}
