/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { inboxQueue, outboxQueue, deadLetterQueue } from '@/lib/queue';

export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    const apiKey = process.env.INTERNAL_API_KEY || 'koda_default_key';

    if (authHeader !== `Bearer ${apiKey}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const [
            inboxWaiting,
            inboxActive,
            outboxWaiting,
            deadLetterCount
        ] = await Promise.all([
            inboxQueue.getWaitingCount(),
            inboxQueue.getActiveCount(),
            outboxQueue.getWaitingCount(),
            deadLetterQueue.getWaitingCount()
        ]);

        return NextResponse.json({
            inbox_waiting: inboxWaiting,
            inbox_active: inboxActive,
            outbox_waiting: outboxWaiting,
            dead_letter_count: deadLetterCount
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
