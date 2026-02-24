/**
 * Triage Module
 * Per-channel message triage with split Haiku classifier + Sonnet responder.
 *
 * Two CLIProcess instances handle classification (cheap, fast) and
 * response generation (expensive, only when needed).  ~80% of evaluations are
 * "ignore" -- handled by Haiku alone at ~10x lower cost than Sonnet.
 *
 * This file is the public API facade. Internal logic is split across:
 * - triage-buffer.js   : channel buffer state and LRU eviction
 * - triage-config.js   : config resolution and channel eligibility
 * - triage-filter.js   : text sanitization, trigger words, message ID resolution
 * - triage-prompt.js   : prompt template builders
 * - triage-parse.js    : SDK result JSON parsers
 * - triage-respond.js  : Discord response sending and moderation logging
 */

import { debug, info, error as logError, warn } from '../logger.js';
import { loadPrompt, promptPath } from '../prompts/index.js';
import { safeSend } from '../utils/safeSend.js';
import { CLIProcess, CLIProcessError } from './cli-process.js';
import { buildMemoryContext, extractAndStoreMemories } from './memory.js';

// ── Sub-module imports ───────────────────────────────────────────────────────

import {
  channelBuffers,
  clearEvaluatedMessages,
  consumePendingReeval,
  pushToBuffer,
} from './triage-buffer.js';
import { getDynamicInterval, isChannelEligible, resolveTriageConfig } from './triage-config.js';
import { checkTriggerWords, sanitizeText } from './triage-filter.js';
import { parseClassifyResult, parseRespondResult } from './triage-parse.js';
import { buildClassifyPrompt, buildRespondPrompt } from './triage-prompt.js';
import {
  buildStatsAndLog,
  fetchChannelContext,
  sendModerationLog,
  sendResponses,
} from './triage-respond.js';

// ── Module-level references (set by startTriage) ────────────────────────────
/** @type {import('discord.js').Client|null} */
let client = null;
/** @type {Object|null} */
let config = null;
/** @type {Object|null} */
let healthMonitor = null;

/** @type {CLIProcess|null} */
let classifierProcess = null;
/** @type {CLIProcess|null} */
let responderProcess = null;

// ── Two-step CLI evaluation ──────────────────────────────────────────────────

/**
 * Run classification step via the Haiku classifier.
 * @param {string} channelId - Channel being evaluated
 * @param {Array} snapshot - Buffer snapshot
 * @param {Object} evalConfig - Bot configuration
 * @param {import('discord.js').Client} evalClient - Discord client
 * @returns {Promise<{classification: Object, classifyMessage: Object, context: Array, memoryContext: string}|null>}
 */
async function runClassification(channelId, snapshot, evalConfig, evalClient) {
  const contextLimit = evalConfig.triage?.contextMessages ?? 10;
  const context =
    contextLimit > 0
      ? await fetchChannelContext(channelId, evalClient, snapshot, contextLimit)
      : [];

  const classifyPrompt = buildClassifyPrompt(context, snapshot, evalClient.user?.id);
  debug('Classifier prompt built', {
    channelId,
    promptLength: classifyPrompt.length,
    promptSnippet: classifyPrompt.slice(0, 500),
  });
  const classifyMessage = await classifierProcess.send(classifyPrompt);
  const classification = parseClassifyResult(classifyMessage, channelId);

  if (!classification) {
    return null;
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
    return null;
  }

  // Build memory context for target users
  let memoryContext = '';
  if (classification.targetMessageIds?.length > 0) {
    const targetEntries = snapshot.filter((m) =>
      classification.targetMessageIds.includes(m.messageId),
    );
    const uniqueUsers = new Map();
    for (const entry of targetEntries) {
      if (!uniqueUsers.has(entry.userId)) {
        uniqueUsers.set(entry.userId, { username: entry.author, content: entry.content });
      }
    }

    const memoryParts = await Promise.all(
      [...uniqueUsers.entries()].map(async ([userId, { username, content }]) => {
        try {
          return await Promise.race([
            buildMemoryContext(userId, username, content),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Memory context timeout')), 5000),
            ),
          ]);
        } catch (err) {
          debug('Memory context fetch failed', { userId, error: err.message });
          return '';
        }
      }),
    );
    memoryContext = memoryParts.filter(Boolean).join('');
  }

  return { classification, classifyMessage, context, memoryContext };
}

/**
 * Run response generation step via the Sonnet responder.
 * @param {string} channelId - Channel being evaluated
 * @param {Array} snapshot - Buffer snapshot
 * @param {Object} classification - Parsed classifier output
 * @param {Array} context - Historical context messages
 * @param {string} memoryContext - Memory context string
 * @param {Object} evalConfig - Bot configuration
 * @param {import('discord.js').Client} evalClient - Discord client
 * @returns {Promise<{parsed: Object, respondMessage: Object, searchCount: number}|null>}
 */
async function runResponder(
  channelId,
  snapshot,
  classification,
  context,
  memoryContext,
  evalConfig,
  evalClient,
) {
  const respondPrompt = buildRespondPrompt(
    context,
    snapshot,
    classification,
    evalConfig,
    memoryContext,
  );
  debug('Responder prompt built', { channelId, promptLength: respondPrompt.length });

  // Detect WebSearch tool use mid-stream: send a typing indicator + count searches
  let searchNotified = false;
  let searchCount = 0;
  const respondMessage = await responderProcess.send(
    respondPrompt,
    {},
    {
      onEvent: async (msg) => {
        const toolUses = msg.message?.content?.filter((c) => c.type === 'tool_use') || [];
        const searches = toolUses.filter((t) => t.name === 'WebSearch');
        if (searches.length > 0) {
          searchCount += searches.length;
          if (!searchNotified) {
            searchNotified = true;
            const ch = await evalClient.channels.fetch(channelId).catch(() => null);
            if (ch) {
              await safeSend(ch, '\uD83D\uDD0D Searching the web for that \u2014 one moment...');
            }
          }
        }
      },
    },
  );
  const parsed = parseRespondResult(respondMessage, channelId);

  if (!parsed || !parsed.responses?.length) {
    warn('Responder returned no responses', { channelId });
    return null;
  }

  info('Triage response generated', {
    channelId,
    responseCount: parsed.responses.length,
    totalCostUsd: respondMessage.total_cost_usd,
  });

  return { parsed, respondMessage, searchCount };
}

/**
 * Extract and store memories from responses (fire-and-forget).
 * @param {Array} snapshot - Buffer snapshot
 * @param {Object} parsed - Parsed responder output
 */
function extractMemories(snapshot, parsed) {
  if (!parsed.responses?.length) return;

  for (const r of parsed.responses) {
    const targetEntry =
      snapshot.find((m) => m.messageId === r.targetMessageId) ||
      snapshot.find((m) => m.author === r.targetUser);
    if (targetEntry && r.response) {
      extractAndStoreMemories(
        targetEntry.userId,
        targetEntry.author,
        targetEntry.content,
        r.response,
      ).catch((err) =>
        debug('Memory extraction fire-and-forget failed', {
          userId: targetEntry.userId,
          error: err.message,
        }),
      );
    }
  }
}

/**
 * Evaluate buffered messages using a two-step flow:
 * 1. Classify with Haiku (cheap, fast)
 * 2. Respond with Sonnet (only when classification is non-ignore)
 *
 * @param {string} channelId - The channel being evaluated
 * @param {Array} snapshot - Buffer snapshot
 * @param {Object} evalConfig - Bot configuration
 * @param {import('discord.js').Client} evalClient - Discord client
 */
async function evaluateAndRespond(channelId, snapshot, evalConfig, evalClient) {
  const snapshotIds = new Set(snapshot.map((m) => m.messageId));

  try {
    // Step 1: Classify
    const classResult = await runClassification(channelId, snapshot, evalConfig, evalClient);
    if (!classResult) return;

    const { classification, classifyMessage, context, memoryContext } = classResult;

    // Step 2: Respond
    const respResult = await runResponder(
      channelId,
      snapshot,
      classification,
      context,
      memoryContext,
      evalConfig,
      evalClient,
    );
    if (!respResult) return;

    const { parsed, respondMessage, searchCount } = respResult;

    // Step 3: Build stats, log analytics, and send to Discord
    const resolved = resolveTriageConfig(evalConfig.triage || {});
    const { stats, channel } = await buildStatsAndLog(
      classifyMessage,
      respondMessage,
      resolved,
      snapshot,
      classification,
      searchCount,
      evalClient,
      channelId,
    );

    // Fire-and-forget: send audit embed to moderation log channel
    if (classification.classification === 'moderate') {
      sendModerationLog(evalClient, classification, snapshot, channelId, evalConfig).catch((err) =>
        debug('Moderation log fire-and-forget failed', { error: err.message }),
      );
    }

    await sendResponses(channel, parsed, classification, snapshot, evalConfig, stats, channelId);

    // Step 4: Extract memories (fire-and-forget)
    extractMemories(snapshot, parsed);
  } catch (err) {
    if (err instanceof CLIProcessError && err.reason === 'timeout') {
      warn('Triage evaluation aborted (timeout)', { channelId });
      throw err;
    }

    logError('Triage evaluation failed', { channelId, error: err.message, stack: err.stack });

    // Only send user-visible error for non-parse failures (persistent issues)
    if (!(err instanceof CLIProcessError && err.reason === 'parse')) {
      try {
        const channel = await evalClient.channels.fetch(channelId).catch(() => null);
        if (channel) {
          await safeSend(
            channel,
            "Sorry, I'm having trouble thinking right now. Try again in a moment!",
          );
        }
      } catch (sendErr) {
        debug('Failed to send error message to channel', { channelId, error: sendErr.message });
      }
    }
  } finally {
    clearEvaluatedMessages(channelId, snapshotIds);
  }
}

// ── Timer scheduling ─────────────────────────────────────────────────────────

/**
 * Schedule or reset a dynamic evaluation timer for the specified channel.
 *
 * @param {string} channelId - The channel ID.
 * @param {Object} schedConfig - Bot configuration.
 */
function scheduleEvaluation(channelId, schedConfig) {
  const buf = channelBuffers.get(channelId);
  if (!buf) return;

  // Clear existing timer
  if (buf.timer) {
    clearTimeout(buf.timer);
    buf.timer = null;
  }

  const baseInterval = schedConfig.triage?.defaultInterval ?? 0;
  const interval = getDynamicInterval(buf.messages.length, baseInterval);

  buf.timer = setTimeout(async () => {
    buf.timer = null;
    try {
      await evaluateNow(channelId, schedConfig, client, healthMonitor);
    } catch (err) {
      logError('Scheduled evaluation failed', { channelId, error: err.message });
    }
  }, interval);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Start the triage module: create and boot classifier + responder CLI processes.
 *
 * @param {import('discord.js').Client} discordClient - Discord client
 * @param {Object} botConfig - Bot configuration
 * @param {Object} [monitor] - Health monitor instance
 */
export async function startTriage(discordClient, botConfig, monitor) {
  client = discordClient;
  config = botConfig;
  healthMonitor = monitor;

  const triageConfig = botConfig.triage || {};
  const resolved = resolveTriageConfig(triageConfig);

  classifierProcess = new CLIProcess(
    'classifier',
    {
      model: resolved.classifyModel,
      systemPromptFile: promptPath('triage-classify-system'),
      maxBudgetUsd: resolved.classifyBudget,
      thinkingTokens: 0, // disabled for classifier
      tools: '', // no tools for classification
      ...(resolved.classifyBaseUrl && { baseUrl: resolved.classifyBaseUrl }),
      ...(resolved.classifyApiKey && { apiKey: resolved.classifyApiKey }),
    },
    {
      tokenLimit: resolved.tokenRecycleLimit,
      streaming: resolved.streaming,
      timeout: resolved.timeout,
    },
  );

  // Responder system prompt: use config personality if provided, otherwise use the prompt file.
  // JSON output schema is always appended so it can't be lost when config overrides the personality.
  const responderSystemPromptFlags = botConfig.ai?.systemPrompt
    ? { systemPrompt: botConfig.ai.systemPrompt }
    : { systemPromptFile: promptPath('triage-respond-system') };

  const jsonSchemaAppend = loadPrompt('triage-respond-schema');

  responderProcess = new CLIProcess(
    'responder',
    {
      model: resolved.respondModel,
      ...responderSystemPromptFlags,
      appendSystemPrompt: jsonSchemaAppend,
      maxBudgetUsd: resolved.respondBudget,
      thinkingTokens: resolved.thinkingTokens,
      allowedTools: ['WebSearch'],
      ...(resolved.respondBaseUrl && { baseUrl: resolved.respondBaseUrl }),
      ...(resolved.respondApiKey && { apiKey: resolved.respondApiKey }),
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
    classifyBaseUrl: resolved.classifyBaseUrl || 'direct',
    respondModel: resolved.respondModel,
    respondBaseUrl: resolved.respondBaseUrl || 'direct',
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

  client = null;
  config = null;
  healthMonitor = null;
  info('Triage module stopped');
}

/**
 * Append a Discord message to the channel's triage buffer and trigger evaluation when necessary.
 *
 * @param {import('discord.js').Message} message - The Discord message to accumulate.
 * @param {Object} msgConfig - Bot configuration containing the `triage` settings.
 */
export async function accumulateMessage(message, msgConfig) {
  const triageConfig = msgConfig.triage;
  if (!triageConfig?.enabled) return;
  if (!isChannelEligible(message.channel.id, triageConfig)) return;

  // Skip empty or attachment-only messages
  if (!message.content || message.content.trim() === '') return;

  const channelId = message.channel.id;
  const maxBufferSize = triageConfig.maxBufferSize || 30;

  // Enforce per-message character limit to prevent prompt size abuse
  const MAX_MESSAGE_CHARS = 1000;

  // Build buffer entry with timestamp and optional reply context
  const entry = {
    author: message.author.username,
    content: sanitizeText(message.content.slice(0, MAX_MESSAGE_CHARS)),
    userId: message.author.id,
    messageId: message.id,
    timestamp: message.createdTimestamp,
    replyTo: null,
  };

  // Fetch referenced message content when this is a reply
  if (message.reference?.messageId) {
    try {
      const ref = await message.channel.messages.fetch(message.reference.messageId);
      entry.replyTo = {
        author: ref.author.username,
        userId: ref.author.id,
        content: sanitizeText(ref.content?.slice(0, 500)) || '',
        messageId: ref.id,
      };
    } catch (err) {
      debug('Referenced message fetch failed', {
        channelId,
        messageId: message.id,
        referenceId: message.reference.messageId,
        error: err.message,
      });
    }
  }

  // Push to ring buffer (with truncation warning)
  pushToBuffer(channelId, entry, maxBufferSize);

  // Check for trigger words -- instant evaluation
  if (checkTriggerWords(message.content, msgConfig)) {
    info('Trigger word detected, forcing evaluation', { channelId });
    evaluateNow(channelId, msgConfig, client, healthMonitor).catch((err) => {
      logError('Trigger word evaluateNow failed', { channelId, error: err.message });
      scheduleEvaluation(channelId, msgConfig);
    });
    return;
  }

  // Schedule or reset the dynamic timer
  scheduleEvaluation(channelId, msgConfig);
}

/**
 * Trigger an immediate triage evaluation for the given channel.
 *
 * @param {string} channelId - The ID of the channel to evaluate.
 * @param {Object} evalConfig - Bot configuration.
 * @param {import('discord.js').Client} evalClient - Discord client.
 * @param {Object} [evalMonitor] - Health monitor.
 */
export async function evaluateNow(channelId, evalConfig, evalClient, evalMonitor) {
  const buf = channelBuffers.get(channelId);
  if (!buf || buf.messages.length === 0) return;

  // Cancel any existing in-flight evaluation (abort before checking guard)
  if (buf.abortController) {
    buf.abortController.abort();
    buf.abortController = null;
  }

  // If already evaluating, mark for re-evaluation after current completes.
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

    await evaluateAndRespond(channelId, snapshot, evalConfig, evalClient || client);
  } catch (err) {
    if (err instanceof CLIProcessError && err.reason === 'timeout') {
      warn('Triage evaluation aborted (timeout)', { channelId });
      return;
    }
    logError('Triage evaluation error', { channelId, error: err.message });
  } finally {
    buf.abortController = null;
    buf.evaluating = false;

    // Atomically read-and-clear pendingReeval to avoid race conditions
    if (consumePendingReeval(channelId)) {
      evaluateNow(
        channelId,
        config || evalConfig,
        evalClient || client,
        evalMonitor || healthMonitor,
      ).catch((err) => {
        logError('Pending re-evaluation failed', { channelId, error: err.message });
      });
    }
  }
}

/**
 * Handle an @mention or reply to the bot.
 * Accumulates the message and forces immediate evaluation.
 * Facade for events.js so it doesn't reach into buffer internals.
 *
 * @param {import('discord.js').Message} message - The triggering Discord message
 * @param {Object} mentionConfig - Bot configuration
 * @param {import('discord.js').Client} mentionClient - Discord client
 * @param {Object} [mentionMonitor] - Health monitor
 */
export async function handleMention(message, mentionConfig, mentionClient, mentionMonitor) {
  accumulateMessage(message, mentionConfig);
  message.channel.sendTyping().catch(() => {});
  await evaluateNow(message.channel.id, mentionConfig, mentionClient, mentionMonitor);
}
