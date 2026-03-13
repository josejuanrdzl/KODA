import { NextResponse } from "next/server";
import { inboxQueue } from "@/lib/queue";

export async function POST(request: Request) {
    try {
        const update = await request.json();

        if (!update.message) {
            return NextResponse.json({ status: "ok", skipped: true });
        }

        const msg = update.message;

        // Push the update to securely process it via BullMQ
        await inboxQueue.add('process-telegram-update', {
            message: msg,
            channel: 'telegram',
            chatId: msg.chat.id
        });

        // Respond OK fast to Telegram to prevent retries
        return NextResponse.json({ status: "ok", queued: true });
    } catch (error) {
        console.error("Error queueing Telegram webhook:", error);
        return NextResponse.json({ status: "error", message: "Failed to queue hook" }, { status: 200 });
    }
}
