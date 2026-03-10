export type User = {
    id: string;
    telegram_id?: string;
    whatsapp_id?: string;
    plan: "free" | "pro";
    status: "active" | "suspended";
};
