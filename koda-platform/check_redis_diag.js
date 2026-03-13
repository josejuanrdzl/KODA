const Redis = require('ioredis');
const { Queue } = require('bullmq');

async function checkRedis() {
    const upstashUrl = 'https://creative-condor-67832.upstash.io';
    const upstashToken = 'gQAAAAAAAQj4AAIncDE3Njk1ZWMzMjk3OWU0ZDFjOTllMjVkNDdmMTkwMzU1NXAxNjc4MzI';

    const host = upstashUrl.replace('https://', '');
    const redisUrl = `rediss://default:${upstashToken}@${host}:6379`;

    console.log('Connecting to Redis...');
    const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

    try {
        const info = await connection.info();
        console.log('Redis Info (first 500 chars):', info.substring(0, 500));

        const inboxQueue = new Queue('koda-inbox', { connection });
        const outboxQueue = new Queue('koda-outbox', { connection });

        const inboxCount = await inboxQueue.getJobCounts();
        const outboxCount = await outboxQueue.getJobCounts();

        console.log('Inbox Queue Counts:', inboxCount);
        console.log('Outbox Queue Counts:', outboxCount);

        const activeInbox = await inboxQueue.getJobs(['active']);
        console.log('Active Inbox Jobs:', activeInbox.length);
        if (activeInbox.length > 0) {
            console.log('First active inbox job data:', activeInbox[0].data);
        }

        const failedInbox = await inboxQueue.getJobs(['failed']);
        console.log('Failed Inbox Jobs:', failedInbox.length);
        if (failedInbox.length > 0) {
            console.log('Last failed inbox job error:', failedInbox[0].failedReason);
        }

    } catch (err) {
        console.error('Redis check failed:', err);
    } finally {
        await connection.quit();
    }
}

checkRedis();
