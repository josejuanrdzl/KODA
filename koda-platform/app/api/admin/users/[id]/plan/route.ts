/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';

/* eslint-disable @typescript-eslint/no-require-imports */
const db = require('@/lib/backend/services/supabase');
/* eslint-enable @typescript-eslint/no-require-imports */

export async function POST(request: Request, { params }: { params: { id: string } }) {
    const password = request.headers.get('x-admin-password');
    if (!password || password !== process.env.ADMIN_PASSWORD) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    try {
        const userId = params.id;
        const { plan, plan_status } = await request.json();

        if (!plan || !plan_status) {
            return NextResponse.json({ error: 'Faltan parámetros plan o plan_status' }, { status: 400 });
        }

        await db.updateUser(userId, { plan, plan_status });
        return NextResponse.json({ success: true, message: 'Plan actualizado' });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
