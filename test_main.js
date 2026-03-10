require('dotenv').config();
const { handleMainFlow } = require('./handlers/main');
const db = require('./services/supabase');

(async () => {
    try {
        console.log("Fetching user...");
        let user = await db.getUserByChannelId(740342621, 'telegram');
        if (!user) {
            console.log("No user found by telegram_id, fetching first user...");
            const { data, error } = await db.supabase.from('users').select('*').limit(1);
            if (error || !data || data.length === 0) {
                console.log("No users in DB");
                return;
            }
            user = data[0];
        }

        const mockMsg = {
            chat: { id: 740342621 },
            from: { id: 740342621 },
            text: "Hola sr"
        };

        const mockBot = {
            sendChatAction: () => { },
            sendMessage: async (id, text) => {
                console.log("BOT_REPLY_TEXT:", text);
            }
        };

        console.log("Starting handleMainFlow test for User ID:", user.id);
        await handleMainFlow(mockBot, mockMsg, user);
        console.log("Finished handleMainFlow test.");

    } catch (e) {
        console.error("Test execution error:", e);
    }
})();
