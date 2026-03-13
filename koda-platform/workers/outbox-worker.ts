import { Worker, Job } from 'bullmq';
import { connection, deadLetterQueue } from '../lib/queue';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const outboxWorker = new Worker('koda-outbox', async (job: Job) => {
    const { channel, chatId, text, options } = job.data;

    console.log(`[outbox-worker] Delivering message to ${channel}: ${chatId}`);

    if (channel === 'telegram') {
        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        if (!TELEGRAM_BOT_TOKEN) throw new Error('Missing TELEGRAM_BOT_TOKEN');

        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text, ...options })
        });

        if (!res.ok) {
            const errBody = await res.text();
            throw new Error(`Telegram API error: ${res.status} ${errBody}`);
        }
    } else if (channel === 'whatsapp') {
        const META_WHATSAPP_TOKEN = process.env.META_WHATSAPP_TOKEN;
        if (!META_WHATSAPP_TOKEN) throw new Error('Missing META_WHATSAPP_TOKEN');

        // Placeholder for Meta Cloud API integration
        // e.g. POST https://graph.facebook.com/v20.0/.../messages
        console.log(`[WhatsApp] simulated delivery: ${text}`);

    } else if (channel === 'web') {
        // Guarda en Supabase para que el cliente lo lea por polling o realtime
        const { error } = await supabase.from('messages').insert({
            user_id: job.data.user_id, // ensure user_id is passed if web
            channel: 'web',
            content: text,
            role: 'assistant',
            created_at: new Date().toISOString()
        });

        if (error) {
            throw new Error(`Supabase error saving web message: ${error.message}`);
        }
    } else {
        throw new Error(`Unknown channel: ${channel}`);
    }

    return { success: true, deliveredAt: new Date().toISOString() };
}, {
    connection: connection as any
});

outboxWorker.on('failed', async (job, err) => {
    console.error(`[outbox-worker] Job failed ${job?.id}: ${err.message}`);
    if (job && job.attemptsMade >= job.opts.attempts!) {
        await deadLetterQueue.add('failed-outbox', { jobData: job.data, error: err.message });
    }
});

console.log('Outbox worker configured');
