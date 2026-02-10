/**
 * Chime-In Module
 * Allows the bot to organically join conversations without being @mentioned.
 *
 * How it works:
 * - Accumulates messages per channel in a ring buffer (capped at maxBufferSize)
 * - After every `evaluateEvery` messages, asks a cheap LLM: should I chime in?
 * - If YES → generates a full response via the existing AI pipeline and sends it
 * - If NO  → resets the counter but keeps the buffer for context continuity
 */

import { info, warn, error as logError } from '../logger.js';
import { generateResponse } from './ai.js';

// ── Per-channel state ──────────────────────────────────────────────────────────
// Map<channelId, { messages: Array<{author, content}>, counter: number }>
const channelBuffers = new Map();

// Guard against concurrent evaluations on the same channel
const evaluatingChannels = new Set();

// OpenClaw API (same endpoint as ai.js)
const OPENCLAW_URL = process.env.OPENCLAW_URL || 'http://localhost:18789/v1/chat/completions';
const OPENCLAW_TOKEN = process.env.OPENCLAW_TOKEN || '';

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Get or create the buffer state for a channel
 */
function getBuffer(channelId) {
  if (!channelBuffers.has(channelId)) {
    channelBuffers.set(channelId, { messages: [], counter: 0 });
  }
  return channelBuffers.get(channelId);
}

/**
 * Check whether a channel is eligible for chime-in
 */
function isChannelEligible(channelId, chimeInConfig) {
  const { channels = [], excludeChannels = [] } = chimeInConfig;

  // Explicit exclusion always wins
  if (excludeChannels.includes(channelId)) return false;

  // Empty allow-list → all channels allowed
  if (channels.length === 0) return true;

  return channels.includes(channelId);
}

/**
 * Call the evaluation LLM (cheap / fast) to decide whether to chime in
 */
async function shouldChimeIn(buffer, config) {
  const chimeInConfig = config.chimeIn || {};
  const model = chimeInConfig.model || 'claude-haiku-4-5';
  const systemPrompt = config.ai?.systemPrompt || 'You are a helpful Discord bot.';

  // Format the buffered conversation
  const conversationText = buffer.messages
    .map((m) => `${m.author}: ${m.content}`)
    .join('\n');

  const messages = [
    {
      role: 'system',
      content: `You have the following personality:\n${systemPrompt}\n\nYou're monitoring a Discord conversation. Based on the messages below, could you add something genuinely valuable, interesting, funny, or helpful? Only say YES if a real person would actually want to chime in. Don't chime in just to be present. Reply with only YES or NO.`,
    },
    {
      role: 'user',
      content: conversationText,
    },
  ];

  try {
    const response = await fetch(OPENCLAW_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(OPENCLAW_TOKEN && { Authorization: `Bearer ${OPENCLAW_TOKEN}` }),
      },
      body: JSON.stringify({
        model,
        max_tokens: 10,
        messages,
      }),
    });

    if (!response.ok) {
      warn('ChimeIn evaluation API error', { status: response.status });
      return false;
    }

    const data = await response.json();
    const reply = (data.choices?.[0]?.message?.content || '').trim().toUpperCase();
    info('ChimeIn evaluation result', { reply, model });
    return reply.startsWith('YES');
  } catch (err) {
    logError('ChimeIn evaluation failed', { error: err.message });
    return false;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Accumulate a message and potentially trigger a chime-in.
 * Called from the messageCreate handler for every non-bot guild message.
 *
 * @param {Object} message - Discord.js Message object
 * @param {Object} client  - Discord.js Client
 * @param {Object} config  - Bot configuration
 * @param {Object} healthMonitor - Health monitor instance
 */
export async function accumulate(message, client, config, healthMonitor) {
  const chimeInConfig = config.chimeIn;
  if (!chimeInConfig?.enabled) return;
  if (!isChannelEligible(message.channel.id, chimeInConfig)) return;

  const channelId = message.channel.id;
  const buf = getBuffer(channelId);
  const maxBufferSize = chimeInConfig.maxBufferSize || 30;
  const evaluateEvery = chimeInConfig.evaluateEvery || 10;

  // Push to ring buffer
  buf.messages.push({
    author: message.author.username,
    content: message.content,
  });

  // Trim if over cap
  while (buf.messages.length > maxBufferSize) {
    buf.messages.shift();
  }

  // Increment counter
  buf.counter += 1;

  // Not enough messages yet → bail
  if (buf.counter < evaluateEvery) return;

  // Prevent concurrent evaluations for the same channel
  if (evaluatingChannels.has(channelId)) return;
  evaluatingChannels.add(channelId);

  try {
    info('ChimeIn evaluating', { channelId, buffered: buf.messages.length, counter: buf.counter });

    const yes = await shouldChimeIn(buf, config);

    if (yes) {
      info('ChimeIn triggered — generating response', { channelId });

      // Build a context string from the buffered messages
      const contextLines = buf.messages.map((m) => `${m.author}: ${m.content}`).join('\n');
      const contextMessage = `[Conversation context — you noticed this discussion and decided to chime in. Respond naturally as if you're joining the conversation organically. Don't announce that you're "chiming in" — just contribute.]\n\n${contextLines}`;

      await message.channel.sendTyping();

      const response = await generateResponse(
        channelId,
        contextMessage,
        '_chime-in_',   // pseudo-username so ai.js logs it distinctly
        config,
        healthMonitor,
      );

      // Send as a plain channel message (not a reply)
      if (response.length > 2000) {
        const chunks = response.match(/[\s\S]{1,1990}/g) || [];
        for (const chunk of chunks) {
          await message.channel.send(chunk);
        }
      } else {
        await message.channel.send(response);
      }

      // Clear the buffer entirely after a successful chime-in
      buf.messages = [];
      buf.counter = 0;
    } else {
      // Reset counter only — keep the buffer for context continuity
      buf.counter = 0;
    }
  } catch (err) {
    logError('ChimeIn error', { channelId, error: err.message });
    // Reset counter so we don't spin on errors
    buf.counter = 0;
  } finally {
    evaluatingChannels.delete(channelId);
  }
}

/**
 * Reset the chime-in counter for a channel (call when the bot is @mentioned
 * so the mention handler doesn't double-fire with a chime-in).
 *
 * @param {string} channelId
 */
export function resetCounter(channelId) {
  const buf = channelBuffers.get(channelId);
  if (buf) {
    buf.counter = 0;
  }
}
