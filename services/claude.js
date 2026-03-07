if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config({ ignoreEnvFile: true, silent: true });
}
const { Anthropic } = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

function buildSystemPrompt(user, memories, notes, reminders, recentJournals = [], emotionalTimeline = []) {
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

    let emotionalText = emotionalTimeline.length > 0
        ? "El estado emocional reciente del usuario ha fluctuado así:\\n" + emotionalTimeline.map(e => `- Fecha: ${new Date(e.created_at).toLocaleDateString()}, Etiqueta: ${e.mood_label}, Score: ${e.mood_score}/10`).join('\\n')
        : "No hay registros emocionales recientes.";

    let journalsText = recentJournals.length > 0
        ? "Las últimas entradas del diario del usuario son:\\n" + recentJournals.map(j => `- Fecha: ${new Date(j.created_at).toLocaleDateString()}:\\n${j.summary}`).join('\\n')
        : "No hay entradas de diario recientes.";

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

[ESTADO EMOCIONAL RECIENTE]
${emotionalText}

[RESÚMENES DE DIARIO]
${journalsText}

[REGLAS CRÍTICAS]
- Respuestas cortas: máximo 3-4 oraciones por defecto
- Nunca inventas datos. Si no sabes, dices "no tengo esa información"
- Siempre confirmas antes de borrar: "Voy a eliminar X, ¿estás seguro?"
- Nunca compartes datos de otros usuarios
- Usas el idioma del usuario automáticamente
- CUANDO CONFIRMES UNA ACCIÓN (crear nota, recordatorio, entrada de diario, etc), SOLO di que está listo y NO menciones otras notas o recuerdos a menos que el usuario lo haya pedido explícitamente. Respuesta enfocada.
- No uses formato Markdown (asteriscos, negritas) a menos que sea necesario. Trata de mantener texto plano.
- Si el usuario quiere crear una nota, al final de tu respuesta incluye una línea especial (sin rodeos, solo pon el tag):
  [KODA_ACTION:SAVE_NOTE:contenido de la nota:etiqueta_o_null]
- Si el usuario quiere un recordatorio, incluye (usa formato ISO 8601 UTC en la fecha):
  [KODA_ACTION:SAVE_REMINDER:contenido:fecha_y_hora_ISO]
- Si el usuario quiere guardar un dato en memoria, incluye:
  [KODA_ACTION:SAVE_MEMORY:categoria:clave:valor:contexto]
- Si el usuario comparte cómo le fue en su día (reflexiones, anécdotas o explícitamente pide escribir en su diario), RESPONDE SIEMPRE con este formato estricto: "📓 Registrado en tu diario para hoy, [fecha]. [comentario empático breve sin mencionar notas o memorias pasadas]", y al final de tu respuesta incluye este marcador especial con pipes (|):
  [KODA_ACTION:SAVE_JOURNAL:contenido_completo|mood_score_1_al_10|etiqueta_emocional|resumen_narrativo_tercera_persona]
  (Ej. 📓 Registrado en tu diario para hoy, 07 de Marzo. ¡Qué gran noticia lo de tu aumento, a celebrar!
  [KODA_ACTION:SAVE_JOURNAL:Hoy por fin me subieron el sueldo y salí a cenar|9|Alegre|El usuario reporta aumento de sueldo y celebración.])
- Si el usuario te pide analizar un mensaje de un tercero (o es un mensaje reenviado), proporciona tu análisis, danos 2 opciones de respuesta (firme vs conciliadora), y usa el marcador especial:
  [KODA_ACTION:SAVE_ANALYSIS:alias_o_nombre_del_remitente|tono_detectado|resumen_del_analisis]
  (Ej. [KODA_ACTION:SAVE_ANALYSIS:jefe_juan|Pasivo-agresivo|El remitente pide avance urgente fuera de horario laboral presionando con tiempos])
- Usa estos marcadores SOLO cuando el usuario claramente quiere guardar algo o la instrucción es explícita.`;
}

async function generateResponse(user, userMessage, chatHistory, memories, notes, reminders, recentJournals, emotionalTimeline) {
    const systemPrompt = buildSystemPrompt(user, memories, notes, reminders, recentJournals, emotionalTimeline);

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
