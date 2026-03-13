/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import TelegramBot from 'node-telegram-bot-api';
import { getSessionUser } from '@/lib/backend/session';

const db = require('@/lib/backend/services/supabase');
import { routeMessage } from '@/lib/backend/module.router';
import { indexConversation } from '@/lib/modules/memory/memory.indexer';
/* eslint-enable @typescript-eslint/no-require-imports */

export async function POST(request: Request) {
    try {
        const payload = await request.json();

        // Basic auth check for internal API
        const authHeader = request.headers.get('authorization');
        const apiKey = process.env.INTERNAL_API_KEY || 'koda_default_key';
        if (authHeader !== `Bearer ${apiKey}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const msg = payload.message || payload;
        if (!msg || (!msg.text && !msg.voice && !msg.audio && !msg.video_note)) {
            return NextResponse.json({ status: "ok", skipped: true });
        }

        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (!botToken) {
            return NextResponse.json({ status: "error", message: "Token not defined" }, { status: 500 });
        }

        // We instantiate the bot but we might not use it to send the final message
        const bot = new TelegramBot(botToken, { polling: false });
        const telegramId = msg.from.id.toString();

        const currentUsername = msg.from.username ? msg.from.username.toLowerCase() : null;
        const user = await getSessionUser(telegramId, currentUsername, msg.from.first_name);

        // We can pass a flag inside `user` or as a 4th argument to indicate we want the generated text returned
        const options = { returnReply: true };

        const reply = await routeMessage(bot, msg, user, options);

        if (typeof reply === 'string') {
            // Asynchronous indexing (fire and forget)
            const textContent = msg.text || '';
            indexConversation(user.id, textContent, reply, options).catch(e => {
                 console.error('[Memory] Error background indexing:', e);
            });

            return NextResponse.json({
                channel: 'telegram',
                chatId: msg.chat.id,
                reply: reply
            });
        }

        return NextResponse.json({ status: "ok" });

    } catch (error: any) {
        console.error("Error in /api/koda:", error);
        return NextResponse.json({ status: "error", message: error.message }, { status: 500 });
    }
}
