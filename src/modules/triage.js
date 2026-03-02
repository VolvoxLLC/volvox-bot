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
import { fetchChannelCached } from '../utils/discordCache.js';
import { checkGuildBudget } from '../utils/guildSpend.js';
import { safeSend } from '../utils/safeSend.js';
import { CLIProcess, CLIProcessError } from './cli-process.js';
import { buildMemoryContext, extractAndStoreMemories } from './memory.js';

// ── Sub-module imports ───────────────────────────────────────────────────────

import { addToHistory, isChannelBlocked } from './ai.js';
import { getConfig } from './config.js';
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
/**
 * getConfig() returns a mutable reference to the global config object.
 * Module-level `config` captures this reference at startTriage() time.
 * If the config object is ever *replaced* (as opposed to mutated in-place),
 * this cached reference becomes stale. Currently setConfigValue() mutates
 * in-place, so the reference stays valid — but this is a fragile contract.
 * @type {Object|null}
 */
let config = null;
/** @type {Object|null} */
let healthMonitor = null;

/** @type {CLIProcess|null} */
let classifierProcess = null;
/** @type {CLIProcess|null} */
let responderProcess = null;

// ── Budget alert throttle ────────────────────────────────────────────────────
// Track the last time a budget-exceeded alert was posted per guild so we don't
// spam the moderation log channel on every evaluation attempt.
/** @type {Map<string, number>} guildId → timestamp of last alert (ms) */
const budgetAlertSentAt = new Map();
/** Minimum gap between budget-exceeded alerts for the same guild (1 hour). */
const BUDGET_ALERT_COOLDOWN_MS = 60 * 60 * 1_000;

// ── Two-step CLI evaluation ──────────────────────────────────────────────────

/**
 * Classify a channel buffer snapshot using the Haiku classifier and prepare context for responding.
 *
 * Builds a classification prompt from recent channel context and the provided snapshot, sends it to the classifier,
 * parses the result, and, if the classification requires a response, gathers per-target memory context.
 * @param {string} channelId - ID of the channel being evaluated.
 * @param {Array<Object>} snapshot - Array of buffered message entries (author, content, userId, messageId, etc.).
 * @param {Object} evalConfig - Triage configuration (controls context message limits and related settings).
 * @param {import('discord.js').Client} evalClient - Discord client used to fetch additional context and user info.
 * @returns {{classification: Object, classifyMessage: Object, context: Array, memoryContext: string}|null} `{
 *   classification,       // parsed classification object
 *   classifyMessage,      // raw classifier response message (includes cost metadata)
 *   context,              // resolved channel context messages used for prompting
 *   memoryContext         // concatenated memory context for target users (may be empty string)
 * }` when classification produced actionable output; `null` if classification failed or is `'ignore'`. */
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
 * Add an emoji reaction to a Discord message by ID. Fire-and-forget; all errors are swallowed.
 *
 * @param {import('discord.js').Client} evalClient - Discord client.
 * @param {string} channelId - ID of the channel containing the message.
 * @param {string} messageId - ID of the message to react to.
 * @param {string} emoji - Emoji string to react with (e.g. '👀').
 */
async function addReaction(evalClient, channelId, messageId, emoji) {
  try {
    const ch = await evalClient.channels.fetch(channelId).catch(() => null);
    if (!ch) return;
    const msg = await ch.messages.fetch(messageId).catch(() => null);
    if (!msg) return;
    await msg.react(emoji);
  } catch (err) {
    debug('Status reaction failed', { channelId, messageId, emoji, error: err?.message });
  }
}

/**
 * Remove the bot's own reaction from a message. Fire-and-forget; errors are swallowed.
 *
 * @param {import('discord.js').Client} evalClient - Discord client.
 * @param {string} channelId - Channel containing the message.
 * @param {string} messageId - Message to remove the reaction from.
 * @param {string} emoji - Emoji to remove.
 */
async function removeReaction(evalClient, channelId, messageId, emoji) {
  try {
    const ch = await evalClient.channels.fetch(channelId).catch(() => null);
    if (!ch) return;
    const msg = await ch.messages.fetch(messageId).catch(() => null);
    if (!msg) return;
    await msg.reactions.cache.get(emoji)?.users.remove(evalClient.user.id);
  } catch (err) {
    debug('Status reaction removal failed', { channelId, messageId, emoji, error: err?.message });
  }
}

/**
 * Generate a response for a channel snapshot using the Sonnet responder.
 *
 * Builds and sends a respond prompt to the responder process, tracks mid-stream WebSearch tool usage
 * (optionally notifying the channel), and parses the responder output.
 *
 * @param {string} channelId - ID of the channel being evaluated.
 * @param {Array} snapshot - Ordered buffer snapshot of recent messages to include in the prompt.
 * @param {Object} classification - Parsed classifier output that guides response behavior.
 * @param {Array} context - Historical context messages to include in the prompt.
 * @param {string} memoryContext - Concatenated memory context for target users (may be empty).
 * @param {Object} evalConfig - Bot configuration used to construct the respond prompt.
 * @param {Object} evalClient - Discord client instance for sending typing notifications.
 * @param {string|null} [triggerMessageId] - ID of the trigger message to add 🔍 reaction when WebSearch is detected.
 * @param {boolean} [statusReactions] - Whether to add emoji status reactions.
 * @returns {{parsed: Object, respondMessage: Object, searchCount: number}|null} An object containing the parsed responder output (`parsed`), the raw responder message including metadata and cost (`respondMessage`), and the number of `WebSearch` tool uses observed (`searchCount`); returns `null` if no responses were produced.
 */
async function runResponder(
  channelId,
  snapshot,
  classification,
  context,
  memoryContext,
  evalConfig,
  evalClient,
  triggerMessageId = null,
  statusReactions = true,
) {
  const respondPrompt = buildRespondPrompt(
    context,
    snapshot,
    classification,
    evalConfig,
    memoryContext,
  );
  debug('Responder prompt built', { channelId, promptLength: respondPrompt.length });

  // Transition: remove 👀, add 🧠 or 💬 (shows current stage)
  const resolved = resolveTriageConfig(evalConfig.triage || {});
  const respondEmoji = resolved.thinkingTokens > 0 ? '\uD83E\uDDE0' : '\uD83D\uDCAC';
  if (statusReactions && triggerMessageId) {
    removeReaction(evalClient, channelId, triggerMessageId, '\uD83D\uDC40');
    addReaction(evalClient, channelId, triggerMessageId, respondEmoji);
  }

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
            // Add 🔍 reaction to the trigger message to signal web search
            if (statusReactions && triggerMessageId) {
              addReaction(evalClient, channelId, triggerMessageId, '\uD83D\uDD0D');
            }
            const ch = await evalClient.channels.fetch(channelId).catch(() => null);
            if (ch) {
              try {
                await safeSend(ch, '\uD83D\uDD0D Searching the web for that \u2014 one moment...');
              } catch (notifyErr) {
                warn('Failed to send WebSearch notification', {
                  channelId,
                  error: notifyErr?.message,
                });
              }
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
 * Initiates asynchronous extraction and storage of memories for each responder output.
 *
 * For each parsed response this function locates the corresponding message in the buffer
 * (by `targetMessageId` or `targetUser`) and starts a non-blocking memory extraction for that user.
 * Any errors from extraction are caught and do not propagate.
 *
 * @param {Array<Object>} snapshot - Channel buffer snapshot; each entry should include at least `messageId`, `author`, `userId`, and `content`.
 * @param {Object} parsed - Parsed responder output containing a `responses` array where each item may include `targetMessageId`, `targetUser`, and `response`.
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
 * Orchestrates a two-step triage for a channel buffer: classify messages, generate responses when needed, send results, and trigger memory extraction.
 *
 * Performs a classification pass over the provided snapshot and, if the classification warrants, generates and sends responses to Discord, writes analytics/moderation logs, and initiates background memory extraction. Any CLIProcess timeout is rethrown to the caller; other failures are logged and may produce a user-visible error message in the channel.
 *
 * @param {string} channelId - ID of the Discord channel being evaluated.
 * @param {Array<Object>} snapshot - A snapshot of buffered messages for the channel.
 * @param {Object} evalConfig - Effective triage configuration to use for this evaluation.
 * @param {import('discord.js').Client} evalClient - Discord client used to fetch channels and send messages.
 * @throws {CLIProcessError} When a classifier/responder CLI process times out; the error is rethrown.
 */
async function evaluateAndRespond(channelId, snapshot, evalConfig, evalClient) {
  const snapshotIds = new Set(snapshot.map((m) => m.messageId));

  try {
    // ── Guild daily budget gate ─────────────────────────────────────────────
    // Skip evaluation if the guild has exhausted its daily AI spend cap.
    // This prevents runaway costs from high-volume guilds.
    // NOTE: kept inside the try block so the finally { clearEvaluatedMessages }
    // always runs — even when we return early due to budget exhaustion.
    const dailyBudgetUsd = evalConfig.triage?.dailyBudgetUsd;
    if (dailyBudgetUsd != null && dailyBudgetUsd > 0) {
      try {
        const ch = await fetchChannelCached(evalClient, channelId);
        const guildId = ch?.guildId;
        if (guildId) {
          const budget = await checkGuildBudget(guildId, dailyBudgetUsd);
          if (budget.status === 'exceeded') {
            warn('Guild daily AI budget exceeded — skipping triage evaluation', {
              guildId,
              channelId,
              spend: budget.spend,
              budget: budget.budget,
            });
            // Post a throttled alert to the moderation log channel — at most once per
            // BUDGET_ALERT_COOLDOWN_MS — to avoid spamming on every evaluation attempt.
            const logChannelId = evalConfig.triage?.moderationLogChannel;
            if (logChannelId) {
              const now = Date.now();
              const lastAlert = budgetAlertSentAt.get(guildId) ?? 0;
              if (now - lastAlert >= BUDGET_ALERT_COOLDOWN_MS) {
                budgetAlertSentAt.set(guildId, now);
                fetchChannelCached(evalClient, logChannelId)
                  .then((logCh) => {
                    if (logCh) {
                      return safeSend(
                        logCh,
                        `⚠️ **AI spend cap reached** for guild \`${guildId}\` — daily budget of $${budget.budget.toFixed(2)} exceeded (spent $${budget.spend.toFixed(4)}). Triage evaluations are paused until the window resets.`,
                      );
                    }
                  })
                  .catch(() => {});
              }
            }
            return;
          }
          if (budget.status === 'warning') {
            warn('Guild approaching daily AI budget limit', {
              guildId,
              channelId,
              spend: budget.spend,
              budget: budget.budget,
              pct: Math.round(budget.pct * 100),
            });
          }
        }
      } catch (budgetErr) {
        // Non-fatal: if budget check errors, allow evaluation to continue
        debug('Guild budget check failed (non-fatal)', { channelId, error: budgetErr?.message });
      }
    }

    // Step 1: Classify
    const classResult = await runClassification(channelId, snapshot, evalConfig, evalClient);
    if (!classResult) return;

    const { classification, classifyMessage, context, memoryContext } = classResult;

    // Add 👀 reaction to trigger message as visual "I'm on it" signal (fire-and-forget)
    const statusReactions = evalConfig.triage?.statusReactions !== false;
    const triggerMessageId = snapshot[snapshot.length - 1]?.messageId ?? null;
    if (statusReactions && triggerMessageId) {
      addReaction(evalClient, channelId, triggerMessageId, '\uD83D\uDC40');
    }

    // Step 2: Respond
    const respResult = await runResponder(
      channelId,
      snapshot,
      classification,
      context,
      memoryContext,
      evalConfig,
      evalClient,
      triggerMessageId,
      statusReactions,
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

    // Clean up status reactions — remove 💬/🧠 now that response is sent (🔍 stays as historical marker)
    if (statusReactions && triggerMessageId) {
      const respondEmoji = resolved.thinkingTokens > 0 ? '\uD83E\uDDE0' : '\uD83D\uDCAC';
      removeReaction(evalClient, channelId, triggerMessageId, respondEmoji);
    }

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
 * Append a Discord message to the channel's triage buffer and trigger evaluation when conditions are met.
 *
 * Skips processing if triage is disabled, the channel is not eligible, or the message is empty/attachment-only.
 * Truncates message content to 1000 characters and, when the message is a reply, captures up to 500 characters of the referenced message as reply context.
 * Adds the entry to the per-channel bounded ring buffer and records the message in conversation history.
 * If configured trigger words are present, forces an immediate evaluation (and falls back to scheduling if forcing fails); otherwise schedules a dynamic evaluation timer for the channel.
 *
 * @param {import('discord.js').Message} message - The Discord message to accumulate.
 * @param {Object} [msgConfig] - Optional config override. When provided, used directly instead
 *   of calling {@link getConfig}. Live config is fetched via getConfig when not provided.
 */
export async function accumulateMessage(message, msgConfig) {
  const liveConfig = msgConfig || getConfig(message.guild?.id || null);
  const triageConfig = liveConfig.triage;
  if (!triageConfig?.enabled) return;
  if (!isChannelEligible(message.channel.id, triageConfig)) return;

  // Skip blocked channels (no triage processing)
  const parentId = message.channel.parentId;
  if (isChannelBlocked(message.channel.id, parentId, message.guild?.id)) return;

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

  // Log user message to conversation history
  addToHistory(
    channelId,
    'user',
    entry.content,
    entry.author,
    entry.messageId,
    message.guild?.id || null,
  );

  // Check for trigger words -- instant evaluation
  if (checkTriggerWords(message.content, liveConfig)) {
    info('Trigger word detected, forcing evaluation', { channelId });
    evaluateNow(channelId, liveConfig, client, healthMonitor).catch((err) => {
      logError('Trigger word evaluateNow failed', { channelId, error: err.message });
      scheduleEvaluation(channelId, liveConfig);
    });
    return;
  }

  // Schedule or reset the dynamic timer
  scheduleEvaluation(channelId, liveConfig);
}

const MAX_REEVAL_DEPTH = 3;

/**
 * Trigger an immediate triage evaluation for the given channel.
 *
 * @param {string} channelId - The ID of the channel to evaluate.
 * @param {Object} evalConfig - Bot configuration.
 * @param {import('discord.js').Client} evalClient - Discord client.
 * @param {Object} [evalMonitor] - Health monitor.
 * @param {number} [depth=0] - Current recursion depth (guards against infinite re-evaluation loops).
 */
export async function evaluateNow(channelId, evalConfig, evalClient, evalMonitor, depth = 0) {
  if (depth >= MAX_REEVAL_DEPTH) {
    warn('evaluateNow recursion depth limit reached, skipping re-evaluation', { channelId, depth });
    return;
  }
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
        depth + 1,
      ).catch((err) => {
        logError('Pending re-evaluation failed', { channelId, error: err.message });
      });
    }
  }
}
