/**
 * Chime-In Module
 * Allows the bot to organically join conversations without being @mentioned.
 *
 * How it works:
 * - Accumulates messages per channel in a ring buffer (capped at maxBufferSize)
 * - After every `evaluateEvery` messages, asks a cheap LLM: should I chime in?
 * - If YES → generates a full response via a separate AI context and sends it
 * - If NO  → resets the counter but keeps the buffer for context continuity
 */

import { info, error as logError, warn } from '../logger.js';
import { needsSplitting, splitMessage } from '../utils/splitMessage.js';
import { OPENCLAW_TOKEN, OPENCLAW_URL } from './ai.js';

// ── Per-channel state ──────────────────────────────────────────────────────────
// Map<channelId, { messages: Array<{author, content}>, counter: number, lastActive: number, abortController: AbortController|null }>
const channelBuffers = new Map();

// Guard against concurrent evaluations on the same channel
const evaluatingChannels = new Set();

// LRU eviction settings
const MAX_TRACKED_CHANNELS = 100;
const CHANNEL_INACTIVE_MS = 30 * 60 * 1000; // 30 minutes

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Evict inactive channels from the buffer to prevent unbounded memory growth.
 */
function evictInactiveChannels() {
  const now = Date.now();
  for (const [channelId, buf] of channelBuffers) {
    if (now - buf.lastActive > CHANNEL_INACTIVE_MS) {
      channelBuffers.delete(channelId);
    }
  }

  // If still over limit, evict oldest
  if (channelBuffers.size > MAX_TRACKED_CHANNELS) {
    const entries = [...channelBuffers.entries()].sort((a, b) => a[1].lastActive - b[1].lastActive);
    const toEvict = entries.slice(0, channelBuffers.size - MAX_TRACKED_CHANNELS);
    for (const [channelId] of toEvict) {
      channelBuffers.delete(channelId);
    }
  }
}

/**
 * Get or create the buffer state for a channel
 */
function getBuffer(channelId) {
  if (!channelBuffers.has(channelId)) {
    evictInactiveChannels();
    channelBuffers.set(channelId, {
      messages: [],
      counter: 0,
      lastActive: Date.now(),
      abortController: null,
    });
  }
  const buf = channelBuffers.get(channelId);
  buf.lastActive = Date.now();
  return buf;
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
async function shouldChimeIn(buffer, config, signal) {
  const chimeInConfig = config.chimeIn || {};
  const model = chimeInConfig.model || 'claude-haiku-4-5';
  const systemPrompt = config.ai?.systemPrompt || 'You are a helpful Discord bot.';

  // Format the buffered conversation with structured delimiters to prevent injection
  const conversationText = buffer.messages.map((m) => `${m.author}: ${m.content}`).join('\n');

  // System instruction first (required by OpenAI-compatible proxies for Anthropic models)
  const messages = [
    {
      role: 'system',
      content: `You have the following personality:\n${systemPrompt}\n\nYou're monitoring a Discord conversation shown inside <conversation> tags. Based on those messages, could you add something genuinely valuable, interesting, funny, or helpful? Only say YES if a real person would actually want to chime in. Don't chime in just to be present. Reply with only YES or NO.`,
    },
    {
      role: 'user',
      content: `<conversation>\n${conversationText}\n</conversation>`,
    },
  ];

  try {
    const fetchSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
      : AbortSignal.timeout(10_000);

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
      signal: fetchSignal,
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

/**
 * Generate a chime-in response using a separate context (not shared AI history).
 * This avoids polluting the main conversation history used by @mention responses.
 */
async function generateChimeInResponse(buffer, config, signal) {
  const systemPrompt = config.ai?.systemPrompt || 'You are a helpful Discord bot.';
  const model = config.ai?.model || 'claude-sonnet-4-20250514';
  const maxTokens = config.ai?.maxTokens || 1024;

  const conversationText = buffer.messages.map((m) => `${m.author}: ${m.content}`).join('\n');

  const messages = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `[Conversation context — you noticed this discussion and decided to chime in. Respond naturally as if you're joining the conversation organically. Don't announce that you're "chiming in" — just contribute.]\n\n<conversation>\n${conversationText}\n</conversation>`,
    },
  ];

  const fetchSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(30_000)])
    : AbortSignal.timeout(30_000);

  const response = await fetch(OPENCLAW_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(OPENCLAW_TOKEN && { Authorization: `Bearer ${OPENCLAW_TOKEN}` }),
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages,
    }),
    signal: fetchSignal,
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Accumulate a message and potentially trigger a chime-in.
 * Called from the messageCreate handler for every non-bot guild message.
 *
 * @param {Object} message - Discord.js Message object
 * @param {Object} config  - Bot configuration
 */
export async function accumulate(message, config) {
  const chimeInConfig = config.chimeIn;
  if (!chimeInConfig?.enabled) return;
  if (!isChannelEligible(message.channel.id, chimeInConfig)) return;

  // Skip empty or attachment-only messages
  if (!message.content?.trim()) return;

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

  // Create a new AbortController for this evaluation cycle
  const abortController = new AbortController();
  buf.abortController = abortController;

  try {
    info('ChimeIn evaluating', { channelId, buffered: buf.messages.length, counter: buf.counter });

    const yes = await shouldChimeIn(buf, config, abortController.signal);

    // Check if this evaluation was cancelled (e.g. bot was @mentioned during evaluation)
    if (abortController.signal.aborted) {
      info('ChimeIn evaluation cancelled — bot was mentioned or counter reset', { channelId });
      return;
    }

    if (yes) {
      info('ChimeIn triggered — generating response', { channelId });

      await message.channel.sendTyping();

      // Use separate context to avoid polluting shared AI history
      const response = await generateChimeInResponse(buf, config, abortController.signal);

      // Re-check cancellation after response generation
      if (abortController.signal.aborted) {
        info('ChimeIn response suppressed — bot was mentioned during generation', { channelId });
        return;
      }

      // Don't send empty/whitespace responses as unsolicited messages
      if (!response?.trim()) {
        warn('ChimeIn suppressed empty response', { channelId });
      } else {
        // Send as a plain channel message (not a reply)
        if (needsSplitting(response)) {
          const chunks = splitMessage(response);
          for (const chunk of chunks) {
            await message.channel.send(chunk);
          }
        } else {
          await message.channel.send(response);
        }
      }

      // Clear the buffer entirely after a chime-in attempt
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

    // Cancel any in-flight chime-in evaluation to prevent double-responses
    if (buf.abortController) {
      buf.abortController.abort();
      buf.abortController = null;
    }
  }
}
