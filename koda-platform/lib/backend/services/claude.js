if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ ignoreEnvFile: true, silent: true });
}
const { Anthropic } = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const { buildSystemPrompt } = require('../prompt.builder');

async function generateResponse(user, userMessage, chatHistory, memories, notes, reminders, recentJournals, emotionalTimeline, activeHabits = [], disabledModules = [], model = 'claude-sonnet-4-6') {
  const systemPrompt = buildSystemPrompt(user, memories, notes, reminders, recentJournals, emotionalTimeline, activeHabits, disabledModules);

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
