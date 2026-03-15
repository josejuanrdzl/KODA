require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const Redis = require('ioredis');

// Registrar ts-node para cargar archivos Typescript
require('ts-node').register({ transpileOnly: true });

const { getSession } = require('./lib/backend/session.manager');
const { routeMessage } = require('./lib/backend/module.router');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const redis = new Redis(process.env.REDIS_URL);
const JJ_ID = '8d0f6704-521b-4913-801b-3bc0b6ea9720';

async function run() {
    console.log('[1] Resetting JJ...');
    await supabase.from('users').update({
        onboarding_complete: false,
        exclusive_mode: null,
        exclusive_data: null
    }).eq('id', JJ_ID);
    
    const { data: user } = await supabase.from('users').select('telegram_id').eq('id', JJ_ID).single();
    if (!user || !user.telegram_id) {
         console.error('No telegram ID'); process.exit(1);
    }
    const tId = user.telegram_id.toString();
    await redis.del(`session:telegram:${tId}`);
    
    const mockBot = { sendMessage: async (chatId, text) => console.log(`[BOT SENDS TO ${chatId}]: ${text}`) };

    const processMessage = async (text) => {
        const msg = { text, from: { id: tId }, chat: { id: tId } };
        const session = await getSession('telegram', tId);
        
        const options = { 
            returnReply: true,
            location: { city: session.effectiveCity, country: session.country, lat: session.lat, lng: session.lng },
            temporal: session.temporal,
            aiEngine: { provider: 'static', model_id: 'fallback' }
        };

        const reply = await routeMessage(mockBot, msg, session, options);
        console.log(`[ROUTE MESSAGE RETURN]:`, reply);
        
        const updatedSession = JSON.parse(await redis.get(`session:telegram:${tId}`));
        console.log(`[SESSION MODE] => mode=${updatedSession.mode}, flowId=${updatedSession.flowId}, step=${updatedSession.flowStep}`);
        console.log('---');
    };

    console.log('\n[2] Trigger Onboarding (Initial Message)...');
    await processMessage("Hola");

    console.log('\n[3] Step 1 -> Send Name...');
    await processMessage("JJ Rodriguez");

    console.log('\n[4] Cancelar Flow...');
    await processMessage("cancelar");

    process.exit(0);
}

run();
