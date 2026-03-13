require('dotenv').config();
const { handleOnboarding } = require('./lib/modules/onboarding/onboarding.handler');
const db = require('./lib/backend/services/supabase');

async function test() {
    const telegramId = '8619761720'; // My test ID
    const { data: user, error } = await db.supabase.from('users').select('*').eq('telegram_id', telegramId).single();
    
    if (error) {
        console.error('Error fetching user:', error);
        return;
    }

    console.log('--- TEST START ---');
    
    // Reset user state to step 0
    await db.supabase.from('users').update({ 
        active_context: { step: 0 },
        name: null 
    }).eq('id', user.id);
    
    const { data: userStart } = await db.supabase.from('users').select('*').eq('id', user.id).single();
    console.log('Initial User State Context:', JSON.stringify(userStart.active_context, null, 2));

    const bot = { sendMessage: () => Promise.resolve() };
    const msg = {
        message_id: 101,
        chat: { id: 12345 },
        from: { id: telegramId, first_name: 'Test' },
        text: 'Hola',
        _channel: 'telegram'
    };

    // First Call (Simulates Step 0 triggering)
    console.log('\n--- CALL 1 (Initial Greeting) ---');
    await handleOnboarding(bot, msg, userStart, { returnReply: true });

    // Get updated user
    const { data: userAfter1 } = await db.supabase.from('users').select('*').eq('id', user.id).single();
    console.log('User State after Call 1:', JSON.stringify(userAfter1.active_context, null, 2));

    // Second Call (Simulates Retry with same message ID - should be skipped)
    console.log('\n--- CALL 2 (Retry with same MsgId) ---');
    await handleOnboarding(bot, msg, userAfter1, { returnReply: true });

    const { data: userAfter2 } = await db.supabase.from('users').select('*').eq('id', user.id).single();
    console.log('User State after Call 2:', JSON.stringify(userAfter2.active_context, null, 2));

    // Fourth Call (Simulates user sending ANOTHER "Hola" at Step 1 - should trigger Greeting Guard)
    console.log('\n--- CALL 3 (Another Greeting at Step 1) ---');
    const msgGreeting = { ...msg, message_id: 102, text: 'Hola de nuevo' };
    await handleOnboarding(bot, msgGreeting, userAfter2, { returnReply: true });

    const { data: userAfter3 } = await db.supabase.from('users').select('*').eq('id', user.id).single();
    console.log('User State after Call 3 (Should be Step 1 with MsgId 102):', JSON.stringify(userAfter3.active_context, null, 2));

    // Fifth Call (New message with user's name)
    console.log('\n--- CALL 4 (Providing Name) ---');
    const msgName = { ...msg, message_id: 103, text: 'Jose' };
    await handleOnboarding(bot, msgName, userAfter3, { returnReply: true });

    const { data: userAfter4 } = await db.supabase.from('users').select('*').eq('id', user.id).single();
    console.log('User State after Call 4 (Should be Step 2):', JSON.stringify(userAfter4.active_context, null, 2));
    console.log('User Name in DB:', userAfter4.name);
}

test().catch(console.error);
