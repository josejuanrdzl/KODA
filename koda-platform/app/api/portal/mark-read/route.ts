import { NextResponse } from 'next/server';
import { getViewToken } from '@/lib/portal/portal.tokens';
import { getGoogleToken } from '@/lib/modules/executive/google.connector';

export async function POST(req: Request) {
  try {
    const { messageId, viewToken } = await req.json();

    if (!messageId || !viewToken) {
      return NextResponse.json({ success: false, error: 'Missing parameters' }, { status: 400 });
    }

    const tokenDataPayload = await getViewToken(viewToken);
    if (!tokenDataPayload || !['emails', 'email'].includes(tokenDataPayload.type)) {
      return NextResponse.json({ success: false, error: 'Invalid or expired token' }, { status: 401 });
    }

    const userId = tokenDataPayload.userId;
    const googleTokenData = await getGoogleToken(userId);

    if (!googleTokenData) {
      return NextResponse.json({ success: false, error: 'User does not have Google connected' }, { status: 403 });
    }

    const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${googleTokenData.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        removeLabelIds: ['UNREAD']
      })
    });

    if (!res.ok) {
      return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('[Portal - Mark Read Error]:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
