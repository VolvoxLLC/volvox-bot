/**
 * AI Module
 * Handles AI chat functionality powered by Claude via OpenClaw
 */

// Conversation history per channel (simple in-memory store)
const conversationHistory = new Map();
const MAX_HISTORY = 20;

// OpenClaw API endpoint
const OPENCLAW_URL = process.env.OPENCLAW_URL || 'http://localhost:18789/v1/chat/completions';
const OPENCLAW_TOKEN = process.env.OPENCLAW_TOKEN || '';

/**
 * Get or create conversation history for a channel
 * @param {string} channelId - Channel ID
 * @returns {Array} Conversation history
 */
export function getHistory(channelId) {
  if (!conversationHistory.has(channelId)) {
    conversationHistory.set(channelId, []);
  }
  return conversationHistory.get(channelId);
}

/**
 * Add message to conversation history
 * @param {string} channelId - Channel ID
 * @param {string} role - Message role (user/assistant)
 * @param {string} content - Message content
 */
export function addToHistory(channelId, role, content) {
  const history = getHistory(channelId);
  history.push({ role, content });

  // Trim old messages
  while (history.length > MAX_HISTORY) {
    history.shift();
  }
}

/**
 * Generate AI response using OpenClaw's chat completions endpoint
 * @param {string} channelId - Channel ID
 * @param {string} userMessage - User's message
 * @param {string} username - Username
 * @param {Object} config - Bot configuration
 * @param {Object} healthMonitor - Health monitor instance (optional)
 * @returns {Promise<string>} AI response
 */
export async function generateResponse(channelId, userMessage, username, config, healthMonitor = null) {
  const history = getHistory(channelId);

  const systemPrompt = config.ai?.systemPrompt || `You are Volvox Bot, a helpful and friendly Discord bot for the Volvox developer community.
You're witty, knowledgeable about programming and tech, and always eager to help.
Keep responses concise and Discord-friendly (under 2000 chars).
You can use Discord markdown formatting.`;

  // Build messages array for OpenAI-compatible API
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: `${username}: ${userMessage}` }
  ];

  try {
    const response = await fetch(OPENCLAW_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(OPENCLAW_TOKEN && { 'Authorization': `Bearer ${OPENCLAW_TOKEN}` })
      },
      body: JSON.stringify({
        model: config.ai?.model || 'claude-sonnet-4-20250514',
        max_tokens: config.ai?.maxTokens || 1024,
        messages: messages,
      }),
    });

    if (!response.ok) {
      if (healthMonitor) {
        healthMonitor.setAPIStatus('error');
      }
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "I got nothing. Try again?";

    // Record successful AI request
    if (healthMonitor) {
      healthMonitor.recordAIRequest();
      healthMonitor.setAPIStatus('ok');
    }

    // Update history
    addToHistory(channelId, 'user', `${username}: ${userMessage}`);
    addToHistory(channelId, 'assistant', reply);

    return reply;
  } catch (err) {
    console.error('OpenClaw API error:', err.message);
    if (healthMonitor) {
      healthMonitor.setAPIStatus('error');
    }
    return "Sorry, I'm having trouble thinking right now. Try again in a moment!";
  }
}
