/**
 * Triage Module
 * Per-channel message triage with split Haiku classifier + Sonnet responder.
 *
 * Two CLIProcess instances handle classification (cheap, fast) and
 * response generation (expensive, only when needed).  ~80% of evaluations are
 * "ignore" — handled by Haiku alone at ~10x lower cost than Sonnet.
 */

import { info, error as logError, warn } from '../logger.js';
import { loadPrompt, promptPath } from '../prompts/index.js';
import { safeSend } from '../utils/safeSend.js';
import { CLIProcess, CLIProcessError } from './cli-process.js';
import { isSpam } from './spam.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse SDK result text as JSON, tolerating truncation and markdown fencing.
 * Returns parsed object on success, or null on failure (after logging).
 */
function parseSDKResult(raw, channelId, label) {
  if (!raw) return null;
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);

  // Strip markdown code fences if present
  const stripped = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/, '');

  try {
    return JSON.parse(stripped);
  } catch {
    warn(`${label}: JSON parse failed, attempting extraction`, {
      channelId,
      rawLength: text.length,
      rawSnippet: text.slice(0, 200),
    });
  }

  // Try to extract classification from truncated JSON via regex
  const classMatch = stripped.match(/"classification"\s*:\s*"([^"]+)"/);
  const reasonMatch = stripped.match(/"reasoning"\s*:\s*"([^"]*)/);

  if (classMatch) {
    const recovered = {
      classification: classMatch[1],
      reasoning: reasonMatch ? reasonMatch[1] : 'Recovered from truncated response',
      targetMessageIds: [],
    };
    info(`${label}: recovered classification from truncated JSON`, { channelId, ...recovered });
    return recovered;
  }

  warn(`${label}: could not extract classification from response`, {
    channelId,
    rawSnippet: text.slice(0, 200),
  });
  return null;
}

/**
 * Validate a targetMessageId exists in the buffer snapshot.
 * Returns the validated ID, or falls back to the last message from the target user,
 * or the last message in the buffer.
 * @param {string} targetMessageId - The message ID from the SDK response
 * @param {string} targetUser - The username for fallback lookup
 * @param {Array<{author: string, content: string, userId: string, messageId: string}>} snapshot - Buffer snapshot
 * @returns {string} A valid message ID
 */
function validateMessageId(targetMessageId, targetUser, snapshot) {
  // Check if the ID exists in the snapshot
  if (targetMessageId && snapshot.some((m) => m.messageId === targetMessageId)) {
    return targetMessageId;
  }

  // Fallback: last message from the target user
  if (targetUser) {
    for (let i = snapshot.length - 1; i >= 0; i--) {
      if (snapshot[i].author === targetUser) {
        return snapshot[i].messageId;
      }
    }
  }

  // Final fallback: last message in the buffer
  if (snapshot.length > 0) {
    return snapshot[snapshot.length - 1].messageId;
  }

  return null;
}

// ── Module-level references (set by startTriage) ────────────────────────────
/** @type {import('discord.js').Client|null} */
let _client = null;
/** @type {Object|null} */
let _config = null;
/** @type {Object|null} */
let _healthMonitor = null;

/** @type {CLIProcess|null} */
let classifierProcess = null;
/** @type {CLIProcess|null} */
let responderProcess = null;

// ── Per-channel state ────────────────────────────────────────────────────────
/**
 * @typedef {Object} ChannelState
 * @property {Array<{author: string, content: string, userId: string, messageId: string}>} messages - Ring buffer of messages
 * @property {ReturnType<typeof setTimeout>|null} timer - Dynamic interval timer
 * @property {number} lastActivity - Timestamp of last activity
 * @property {boolean} evaluating - Concurrent evaluation guard
 * @property {boolean} pendingReeval - Flag to re-trigger evaluation after current completes
 * @property {AbortController|null} abortController - For cancelling in-flight evaluations
 */

/** @type {Map<string, ChannelState>} */
const channelBuffers = new Map();

// LRU eviction settings
const MAX_TRACKED_CHANNELS = 100;
const CHANNEL_INACTIVE_MS = 30 * 60 * 1000; // 30 minutes

// ── JSON schemas for structured output ───────────────────────────────────────

const CLASSIFY_SCHEMA = {
  type: 'object',
  properties: {
    classification: {
      type: 'string',
      enum: ['ignore', 'respond', 'chime-in', 'moderate'],
    },
    reasoning: { type: 'string' },
    targetMessageIds: {
      type: 'array',
      items: { type: 'string' },
      description: 'Message IDs from the conversation that should receive responses',
    },
  },
  required: ['classification', 'reasoning', 'targetMessageIds'],
};

const RESPOND_SCHEMA = {
  type: 'object',
  properties: {
    responses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          targetMessageId: { type: 'string' },
          targetUser: { type: 'string' },
          response: { type: 'string' },
        },
        required: ['targetMessageId', 'targetUser', 'response'],
      },
    },
  },
  required: ['responses'],
};

// ── Config resolution ───────────────────────────────────────────────────────

/**
 * Resolve triage config with 3-layer legacy fallback:
 * 1. New split format: classifyModel / respondModel / classifyBudget / respondBudget
 * 2. PR #68 flat format: model / budget / timeout
 * 3. Original nested format: models.default / budget.response / timeouts.response
 */
function resolveTriageConfig(triageConfig) {
  const classifyModel =
    triageConfig.classifyModel ??
    (typeof triageConfig.model === 'string'
      ? 'claude-haiku-4-5'
      : triageConfig.models?.default
        ? 'claude-haiku-4-5'
        : 'claude-haiku-4-5');

  const respondModel =
    triageConfig.respondModel ??
    (typeof triageConfig.model === 'string'
      ? triageConfig.model
      : (triageConfig.models?.default ?? 'claude-sonnet-4-6'));

  const classifyBudget =
    triageConfig.classifyBudget ?? (typeof triageConfig.budget === 'number' ? 0.05 : 0.05);

  const respondBudget =
    triageConfig.respondBudget ??
    (typeof triageConfig.budget === 'number'
      ? triageConfig.budget
      : (triageConfig.budget?.response ?? 0.2));

  const timeout =
    typeof triageConfig.timeout === 'number'
      ? triageConfig.timeout
      : (triageConfig.timeouts?.response ?? 30000);

  const tokenRecycleLimit = triageConfig.tokenRecycleLimit ?? 20000;
  const thinkingTokens = triageConfig.thinkingTokens ?? 4096;
  const streaming = triageConfig.streaming ?? false;

  return {
    classifyModel,
    respondModel,
    classifyBudget,
    respondBudget,
    timeout,
    tokenRecycleLimit,
    thinkingTokens,
    streaming,
  };
}

// ── Dynamic interval thresholds ──────────────────────────────────────────────

/**
 * Calculate the evaluation interval based on queue size.
 * More messages in the buffer means faster evaluation cycles.
 * Uses config.triage.defaultInterval as the base (longest) interval.
 * @param {number} queueSize - Number of messages in the channel buffer
 * @param {number} [baseInterval=5000] - Base interval from config.triage.defaultInterval
 * @returns {number} Interval in milliseconds
 */
function getDynamicInterval(queueSize, baseInterval = 5000) {
  if (queueSize <= 1) return baseInterval;
  if (queueSize <= 4) return Math.round(baseInterval / 2);
  return Math.round(baseInterval / 5);
}

// ── Channel eligibility ──────────────────────────────────────────────────────

/**
 * Determine whether a channel should be considered for triage.
 * @param {string} channelId - ID of the channel to evaluate.
 * @param {Object} triageConfig - Triage configuration containing include/exclude lists.
 * @param {string[]} [triageConfig.channels] - Whitelisted channel IDs; an empty array means all channels are allowed.
 * @param {string[]} [triageConfig.excludeChannels] - Blacklisted channel IDs; exclusions take precedence over the whitelist.
 * @returns {boolean} `true` if the channel is eligible, `false` otherwise.
 */
function isChannelEligible(channelId, triageConfig) {
  const { channels = [], excludeChannels = [] } = triageConfig;

  // Explicit exclusion always wins
  if (excludeChannels.includes(channelId)) return false;

  // Empty allow-list means all channels are allowed
  if (channels.length === 0) return true;

  return channels.includes(channelId);
}

// ── LRU eviction ─────────────────────────────────────────────────────────────

/**
 * Remove stale channel states and trim the channel buffer map to the allowed capacity.
 *
 * Iterates tracked channels and clears any whose last activity is older than CHANNEL_INACTIVE_MS.
 * If the total tracked channels still exceeds MAX_TRACKED_CHANNELS, evicts the oldest channels
 * by lastActivity until the count is at or below the limit.
 */
function evictInactiveChannels() {
  const now = Date.now();
  for (const [channelId, buf] of channelBuffers) {
    if (now - buf.lastActivity > CHANNEL_INACTIVE_MS) {
      clearChannelState(channelId);
    }
  }

  // If still over limit, evict oldest
  if (channelBuffers.size > MAX_TRACKED_CHANNELS) {
    const entries = [...channelBuffers.entries()].sort(
      (a, b) => a[1].lastActivity - b[1].lastActivity,
    );
    const toEvict = entries.slice(0, channelBuffers.size - MAX_TRACKED_CHANNELS);
    for (const [channelId] of toEvict) {
      clearChannelState(channelId);
    }
  }
}

// ── Channel state management ─────────────────────────────────────────────────

/**
 * Clear triage state for a channel and stop any scheduled or in-flight evaluation.
 * Cancels the channel's timer, aborts any active evaluation, and removes its buffer from tracking.
 * @param {string} channelId - ID of the channel whose triage state will be cleared.
 */
function clearChannelState(channelId) {
  const buf = channelBuffers.get(channelId);
  if (buf) {
    if (buf.timer) {
      clearTimeout(buf.timer);
    }
    if (buf.abortController) {
      buf.abortController.abort();
    }
    channelBuffers.delete(channelId);
  }
}

/**
 * Get or create the buffer state for a channel.
 * @param {string} channelId - The channel ID
 * @returns {ChannelState} The channel state
 */
function getBuffer(channelId) {
  if (!channelBuffers.has(channelId)) {
    evictInactiveChannels();
    channelBuffers.set(channelId, {
      messages: [],
      timer: null,
      lastActivity: Date.now(),
      evaluating: false,
      pendingReeval: false,
      abortController: null,
    });
  }
  const buf = channelBuffers.get(channelId);
  buf.lastActivity = Date.now();
  return buf;
}

// ── Trigger word detection ───────────────────────────────────────────────────

/**
 * Detects whether text matches spam heuristics or any configured moderation keywords.
 * @param {string} content - Message text to inspect.
 * @param {Object} config - Bot configuration; uses `config.triage.moderationKeywords` if present.
 * @returns {boolean} `true` if the content matches spam patterns or contains a configured moderation keyword, `false` otherwise.
 */
function isModerationKeyword(content, config) {
  if (isSpam(content)) return true;

  const keywords = config.triage?.moderationKeywords || [];
  if (keywords.length === 0) return false;

  const lower = content.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

/**
 * Determine whether the message content contains any configured trigger or moderation keywords.
 * @param {string} content - Message text to examine.
 * @param {Object} config - Bot configuration containing triage.triggerWords and moderation keywords.
 * @returns {boolean} `true` if any configured trigger word or moderation keyword is present, `false` otherwise.
 */
function checkTriggerWords(content, config) {
  const triageConfig = config.triage || {};
  const triggerWords = triageConfig.triggerWords || [];

  if (triggerWords.length > 0) {
    const lower = content.toLowerCase();
    if (triggerWords.some((tw) => lower.includes(tw.toLowerCase()))) {
      return true;
    }
  }

  if (isModerationKeyword(content, config)) return true;

  return false;
}

// ── Prompt builders ─────────────────────────────────────────────────────────

/**
 * Build conversation text with message IDs for prompts.
 * Format: [msg-XXX] username: content
 * @param {Array<{author: string, content: string, userId: string, messageId: string}>} buffer - Buffered messages
 * @returns {string} Formatted conversation text
 */
function buildConversationText(buffer) {
  return buffer
    .map((m) => `[${m.messageId}] ${m.author} (<@${m.userId}>): ${m.content}`)
    .join('\n');
}

/**
 * Build the classifier prompt from the template.
 * @param {Array} snapshot - Buffer snapshot
 * @param {Object} config - Bot configuration
 * @returns {string} Interpolated classify prompt
 */
function buildClassifyPrompt(snapshot) {
  const conversationText = buildConversationText(snapshot);
  const communityRules = loadPrompt('community-rules');
  return loadPrompt('triage-classify', { conversationText, communityRules });
}

/**
 * Build the responder prompt from the template.
 * @param {Array} snapshot - Buffer snapshot
 * @param {Object} classification - Parsed classifier output
 * @param {Object} config - Bot configuration
 * @returns {string} Interpolated respond prompt
 */
function buildRespondPrompt(snapshot, classification, config) {
  const conversationText = buildConversationText(snapshot);
  const communityRules = loadPrompt('community-rules');
  const systemPrompt = config.ai?.systemPrompt || 'You are a helpful Discord bot.';

  return loadPrompt('triage-respond', {
    systemPrompt,
    communityRules,
    conversationText,
    classification: classification.classification,
    reasoning: classification.reasoning,
    targetMessageIds: JSON.stringify(classification.targetMessageIds),
  });
}

// ── Result parsers ──────────────────────────────────────────────────────────

/**
 * Parse the classifier's structured output.
 * @param {Object} sdkMessage - Raw SDK result message
 * @param {string} channelId - For logging
 * @returns {Object|null} Parsed { classification, reasoning, targetMessageIds } or null
 */
function parseClassifyResult(sdkMessage, channelId) {
  let parsed;
  if (sdkMessage.structured_output && typeof sdkMessage.structured_output === 'object') {
    parsed = sdkMessage.structured_output;
  } else {
    parsed = parseSDKResult(sdkMessage.result, channelId, 'Classifier');
  }

  if (!parsed || !parsed.classification) {
    warn('Classifier result unparseable', { channelId });
    return null;
  }

  return parsed;
}

/**
 * Parse the responder's structured output.
 * @param {Object} sdkMessage - Raw SDK result message
 * @param {string} channelId - For logging
 * @returns {Object|null} Parsed { responses: [...] } or null
 */
function parseRespondResult(sdkMessage, channelId) {
  let parsed;
  if (sdkMessage.structured_output && typeof sdkMessage.structured_output === 'object') {
    parsed = sdkMessage.structured_output;
  } else {
    parsed = parseSDKResult(sdkMessage.result, channelId, 'Responder');
  }

  if (!parsed) {
    warn('Responder result unparseable', { channelId });
    return null;
  }

  return parsed;
}

// ── Response sending ────────────────────────────────────────────────────────

/**
 * Send parsed responses to Discord.
 * Extracted from the old evaluateAndRespond for reuse.
 */
async function sendResponses(channelId, parsed, classification, snapshot, config, client) {
  const triageConfig = config.triage || {};
  const type = classification.classification;
  const responses = parsed.responses || [];

  if (type === 'moderate') {
    warn('Moderation flagged', { channelId, reasoning: classification.reasoning });

    if (triageConfig.moderationResponse !== false && responses.length > 0) {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (channel) {
        for (const r of responses) {
          if (r.response?.trim()) {
            const replyRef = validateMessageId(r.targetMessageId, r.targetUser, snapshot);
            if (replyRef) {
              await safeSend(channel, {
                content: r.response,
                reply: { messageReference: replyRef },
              });
            }
          }
        }
      }
    }
    return;
  }

  // respond or chime-in
  if (responses.length === 0) {
    warn('Triage generated no responses for classification', { channelId, classification: type });
    return;
  }

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    warn('Could not fetch channel for triage response', { channelId });
    return;
  }

  await channel.sendTyping();

  for (const r of responses) {
    if (!r.response?.trim()) {
      warn('Triage generated empty response for user', { channelId, targetUser: r.targetUser });
      continue;
    }

    const replyRef = validateMessageId(r.targetMessageId, r.targetUser, snapshot);
    if (replyRef) {
      await safeSend(channel, {
        content: r.response,
        reply: { messageReference: replyRef },
      });
    } else {
      await safeSend(channel, r.response);
    }

    info('Triage response sent', {
      channelId,
      classification: type,
      targetUser: r.targetUser,
      targetMessageId: r.targetMessageId,
    });
  }
}

// ── Two-step CLI evaluation ──────────────────────────────────────────────────

/**
 * Evaluate buffered messages using a two-step flow:
 * 1. Classify with Haiku (cheap, fast)
 * 2. Respond with Sonnet (only when classification is non-ignore)
 *
 * @param {string} channelId - The channel being evaluated
 * @param {Array<{author: string, content: string, userId: string, messageId: string}>} snapshot - Buffer snapshot
 * @param {Object} config - Bot configuration
 * @param {import('discord.js').Client} client - Discord client
 * @param {AbortController} [parentController] - Parent abort controller from evaluateNow
 */
async function evaluateAndRespond(channelId, snapshot, config, client) {
  // Remove only the messages that were part of this evaluation's snapshot.
  // Messages accumulated during evaluation are preserved for re-evaluation.
  const snapshotIds = new Set(snapshot.map((m) => m.messageId));
  const clearBuffer = () => {
    const buf = channelBuffers.get(channelId);
    if (buf) {
      buf.messages = buf.messages.filter((m) => !snapshotIds.has(m.messageId));
    }
  };

  try {
    // Step 1: Classify with Haiku
    const classifyPrompt = buildClassifyPrompt(snapshot);
    const classifyMessage = await classifierProcess.send(classifyPrompt);
    const classification = parseClassifyResult(classifyMessage, channelId);

    if (!classification) {
      clearBuffer();
      return;
    }

    info('Triage classification', {
      channelId,
      classification: classification.classification,
      reasoning: classification.reasoning,
      targetCount: classification.targetMessageIds.length,
      totalCostUsd: classifyMessage.total_cost_usd,
    });

    if (classification.classification === 'ignore') {
      info('Triage: ignoring channel', { channelId, reasoning: classification.reasoning });
      clearBuffer();
      return;
    }

    // Step 2: Respond with Sonnet (only when needed)
    const respondPrompt = buildRespondPrompt(snapshot, classification, config);
    const respondMessage = await responderProcess.send(respondPrompt);
    const parsed = parseRespondResult(respondMessage, channelId);

    if (!parsed || !parsed.responses?.length) {
      warn('Responder returned no responses', { channelId });
      clearBuffer();
      return;
    }

    info('Triage response generated', {
      channelId,
      responseCount: parsed.responses.length,
      totalCostUsd: respondMessage.total_cost_usd,
    });

    // Step 3: Send to Discord
    await sendResponses(channelId, parsed, classification, snapshot, config, client);
    clearBuffer();
  } catch (err) {
    if (err instanceof CLIProcessError && err.reason === 'timeout') {
      info('Triage evaluation aborted (timeout)', { channelId });
      throw err;
    }

    logError('Triage evaluation failed', { channelId, error: err.message, stack: err.stack });

    // Try to send a fallback error message
    try {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (channel) {
        await safeSend(
          channel,
          "Sorry, I'm having trouble thinking right now. Try again in a moment!",
        );
      }
    } catch {
      // Nothing more we can do
    }
  }
}

// ── Timer scheduling ─────────────────────────────────────────────────────────

/**
 * Schedule or reset a dynamic evaluation timer for the specified channel.
 *
 * Computes an interval based on the channel's buffered message count (using
 * `config.triage.defaultInterval` as the base) and starts a timer that will
 * invoke a triage evaluation when it fires. If a timer already exists it is
 * cleared and replaced. No action is taken if the channel has no buffer.
 *
 * @param {string} channelId - The channel ID.
 * @param {Object} config - Bot configuration; `triage.defaultInterval` is used as the base interval (defaults to 5000 ms if unset).
 */
function scheduleEvaluation(channelId, config) {
  const buf = channelBuffers.get(channelId);
  if (!buf) return;

  // Clear existing timer
  if (buf.timer) {
    clearTimeout(buf.timer);
    buf.timer = null;
  }

  const baseInterval = config.triage?.defaultInterval ?? 0;
  const interval = getDynamicInterval(buf.messages.length, baseInterval);

  buf.timer = setTimeout(async () => {
    buf.timer = null;
    try {
      // Use module-level _config ref to ensure latest config in timer callbacks
      await evaluateNow(channelId, _config || config, _client, _healthMonitor);
    } catch (err) {
      logError('Scheduled evaluation failed', { channelId, error: err.message });
    }
  }, interval);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Start the triage module: create and boot classifier + responder CLI processes.
 *
 * @param {import('discord.js').Client} client - Discord client
 * @param {Object} config - Bot configuration
 * @param {Object} [healthMonitor] - Health monitor instance
 */
export async function startTriage(client, config, healthMonitor) {
  _client = client;
  _config = config;
  _healthMonitor = healthMonitor;

  const triageConfig = config.triage || {};
  const resolved = resolveTriageConfig(triageConfig);

  classifierProcess = new CLIProcess(
    'classifier',
    {
      model: resolved.classifyModel,
      systemPromptFile: promptPath('triage-classify-system'),
      jsonSchema: CLASSIFY_SCHEMA,
      maxBudgetUsd: resolved.classifyBudget,
      thinkingTokens: 0, // disabled for classifier
      tools: '', // no tools for classification
    },
    {
      tokenLimit: resolved.tokenRecycleLimit,
      streaming: resolved.streaming,
      timeout: resolved.timeout,
    },
  );

  // Responder system prompt: use config string if provided, otherwise use the prompt file
  const responderSystemPromptFlags = config.ai?.systemPrompt
    ? { systemPrompt: config.ai.systemPrompt }
    : { systemPromptFile: promptPath('triage-respond-system') };

  responderProcess = new CLIProcess(
    'responder',
    {
      model: resolved.respondModel,
      ...responderSystemPromptFlags,
      jsonSchema: RESPOND_SCHEMA,
      maxBudgetUsd: resolved.respondBudget,
      thinkingTokens: resolved.thinkingTokens,
      tools: '', // no tools for response
    },
    {
      tokenLimit: resolved.tokenRecycleLimit,
      streaming: resolved.streaming,
      timeout: resolved.timeout,
    },
  );

  await Promise.all([classifierProcess.start(), responderProcess.start()]);

  info('Triage processes started', {
    classifyModel: resolved.classifyModel,
    respondModel: resolved.respondModel,
    tokenRecycleLimit: resolved.tokenRecycleLimit,
    streaming: resolved.streaming,
    intervalMs: triageConfig.defaultInterval ?? 0,
  });
}

/**
 * Clear all timers, abort in-flight evaluations, close CLI processes, and reset state.
 */
export function stopTriage() {
  classifierProcess?.close();
  responderProcess?.close();
  classifierProcess = null;
  responderProcess = null;

  for (const [, buf] of channelBuffers) {
    if (buf.timer) {
      clearTimeout(buf.timer);
    }
    if (buf.abortController) {
      buf.abortController.abort();
    }
  }
  channelBuffers.clear();

  _client = null;
  _config = null;
  _healthMonitor = null;
  info('Triage module stopped');
}

/**
 * Append a Discord message to the channel's triage buffer and trigger evaluation when necessary.
 *
 * If triage is disabled or the channel is excluded, the message is ignored. Empty or attachment-only
 * messages are ignored. The function appends the message to the per-channel ring buffer, trims the
 * buffer to the configured maximum, forces an immediate evaluation when trigger words are detected,
 * and otherwise schedules a dynamic delayed evaluation.
 *
 * @param {import('discord.js').Message} message - The Discord message to accumulate.
 * @param {Object} config - Bot configuration containing the `triage` settings.
 */
export function accumulateMessage(message, config) {
  const triageConfig = config.triage;
  if (!triageConfig?.enabled) return;
  if (!isChannelEligible(message.channel.id, triageConfig)) return;

  // Skip empty or attachment-only messages
  if (!message.content?.trim()) return;

  const channelId = message.channel.id;
  const buf = getBuffer(channelId);
  const maxBufferSize = triageConfig.maxBufferSize || 30;

  // Push to ring buffer
  buf.messages.push({
    author: message.author.username,
    content: message.content,
    userId: message.author.id,
    messageId: message.id,
  });

  // Trim if over cap
  const excess = buf.messages.length - maxBufferSize;
  if (excess > 0) {
    buf.messages.splice(0, excess);
  }

  // Check for trigger words — instant evaluation
  if (checkTriggerWords(message.content, config)) {
    info('Trigger word detected, forcing evaluation', { channelId });
    evaluateNow(channelId, config, _client, _healthMonitor).catch((err) => {
      logError('Trigger word evaluateNow failed', { channelId, error: err.message });
      scheduleEvaluation(channelId, config);
    });
    return;
  }

  // Schedule or reset the dynamic timer
  scheduleEvaluation(channelId, config);
}

/**
 * Trigger an immediate triage evaluation for the given channel.
 *
 * If the channel has buffered messages, runs classification (and response generation when
 * non-ignore) and dispatches the resulting action. Cancels any in-flight classification;
 * if an evaluation is already running, marks a pending re-evaluation to run after the
 * current evaluation completes.
 *
 * @param {string} channelId - The ID of the channel to evaluate.
 * @param {Object} config - Bot configuration.
 * @param {import('discord.js').Client} client - Discord client.
 * @param {Object} [healthMonitor] - Health monitor.
 */
export async function evaluateNow(channelId, config, client, healthMonitor) {
  const buf = channelBuffers.get(channelId);
  if (!buf || buf.messages.length === 0) return;

  // Cancel any existing in-flight evaluation (abort before checking guard)
  if (buf.abortController) {
    buf.abortController.abort();
    buf.abortController = null;
  }

  // If already evaluating, mark for re-evaluation after current completes.
  // The abort above ensures the in-flight SDK call is cancelled, but the
  // evaluateNow promise is still running and will check pendingReeval in finally.
  if (buf.evaluating) {
    buf.pendingReeval = true;
    return;
  }
  buf.evaluating = true;

  // Clear timer since we're evaluating now
  if (buf.timer) {
    clearTimeout(buf.timer);
    buf.timer = null;
  }

  const abortController = new AbortController();
  buf.abortController = abortController;

  try {
    info('Triage evaluating', { channelId, buffered: buf.messages.length });

    // Take a snapshot of the buffer for evaluation
    const snapshot = [...buf.messages];

    // Check if aborted before evaluation
    if (abortController.signal.aborted) {
      info('Triage evaluation aborted', { channelId });
      return;
    }

    await evaluateAndRespond(channelId, snapshot, config, client || _client);
  } catch (err) {
    if (err instanceof CLIProcessError && err.reason === 'timeout') {
      info('Triage evaluation aborted (timeout)', { channelId });
      return;
    }
    logError('Triage evaluation error', { channelId, error: err.message });
  } finally {
    buf.abortController = null;
    buf.evaluating = false;

    // If a new message arrived during evaluation (e.g. @mention while evaluating),
    // re-trigger evaluation so it isn't silently dropped.
    if (buf.pendingReeval) {
      buf.pendingReeval = false;
      evaluateNow(
        channelId,
        _config || config,
        client || _client,
        healthMonitor || _healthMonitor,
      ).catch((err) => {
        logError('Pending re-evaluation failed', { channelId, error: err.message });
      });
    }
  }
}
