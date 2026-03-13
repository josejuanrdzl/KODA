import { NextResponse } from 'next/server';
import { getViewToken, createActionToken } from '@/lib/portal/portal.tokens';
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

    const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Message-ID&metadataHeaders=References`, {
      headers: {
        'Authorization': `Bearer ${googleTokenData.access_token}`
      }
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch email metadata' }, { status: 500 });
    }

    const message = await res.json();
    const headers = message.payload?.headers || [];
    const subjectHeader = headers.find((h: any) => h.name.toLowerCase() === 'subject')?.value || '';
    const fromHeader = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value || '';
    const messageIdHeader = headers.find((h: any) => h.name.toLowerCase() === 'message-id')?.value || '';
    const referencesHeader = headers.find((h: any) => h.name.toLowerCase() === 'references')?.value || '';

    let fromName = fromHeader;
    let fromEmail = fromHeader;
    const emailMatch = fromHeader.match(/<(.+)>/);
    if (emailMatch) {
      fromEmail = emailMatch[1];
      fromName = fromHeader.replace(emailMatch[0], '').trim().replace(/"/g, '');
    }

    const replySubject = subjectHeader.toLowerCase().startsWith('re:') ? subjectHeader : `Re: ${subjectHeader}`;

    // data for ReplyClient
    const replyData = {
      to: fromEmail,
      to_name: fromName,
      subject: replySubject,
      message_id_header: messageIdHeader,
      references_header: referencesHeader,
      threadId: message.threadId
    };

    const { url } = await createActionToken(userId, 'reply', replyData, 30);

    return NextResponse.json({ url });

  } catch (error) {
    console.error('[Portal - Prepare Reply Error]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
