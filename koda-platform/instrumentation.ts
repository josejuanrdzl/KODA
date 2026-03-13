export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const isBuild =
            process.env.npm_lifecycle_event === 'build' ||
            process.env.NEXT_PHASE === 'phase-production-build';

        const hasRedis = !!(
            process.env.UPSTASH_REDIS_URL || process.env.UPSTASH_REDIS_REST_URL
        );

        if (!isBuild && hasRedis) {
            console.log('🚀 Inicializando BullMQ Workers en MODO PRODUCCIÓN (instrumentation)...');
            await import('./workers/inbox-worker');
            await import('./workers/outbox-worker');
        }
    }
}
