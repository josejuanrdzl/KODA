const { supabase } = require('../../backend/services/supabase') as any;
const { Anthropic } = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Llama a Haiku para analizar la conversación e indexar de forma asíncrona.
 */
export async function indexConversation(userId: string, userMessage: string, assistantResponse: string, activeContextParams: any = null): Promise<void> {
    try {
        if (!userMessage || userMessage.length < 20) return;
        
        // Skip commands and quick queries
        const skipPatterns = /^(clima|dólar|dolar|euro|tipo de cambio|partido|marcador|deporte|mis contactos|ver contactos|tengo mensajes|inbox|salir|volver|qué me dijiste|qué me dijo|qué acordé|recuerdas cuando|busca en mis conversaciones)$/i;
        if (skipPatterns.test(userMessage.trim())) return;
        
        // Skip direct chat indexing here to prevent double indexing
        if (activeContextParams?.mode === 'chat' || activeContextParams?.mode?.startsWith('chat_secret')) return;

        const systemPrompt = `Analiza este intercambio de conversación y extrae información relevante en formato JSON estricto. Si no hay información relevante devuelve null.
        
Devuelve SOLO JSON con esta estructura exacta o null:
{
  "summary": "resumen de 1-2 oraciones de qué se habló",
  "key_points": [{"point": "...", "importance": "high|medium|low"}],
  "entities": {
    "people": [],
    "amounts": [],
    "dates": [],
    "places": [],
    "companies": []
  },
  "topics": ["tema1", "tema2"],
  "sentiment": "positive|neutral|negative|urgent"
}

NO indexar si el intercambio es solo:
- Saludos o despedidas
- Consultas de clima o tipo de cambio sin contexto personal
- Comandos de navegación (ver mis chats, salir, etc.)
- Respuestas de una sola palabra`;

        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-5',
            max_tokens: 500,
            system: systemPrompt,
            messages: [
                { role: 'user', content: `Usuario dice: "${userMessage}"\n\nKODA responde: "${assistantResponse}"` }
            ]
        });

        const content = response.content[0].text.trim();
        if (content === 'null' || !content) return;

        let parsed;
        try {
            const jsonStr = content.substring(content.indexOf('{'), content.lastIndexOf('}') + 1);
            parsed = JSON.parse(jsonStr);
        } catch (e) {
            console.error('[Memory Indexer] Error parsing Haiku response:', e);
            return;
        }

        if (!parsed || !parsed.summary) return;

        // Fetch user plan
        const { data: userPlan } = await supabase.from('users').select('plan').eq('id', userId).single();
        const plan = userPlan?.plan || 'free';
        
        let expiresAt = null;
        if (plan === 'free' || plan === 'personal') {
            expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        } else if (plan === 'lifestyle') {
            expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
        } else if (plan === 'executive') {
            expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
        }
        // business -> null keeps forever

        await supabase.from('koda_conversation_memory').insert({
            scope: 'personal',
            owner_user_id: userId,
            source_type: 'conversation',
            source_id: null,
            participants: [userId],
            summary: parsed.summary,
            key_points: parsed.key_points,
            entities: parsed.entities,
            topics: parsed.topics,
            sentiment: parsed.sentiment,
            expires_at: expiresAt
        });

        console.log(`[Memory Indexer] Conversation indexed successfully for user ${userId}`);
    } catch (e) {
        console.error('[Memory Indexer] Failed to index conversation:', e);
    }
}

/**
 * Indexador de Mensajes Directos entre usuarios (Chat KODA)
 */
export async function indexDirectMessage(fromUserId: string, toUserId: string, content: string, messageId: string, fromUsername: string, toUsername: string): Promise<void> {
     try {
         if (!content || content.length < 10) return;
         
         const systemPrompt = `Extrae información relevante de este mensaje directo en formato JSON estricto o null. (Usa la misma estructura que para KODA).
         
Devuelve SOLO JSON con esta estructura exacta o null:
{
  "summary": "resumen de 1-2 oraciones de qué se habló",
  "key_points": [{"point": "...", "importance": "high|medium|low"}],
  "entities": {
    "people": [],
    "amounts": [],
    "dates": [],
    "places": [],
    "companies": []
  },
  "topics": ["tema1", "tema2"],
  "sentiment": "positive|neutral|negative|urgent"
}

NO indexar saludos simples ni mensajes de una palabra.`;
         
         const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-5',
            max_tokens: 300,
            system: systemPrompt,
            messages: [
                { role: 'user', content: `Mensaje: "${content}"` }
            ]
         });
         
         const textContent = response.content[0].text.trim();
         if (textContent === 'null') return;
         
         let parsed;
         try {
             const jsonStr = textContent.substring(textContent.indexOf('{'), textContent.lastIndexOf('}') + 1);
             parsed = JSON.parse(jsonStr);
         } catch (e) {
             console.error('[Memory Indexer] Error parsing Haiku response for DM:', e);
             return;
         }
         
         if (!parsed || !parsed.summary) return;
         
         // Both parties get 30 days retention for DMs by default (can be optimized by plan later)
         const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
         
         // Insert Perspective of Sender
         await supabase.from('koda_conversation_memory').insert({
            scope: 'personal',
            owner_user_id: fromUserId,
            source_type: 'message',
            source_id: messageId,
            participants: [fromUserId, toUserId],
            summary: `Le dijiste a @${toUsername}: ${parsed.summary}`,
            key_points: parsed.key_points,
            entities: parsed.entities,
            topics: parsed.topics,
            sentiment: parsed.sentiment,
            expires_at: expiresAt
         });
         
         // Insert Perspective of Receiver
         await supabase.from('koda_conversation_memory').insert({
            scope: 'personal',
            owner_user_id: toUserId,
            source_type: 'message',
            source_id: messageId,
            participants: [fromUserId, toUserId],
            summary: `@${fromUsername} te dijo: ${parsed.summary}`,
            key_points: parsed.key_points,
            entities: parsed.entities,
            topics: parsed.topics,
            sentiment: parsed.sentiment,
            expires_at: expiresAt
         });
         
         console.log(`[Memory Indexer] DM indexed successfully for ${messageId}`);
     } catch (e) {
         console.error('[Memory Indexer] Direct message indexing failed:', e);
     }
}
