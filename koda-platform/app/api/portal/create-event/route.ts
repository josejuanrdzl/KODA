import { NextResponse } from 'next/server';
import { getActionToken } from '@/lib/portal/portal.tokens';
import { getGoogleToken } from '@/lib/modules/executive/google.connector';

export async function POST(req: Request) {
  try {
    const { actionToken, eventData } = await req.json();

    if (!actionToken || !eventData || !eventData.title || !eventData.date || !eventData.startTime || !eventData.endTime) {
      return NextResponse.json({ success: false, error: 'Missing parameters' }, { status: 400 });
    }

    const tokenDataPayload = await getActionToken(actionToken);
    if (!tokenDataPayload || tokenDataPayload.action !== 'new-event') {
      return NextResponse.json({ success: false, error: 'Invalid or expired token' }, { status: 401 });
    }

    const { userId } = tokenDataPayload;
    
    // Retrieve google token
    const googleTokenData = await getGoogleToken(userId);
    if (!googleTokenData) {
      return NextResponse.json({ success: false, error: 'User does not have Google connected' }, { status: 403 });
    }

    const timeZone = process.env.TZ || 'America/Mexico_City'; 
    
    // Compute ISO start/end
    const startISO = `${eventData.date}T${eventData.startTime}:00`;
    const endISO = `${eventData.date}T${eventData.endTime}:00`;

    const googleEvent: any = {
        summary: eventData.title,
        start: { dateTime: new Date(startISO).toISOString(), timeZone },
        end: { dateTime: new Date(endISO).toISOString(), timeZone },
    };

    if (eventData.description) {
        googleEvent.description = eventData.description;
    }
    
    if (eventData.attendees && Array.isArray(eventData.attendees)) {
        googleEvent.attendees = eventData.attendees.map((e: string) => ({ email: e }));
    }

    const createRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${googleTokenData.access_token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(googleEvent)
    });

    if (!createRes.ok) {
        const errData = await createRes.text();
        console.error('[Portal - Create Event] Google API Error:', errData);
        return NextResponse.json({ success: false, error: 'Failed to create event in Google Calendar' }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('[Portal - Create Event] Internal Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
