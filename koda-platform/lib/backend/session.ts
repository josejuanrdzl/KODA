const db = require("@/lib/backend/services/supabase");

export async function getSessionUser(telegramId: string, currentUsername: string | null, name: string) {
    let user = await db.getUserByTelegramId(telegramId);

    if (!user) {
        user = await db.createUser({
            telegram_id: telegramId,
            telegram_username: currentUsername,
            name: name || 'Nuevo Usuario',
        });
    } else if (user.telegram_username !== currentUsername && currentUsername) {
        await db.updateUser(user.id, { telegram_username: currentUsername });
        user.telegram_username = currentUsername;
    }

    return user;
}
