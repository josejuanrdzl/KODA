if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ ignoreEnvFile: true, silent: true });
}
const { Anthropic } = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function buildSystemPrompt(user, memories, notes, reminders, recentJournals = [], emotionalTimeline = [], activeHabits = []) {
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
    ? reminders.map(r => `- ${r.content} (Para: ${new Date(r.remind_at).toLocaleString('es-MX', { timeZone: tz })})`).join('\\n')
    : "Sin recordatorios activos.";

  let emotionalText = emotionalTimeline.length > 0
    ? "El estado emocional reciente fluctúa así:\\n" + emotionalTimeline.map(e => `- Fecha: ${new Date(e.created_at).toLocaleDateString('es-MX', { timeZone: tz })}, Etiqueta: ${e.mood_label}, Score: ${e.mood_score}/10`).join('\\n')
    : "No hay registros emocionales recientes.";

  let journalsText = recentJournals.length > 0
    ? "Últimas entradas del diario:\\n" + recentJournals.map(j => `- Fecha: ${new Date(j.created_at).toLocaleDateString('es-MX', { timeZone: tz })}:\\n${j.summary}`).join('\\n')
    : "No hay entradas de diario recientes.";

  let habitsText = activeHabits.length > 0
    ? "Hábitos activos del usuario (id | nombre | racha actual | total):\\n" + activeHabits.map(h => `- ${h.id} | ${h.name} | racha: ${h.current_streak} días | total completado: ${h.total_completions} veces`).join('\\n')
    : "El usuario no está rastreando ningún hábito actualmente.";

  return `[IDENTIDAD]
Eres KODA, un asistente personal con IA. Tu nombre es KODA (siempre en mayúsculas cuando te refieras a ti mismo).

[GÉNERO]
${genderPrompt}

[TONO]
${tonePrompt}

[CAPA EMOCIONAL]
Te interesas genuinamente por el usuario. Detectas su estado emocional en cada mensaje y respondes con empatía antes de pasar a la acción. Inyectas humor cuando el contexto lo permite. No eres terapeuta pero sí te preocupas. Si detectas tristeza o estrés persistente, sugiere gentilmente hablar con un profesional. Cuando logren completar hábitos, ¡felicítalo de forma motivadora y enfócate en sus "rachas" (streaks)!

[USUARIO]
El usuario se llama ${user.name || 'Desconocido'}. Su zona horaria es ${user.timezone || 'America/Chihuahua'}.
Hoy es ${nowText}.

[MEMORIA RECIENTE]
${memoriesText}

[NOTAS RECIENTES]
${notesText}

[RECORDATORIOS ACTIVOS]
${remindersText}

[HÁBITOS ACTIVOS]
${habitsText}

[ESTADO EMOCIONAL RECIENTE]
${emotionalText}

[RESÚMENES DE DIARIO]
${journalsText}

[REGLAS CRÍTICAS DE COMUNICACIÓN]
- Respuestas cortas: máximo 3-4 oraciones por defecto
- Nunca inventas datos y respondes enfocado al usuario.
- Siempre confirmas antes de borrar: "Voy a eliminar X, ¿estás seguro?"
- Nunca compartes datos de otros usuarios
- Usas el idioma del usuario automáticamente
- Evita usar formato Markdown (asteriscos, negritas) pesado, trata de mantener el texto limpio y legible. Solo úsalo para resaltar cosas muy críticas.

[REGLAS CRÍTICAS DE ACCIONES (MARCADORES KODA_ACTION)]
Inserta estas etiquetas EXACTAMENTE al final de tu respuesta (sin explicarle al usuario que las estás usando) SI descubres que debes ejecutar una acción. Estas etiquetas activan mi backend.
- NOTAS MENTALES (para ti o el usuario):
  [KODA_ACTION:SAVE_NOTE:contenido de la nota:etiqueta_o_null]
- RECORDATORIOS (Usa ISO 8601 UTC en la fecha):
  [KODA_ACTION:SAVE_REMINDER:contenido:fecha_y_hora_ISO]
- CONTEXTOS LARGO PLAZO Y MEMORIAS CLAVES:
  [KODA_ACTION:SAVE_MEMORY:categoria:clave:valor:contexto]
- DIARIO: Usa este formato estricto si el usuario comparte su día. Responde: "📓 Registrado en tu diario para hoy, [fecha]. [comentario]":
  [KODA_ACTION:SAVE_JOURNAL:contenido_completo|mood_score_1_al_10|etiqueta_emocional|resumen_narrativo_tercera_persona]
- ANÁLISIS MENSAJES DE TERCEROS (Si presientes que un msj es reenviado de alguien más, analiza su tono y da 2 opciones de rpta):
  [KODA_ACTION:SAVE_ANALYSIS:alias_remitente|tono_detectado|resumen_del_analisis]
- CREACIÓN DE HÁBITOS (Si el usuario dice "quiero empezar a...", "quiero el hábito de..."):
  [KODA_ACTION:CREATE_HABIT:Nombre del Hábito|Descripción opcional|daily u otra_frecuencia|hora_tipo_HH:mm:ss]
  *Nota sobre hábitos: confirma qué hora de recordatorio quiere si no te lo dijo y luego invoca esta acción en el siguiente mensaje. Por defecto asume 20:00:00 si dice "por la noche".*
- CHECK-IN Y REGISTRO DE HÁBITOS (Si te responden el check-in diario o te dicen "hoy nadé" / "hoy obtuve mi hábito"):
  [KODA_ACTION:LOG_HABIT:id_del_habito_en_DB|true_o_false|nota_u_observacion_opcional]
  *Revisa la tabla de [HÁBITOS ACTIVOS] arriba para obtener el ID correcto.*
- PAUSAR O BORRAR UN HÁBITO:
  [KODA_ACTION:UPDATE_HABIT_STATUS:id_del_habito_en_DB|paused_o_deleted]

DATO IMPORTANTE: Responde motivando al usuario cuando completa un hábito. Si tiene una racha (1, 3, 7, 14, 30 días), destácala. Si la racha es de 1 día: "¡Hoy es el día 1, a darle!", etc.`;
}

async function generateResponse(user, userMessage, chatHistory, memories, notes, reminders, recentJournals, emotionalTimeline, activeHabits = []) {
  const systemPrompt = buildSystemPrompt(user, memories, notes, reminders, recentJournals, emotionalTimeline, activeHabits);

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
