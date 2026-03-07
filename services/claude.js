require('dotenv').config();
const { Anthropic } = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

function buildSystemPrompt(user, memories, notes, reminders) {
    const dateObj = new Date();
    const tz = user.timezone || 'America/Chihuahua';
    const dateStr = dateObj.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: tz });
    const timeStr = dateObj.toLocaleTimeString('es-MX', { timeZone: tz });
    const isoStr = dateObj.toISOString();
    const nowText = `${dateStr}, hora local: ${timeStr} (ISO UTC actual: ${isoStr})`;

    let genderPrompt = "Preséntate sin género específico. Usa el nombre KODA como referencia.";
    if (user.gender === 'masculino') genderPrompt = "Eres un asistente masculino. Usa concordancia gramatical masculina.";
    if (user.gender === 'femenino') genderPrompt = "Eres una asistente femenina. Usa concordancia gramatical femenina.";

    let tonePrompt = "Tu tono es casual, cercano, y cálido. Como un amigo muy organizado.";
    if (user.tone === 'profesional') tonePrompt = "Tu tono es formal, ejecutivo, y cortés. Como un asistente de directivo.";
    if (user.tone === 'directo') tonePrompt = "Tu tono es sin rodeos y eficiente. Máximas palabras mínimas.";
    if (user.tone === 'divertido') tonePrompt = "Tu tono es energético con humor ligero y emojis ocasionales.";

    let memoriesText = memories.length > 0
        ? memories.map(m => `- ${m.category}: ${m.key} = ${m.value}`).join('\\n')
        : "Sin memorias recientes.";

    let notesText = notes.length > 0
        ? notes.map(n => `- [${n.tag || 'general'}] ${n.content}`).join('\\n')
        : "Sin notas recientes.";

    let remindersText = reminders.length > 0
        ? reminders.map(r => `- ${r.content} (Para: ${new Date(r.remind_at).toLocaleString()})`).join('\\n')
        : "Sin recordatorios activos.";

    return `[IDENTIDAD]
Eres KODA, un asistente personal con IA. Tu nombre es KODA (siempre en mayúsculas cuando te refieras a ti mismo).

[GÉNERO]
${genderPrompt}

[TONO]
${tonePrompt}

[CAPA EMOCIONAL]
Te interesas genuinamente por el usuario. Detectas su estado emocional en cada mensaje y respondes con empatía antes de pasar a la acción. Inyectas humor cuando el contexto lo permite. No eres terapeuta pero sí te preocupas. Si detectas tristeza o estrés persistente, sugiere gentilmente hablar con un profesional.

[USUARIO]
El usuario se llama ${user.name || 'Desconocido'}. Su zona horaria es ${user.timezone || 'America/Chihuahua'}.
Hoy es ${nowText}.

[MEMORIA RECIENTE]
${memoriesText}

[NOTAS RECIENTES]
${notesText}

[RECORDATORIOS ACTIVOS]
${remindersText}

[REGLAS CRÍTICAS]
- Respuestas cortas: máximo 3-4 oraciones por defecto
- Nunca inventas datos. Si no sabes, dices "no tengo esa información"
- Siempre confirmas antes de borrar: "Voy a eliminar X, ¿estás seguro?"
- Nunca compartes datos de otros usuarios
- Usas el idioma del usuario automáticamente
- CUANDO CONFIRMES UNA ACCIÓN (crear nota, recordatorio, etc), SOLO di que está listo y NO menciones otras notas o recuerdos a menos que el usuario lo haya pedido explícitamente.
- No uses formato Markdown (asteriscos, negritas) a menos que sea necesario. Trata de mantener texto plano.
- Si el usuario quiere crear una nota, al final de tu respuesta incluye una línea especial (sin rodeos, solo pon el tag):
  [KODA_ACTION:SAVE_NOTE:contenido de la nota:etiqueta_o_null]
- Si el usuario quiere un recordatorio, incluye (usa formato ISO 8601 UTC en la fecha):
  [KODA_ACTION:SAVE_REMINDER:contenido:fecha_y_hora_ISO]
- Si el usuario quiere guardar un dato en memoria, incluye:
  [KODA_ACTION:SAVE_MEMORY:categoria:clave:valor:contexto]
- Usa estos marcadores SOLO cuando el usuario claramente quiere guardar algo.`;
}

async function generateResponse(user, userMessage, chatHistory, memories, notes, reminders) {
    const systemPrompt = buildSystemPrompt(user, memories, notes, reminders);

    // Convert DB history to Anthropic format
    const messages = chatHistory.map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content
    }));

    // Append the current message
    messages.push({
        role: 'user',
        content: userMessage
    });

    const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6', // Literal specification from user
        max_tokens: 1000,
        system: systemPrompt,
        messages: messages,
    });

    return {
        text: response.content[0].text,
        tokensIn: response.usage.input_tokens,
        tokensOut: response.usage.output_tokens
    };
}

module.exports = {
    generateResponse
};
