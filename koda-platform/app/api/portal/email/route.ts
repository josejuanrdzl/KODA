import { NextResponse } from 'next/server';
import { getViewToken, createViewToken } from '@/lib/portal/portal.tokens';
import { getGoogleToken } from '@/lib/modules/executive/google.connector';

export async function POST(req: Request) {
  try {
    const { msgId, viewToken } = await req.json();

    if (!msgId || !viewToken) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const tokenDataPayload = await getViewToken(viewToken);
    if (!tokenDataPayload || !['emails', 'email'].includes(tokenDataPayload.type)) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    const userId = tokenDataPayload.userId;
    const googleTokenData = await getGoogleToken(userId);

    if (!googleTokenData) {
      return NextResponse.json({ error: 'User does not have Google connected' }, { status: 403 });
    }

    const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`, {
      headers: {
        'Authorization': `Bearer ${googleTokenData.access_token}`
      }
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch email from Google' }, { status: 500 });
    }

    const message = await res.json();
    
    // Parse message headers and body
    const headers = message.payload?.headers || [];
    const subject = headers.find((h: any) => h.name.toLowerCase() === 'subject')?.value || 'Sin asunto';
    const fromHeader = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value || '';
    const dateStr = headers.find((h: any) => h.name.toLowerCase() === 'date')?.value || '';
    
    let fromName = fromHeader;
    let fromEmail = fromHeader;
    const emailMatch = fromHeader.match(/<(.+)>/);
    if (emailMatch) {
      fromEmail = emailMatch[1];
      fromName = fromHeader.replace(emailMatch[0], '').trim().replace(/"/g, '');
    }

    let bodyText = '';
    let bodyHtml = '';

    const extractBody = (part: any) => {
        if (part.mimeType === 'text/plain' && part.body?.data) {
            bodyText += Buffer.from(part.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
        } else if (part.mimeType === 'text/html' && part.body?.data) {
            bodyHtml += Buffer.from(part.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
        } else if (part.parts) {
            part.parts.forEach(extractBody);
        }
    };

    if (message.payload) {
        extractBody(message.payload);
    }
    
    // Fallback logic if there were no parts but body exists
    if (!bodyText && !bodyHtml && message.payload?.body?.data) {
        if (message.payload.mimeType === 'text/html') {
             bodyHtml = Buffer.from(message.payload.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
        } else {
             bodyText = Buffer.from(message.payload.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
        }
    }

    const emailData = {
      messageId: msgId,
      subject,
      from_name: fromName,
      from_email: fromEmail,
      date: dateStr ? new Date(dateStr).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }) : '',
      body_text: bodyText,
      body_html: bodyHtml
    };

    const { url } = await createViewToken(userId, 'email', emailData, 15);

    return NextResponse.json({ url });

  } catch (error) {
    console.error('[Portal - Get Email Error]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
