/* eslint-disable @typescript-eslint/no-explicit-any */
import { Queue, QueueOptions, DefaultJobOptions } from 'bullmq';
import Redis from 'ioredis';

// Construct the standard Redis URL from the REST URL/Token
const upstashUrl = process.env.UPSTASH_REDIS_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const upstashToken = process.env.UPSTASH_REDIS_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

const isBuild = process.env.npm_lifecycle_event === 'build' || process.env.NEXT_PHASE === 'phase-production-build';

let redisUrl = isBuild ? '' : upstashUrl;
if (!isBuild && upstashUrl.startsWith('https://')) {
    const host = upstashUrl.replace('https://', '');
    redisUrl = `rediss://default:${upstashToken}@${host}:6379`;
} else if (!isBuild && !redisUrl.includes('://') && redisUrl !== '') {
    redisUrl = `rediss://default:${upstashToken}@${upstashUrl}:6379`;
}

export const connection = redisUrl ? new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
}) : ({} as any);

const inboxQueueOptions: QueueOptions = {
    connection: connection as any,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: false
    }
};

export const inboxQueue = redisUrl ? new Queue('koda-inbox', inboxQueueOptions) : ({} as any);

const outboxQueueOptions: QueueOptions = {
    connection: connection as any,
    defaultJobOptions: {
        attempts: 4,
        backoff: {
            type: 'outboxBackoff', // custom strategy defined in worker
            delay: 5000
        },
        removeOnComplete: true,
        removeOnFail: false
    }
};

export const outboxQueue = redisUrl ? new Queue('koda-outbox', outboxQueueOptions) : ({} as any);

export const deadLetterQueue = redisUrl ? new Queue('koda-dead-letter', { connection: connection as any }) : ({} as any);
