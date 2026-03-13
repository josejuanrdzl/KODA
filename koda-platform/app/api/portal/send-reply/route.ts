import { NextResponse } from 'next/server';
import { getActionToken } from '@/lib/portal/portal.tokens';
import { getGoogleToken } from '@/lib/modules/executive/google.connector';

export async function POST(req: Request) {
  try {
    const { actionToken, body } = await req.json();

    if (!actionToken || !body) {
      return NextResponse.json({ success: false, error: 'Missing parameters' }, { status: 400 });
    }

    const tokenDataPayload = await getActionToken(actionToken);
    if (!tokenDataPayload || tokenDataPayload.action !== 'reply') {
      return NextResponse.json({ success: false, error: 'Invalid or expired token' }, { status: 401 });
    }

    const { userId, data } = tokenDataPayload;
    
    // Retrieve google token
    const googleTokenData = await getGoogleToken(userId);
    if (!googleTokenData) {
      return NextResponse.json({ success: false, error: 'User does not have Google connected' }, { status: 403 });
    }

    const to = data.to;
    let subject = data.subject || '';
    if (!subject.toLowerCase().startsWith('re:')) {
        subject = `Re: ${subject}`;
    }

    // Construct raw message
    const messageParts = [
        `To: ${to}`,
        `Subject: =?utf-8?B?${Buffer.from(subject).toString('base64')}?=`,
    ];
    
    if (data.message_id_header) {
        messageParts.push(`In-Reply-To: ${data.message_id_header}`);
        messageParts.push(`References: ${data.message_id_header}`);
    }

    messageParts.push('Content-Type: text/plain; charset="UTF-8"');
    messageParts.push('');
    messageParts.push(body);

    const rawMessage = messageParts.join('\r\n');
    const encodedMessage = Buffer.from(rawMessage).toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    const reqBody: any = { raw: encodedMessage };
    if (data.threadId) {
        reqBody.threadId = data.threadId;
    }

    const reqOptions = {
        method: 'POST',
        headers: { 
            'Authorization': `Bearer ${googleTokenData.access_token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(reqBody)
    };

    const apiRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/send`, reqOptions);

    if (!apiRes.ok) {
        const errText = await apiRes.text();
        console.error('[Portal - Send Reply] Google API Error:', errText);
        return NextResponse.json({ success: false, error: 'Failed to send via Gmail API' }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('[Portal - Send Reply] Internal Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
