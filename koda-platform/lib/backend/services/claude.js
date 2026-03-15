if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ ignoreEnvFile: true, silent: true });
}
const { Anthropic } = require('@anthropic-ai/sdk');
const OpenAI = require('openai');

const { buildSystemPrompt } = require('../prompt.builder');
const { handleEngineError } = require('../ai.selector');

async function simpleGenerate(aiEngine, systemPrompt, userMessage, maxTokens = 1000) {
  if (!aiEngine) throw new Error('No AI engine provided');
  if (aiEngine.provider === 'static') return "KODA se encuentra actualmente en mantenimiento.";

  try {
    if (aiEngine.provider === 'anthropic') {
      const anthropic = new Anthropic({ apiKey: aiEngine.apiKey || process.env.ANTHROPIC_API_KEY });
      const response = await anthropic.messages.create({
        model: aiEngine.model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      });
      return response.content[0].text;
    } else if (aiEngine.provider === 'openai') {
      const openai = new OpenAI({ apiKey: aiEngine.apiKey || process.env.OPENAI_API_KEY_BACKUP });
      const response = await openai.chat.completions.create({
        model: aiEngine.model,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ]
      });
      return response.choices[0].message.content;
    } else {
      throw new Error(`Unsupported provider: ${aiEngine.provider}`);
    }
  } catch (error) {
    console.error(`[AIEngine Error] simpleGenerate ${aiEngine.id} failed:`, error.message);
    await handleEngineError(aiEngine.id, error);
    throw new Error(`AI Engine ${aiEngine.id} failed: ${error.message}`);
  }
}

async function generateResponse(user, userMessage, chatHistory, memories, notes, reminders, recentJournals, emotionalTimeline, activeHabits = [], disabledModules = [], aiEngine = null, familyContext = null) {
  let systemPrompt = buildSystemPrompt(user, memories, notes, reminders, recentJournals, emotionalTimeline, activeHabits, disabledModules, familyContext);
  
  // Anchor de intención para evitar mezcla de contextos
  systemPrompt += `\n\nIMPORTANTE: El usuario acaba de decir: '${userMessage}'. Enfoca tu respuesta ÚNICA Y EXCLUSIVAMENTE en atender esta solicitud. Ignora intenciones de mensajes pasados a menos que el usuario pregunte explícitamente sobre ellos.`;
  
  console.log('[DEBUG] disabledModules:', disabledModules);
  console.log('[DEBUG] systemPrompt starting with (first 200 chars):', systemPrompt.substring(0, 200));
  console.log('[DEBUG] Does prompt have Gmail?', systemPrompt.includes('GMAIL'));
  console.log('[DEBUG] Does prompt have Calendar?', systemPrompt.includes('CALENDAR'));

  if (!aiEngine) {
    throw new Error('No AI engine provided to generateResponse');
  }

  try {
    if (aiEngine.provider === 'static') {
      return {
        text: "KODA se encuentra actualmente en mantenimiento, regresaré en un momento.",
        tokensIn: 0,
        tokensOut: 0
      };
    }

    // Convert DB history
    const messages = chatHistory.map(msg => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content
    }));
    messages.push({ role: 'user', content: userMessage });

    if (aiEngine.provider === 'anthropic') {
      const anthropic = new Anthropic({
        apiKey: aiEngine.apiKey || process.env.ANTHROPIC_API_KEY,
      });
      const response = await anthropic.messages.create({
        model: aiEngine.model,
        max_tokens: 1000,
        system: systemPrompt,
        messages: messages,
      });
      return {
        text: response.content[0].text,
        tokensIn: response.usage.input_tokens,
        tokensOut: response.usage.output_tokens
      };
    } else if (aiEngine.provider === 'openai') {
      const openai = new OpenAI({
        apiKey: aiEngine.apiKey || process.env.OPENAI_API_KEY_BACKUP, // Fallbacking to global env if needed
      });
      const oaiMessages = [
        { role: 'system', content: systemPrompt },
        ...messages
      ];
      const response = await openai.chat.completions.create({
        model: aiEngine.model,
        messages: oaiMessages,
        max_tokens: 1000,
      });
      return {
        text: response.choices[0].message.content,
        tokensIn: response.usage?.prompt_tokens || 0,
        tokensOut: response.usage?.completion_tokens || 0
      };
    } else {
      throw new Error(`Unsupported provider: ${aiEngine.provider}`);
    }
  } catch (error) {
    console.error(`[AIEngine Error] Engine ${aiEngine.id} failed:`, error.message);
    await handleEngineError(aiEngine.id, error);
    throw new Error(`AI Engine ${aiEngine.id} failed: ${error.message}`);
  }
}

module.exports = {
  generateResponse,
  simpleGenerate
};
