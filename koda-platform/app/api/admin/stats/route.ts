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
            .select('id, plan, plan_status, created_at');

        if (error) throw error;

        // Obtener MRR desde suscripciones
        const { data: subs } = await db.supabase
            .from('subscriptions')
            .select('amount, currency')
            .eq('status', 'active');

        let mrr_usd = 0;
        let mrr_mxn = 0;

        if (subs) {
            subs.forEach((s: any) => {
                if (s.currency === 'usd') mrr_usd += ((s.amount || 0) / 100);
                if (s.currency === 'mxn') mrr_mxn += ((s.amount || 0) / 100);
            });
        }

        const stats = {
            total_users: users.length,
            active_subscriptions: users.filter((u: any) => u.plan_status === 'active' && u.plan !== 'starter').length,
            trial_users: users.filter((u: any) => u.plan_status === 'trial').length,
            plans: {
                starter: users.filter((u: any) => u.plan === 'starter').length,
                basic: users.filter((u: any) => u.plan === 'basic').length,
                executive: users.filter((u: any) => u.plan === 'executive').length,
                corporate: users.filter((u: any) => u.plan === 'corporate').length,
            },
            revenue: {
                usd: mrr_usd,
                mxn: mrr_mxn
            }
        };

        return NextResponse.json(stats);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
