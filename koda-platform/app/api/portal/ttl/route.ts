import { NextResponse } from 'next/server';
import { getTokenTTL } from '@/lib/portal/portal.tokens';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('t');
    
    if (!token) return NextResponse.json({ error: 'No token' }, { status: 400 });
    
    const ttl = await getTokenTTL(token);
    return NextResponse.json({ seconds_remaining: ttl > 0 ? ttl : 0 });
}
