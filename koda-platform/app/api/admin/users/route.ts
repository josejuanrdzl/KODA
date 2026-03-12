/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';

/* eslint-disable @typescript-eslint/no-require-imports */
const db = require('@/lib/backend/services/supabase');
/* eslint-enable @typescript-eslint/no-require-imports */

export async function GET(request: Request) {
    const password = request.headers.get('x-admin-password');
    if (!password || password !== process.env.ADMIN_PASSWORD) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    try {
        const { data: users, error } = await db.supabase
            .from('users')
            .select('id, telegram_id, telegram_username, name, plan, plan_status, trial_ends_at, messages_today, created_at')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return NextResponse.json(users);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
