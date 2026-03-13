if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ ignoreEnvFile: true, silent: true });
}
const { Anthropic } = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const { buildSystemPrompt } = require('../prompt.builder');

async function generateResponse(user, userMessage, chatHistory, memories, notes, reminders, recentJournals, emotionalTimeline, activeHabits = [], disabledModules = [], model = 'claude-sonnet-4-6', familyContext = null) {
  let systemPrompt = buildSystemPrompt(user, memories, notes, reminders, recentJournals, emotionalTimeline, activeHabits, disabledModules, familyContext);
  
  // Anchor de intención para evitar mezcla de contextos
  systemPrompt += `\n\nIMPORTANTE: El usuario acaba de decir: '${userMessage}'. Enfoca tu respuesta ÚNICA Y EXCLUSIVAMENTE en atender esta solicitud. Ignora intenciones de mensajes pasados a menos que el usuario pregunte explícitamente sobre ellos.`;
  
  console.log('[DEBUG] disabledModules:', disabledModules);
  console.log('[DEBUG] systemPrompt starting with (first 200 chars):', systemPrompt.substring(0, 200));
  console.log('[DEBUG] Does prompt have Gmail?', systemPrompt.includes('GMAIL'));
  console.log('[DEBUG] Does prompt have Calendar?', systemPrompt.includes('CALENDAR'));

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
    model: model, // Literal specification from user
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
