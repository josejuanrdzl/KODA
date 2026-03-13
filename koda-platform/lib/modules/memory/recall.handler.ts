import { supabase } from '../../backend/services/supabase';
const { Anthropic } = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function handleRecallIntent(bot: any, msg: any, user: any, options: any): Promise<boolean> {
    const text = msg.text?.trim() || '';

    // Advanced regex pattern to catch memory queries
    const recallMatch = text.match(/^(qué me dijiste sobre|qué acordé con|qué me dijo|recuerdas cuando hablamos de|busca en mis conversaciones|mencioné algo de|qué dijimos sobre|qué hablamos de)(.*)$/i);
    
    if (recallMatch) {
        let query = recallMatch[2].trim().replace(/^\s*sobre\s+/i, ''); // clean 'sobre'
        
        // Extract @username if present to refine search
        const userMatch = query.match(/@([a-z0-9_]+)/i);
        if (userMatch && userMatch[1] !== 'koda') {
            query = query.replace(/@[a-z0-9_]+/i, '').trim();
            query += ` ${userMatch[1]}`; // add username directly to full text search 
        }

        if (!query || query.length < 3) {
            await bot.sendMessage(user.id, "Por favor, sé un poco más específico sobre qué quieres que recuerde.", options);
            return true;
        }

        const limit = 5;
        const daysBack = 90; // Default recall lookback window

        // Search memory
        const { data: memories, error } = await supabase.rpc('search_user_memory', {
            p_user_id: user.id,
            p_query: query,
            p_match_count: limit,
            p_days_back: daysBack
        });

        if (error || !memories || memories.length === 0) {
            console.log(`[Recall] No memories found for query: ${query}`);
            await bot.sendMessage(user.id, "No encontré nada relacionado a ese tema en tus conversaciones recientes.", options);
            return true;
        }

        console.log(`[Recall] Found ${memories.length} memories for query: ${query}`);

        // Format memories for Claude
        const formattedMemories = memories.map((m: any) => {
            return `Fecha: ${new Date(m.created_at).toLocaleDateString()}\nResumen: ${m.summary}\nPuntos Clave: ${JSON.stringify(m.key_points || [])}\nTemas: ${(m.topics || []).join(', ')}`;
        }).join('\n\n');

        const systemPrompt = `Eres KODA, recordando eventos de conversaciones pasadas basándote ÚNICAMENTE en la memoria proporcionada de la base de datos de retención.

Responde la pregunta del usuario de forma natural, conversacional y directa.
Cita fechas y contexto cuando estén disponibles. 
Usa primera persona refiriéndote al usuario como 'tú'.
Si la información viene de una conversación con otra persona, menciona claramente quién lo dijo (Ejemplo: "@ben te dijo...").
Si en los fragmentos de memoria no encuentras la respuesta, indica que recuerdas que se habló del tema pero no tienes los detalles exactos.

Fragmentos de memoria relevantes encontrados:
${formattedMemories}
`;

        try {
            const response = await anthropic.messages.create({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 500,
                system: systemPrompt,
                messages: [
                    { role: 'user', content: `Pregunta original: "${text}"` }
                ]
            });

            await bot.sendMessage(user.id, response.content[0].text, options);
            return true;

        } catch (e: any) {
            console.error('[Recall] Error querying Sonnet for synthesis:', e);
            await bot.sendMessage(user.id, "Hubo un error al procesar mi memoria. Intenta de nuevo más tarde.", options);
            return true;
        }
    }

    return false;
}
