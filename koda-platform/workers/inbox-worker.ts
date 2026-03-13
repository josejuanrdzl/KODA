import { Worker, Job } from 'bullmq';
import { connection, outboxQueue, deadLetterQueue } from '../lib/queue';

const inboxWorker = new Worker('koda-inbox', async (job: Job) => {
    const payload = job.data;

    // Llama a POST /api/koda con el mensaje
    const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/koda`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.INTERNAL_API_KEY || 'koda_default_key'}`
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`Failed to process message in /api/koda: ${response.statusText}`);
    }

    const result = await response.json();

    // Al completar: agrega la respuesta a koda-outbox
    if (result && result.reply) {
        await outboxQueue.add('send-reply', {
            channel: result.channel || payload.channel || 'telegram',
            chatId: result.chatId || payload.chatId,
            text: result.reply,
            options: result.options
        });
    }

    return result;
}, {
    connection: connection as any
});

inboxWorker.on('failed', async (job, err) => {
    if (job && job.attemptsMade >= job.opts.attempts!) {
        await deadLetterQueue.add('failed-inbox', { jobData: job.data, error: err.message });
    }
});

console.log('Inbox worker configured');
