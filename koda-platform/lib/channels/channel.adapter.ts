/**
 * Defines the contract for any messaging channel (Telegram, WhatsApp, etc.)
 * integrating with KODA.
 */
export interface IncomingMessage {
    id: string;
    text: string;
    senderId: string;
    timestamp: number;
    rawPayload: any;
    // Add other relevant fields like media, location, etc.
}

export interface ChannelAdapter {
    /**
     * Validates if the incoming webhook request is authentic and from the expected channel.
     */
    validateWebhook(request: Request): Promise<boolean>;

    /**
     * Parses the raw incoming request body into a standardized KODA IncomingMessage format.
     */
    parseIncoming(body: any): IncomingMessage[];

    /**
     * Sends a message back to the user on the specific channel.
     */
    sendMessage(receiverId: string, text: string, options?: any): Promise<any>;
}
