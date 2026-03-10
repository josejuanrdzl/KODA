require('dotenv').config();
const claude = require('./services/claude');
const db = require('./services/supabase');

async function test() {
    try {
        console.log("Fetching user...");
        let user = await db.getUserByChannelId(740342621, 'telegram'); // Assuming this user exists or use a random ID
        if (!user) {
            console.log("No user found, trying to get any user");
            const { data, error } = await db.supabase.from('users').select('*').limit(1);
            if (error || !data || data.length === 0) {
                console.log("No users in DB");
                return;
            }
            user = data[0];
        }

        console.log("Testing Claude completion for User ID:", user.id);
        const chatHistory = [];
        const response = await claude.generateResponse(
            user,
            "Hola",
            chatHistory,
            [], // memories
            [], // notes
            [], // reminders
            [], // recentJournals
            [], // emotionalTimeline
            []  // activeHabits
        );
        console.log("Claude response:", response);

    } catch (e) {
        console.error("Test Error:", e);
    }
}

test();
