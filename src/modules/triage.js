/**
 * Triage Module
 * Per-channel message triage with split Haiku classifier + Sonnet responder.
 *
 * Two AI SDK calls handle classification (cheap, fast) and
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
import { loadPrompt } from '../prompts/index.js';
import { generate, stream, warmConnection } from '../utils/aiClient.js';
import { fetchChannelCached } from '../utils/discordCache.js';
import { AIClientError } from '../utils/errors.js';
import { checkGuildBudget } from '../utils/guildSpend.js';
import { safeSend } from '../utils/safeSend.js';
import { buildMemoryContext, extractAndStoreMemories } from './memory.js';

// ── Sub-module imports ───────────────────────────────────────────────────────

import { addToHistory, getConversationHistory, isChannelBlocked } from './ai.js';
import { getConfig } from './config.js';
import {
  channelBuffers,
  clearEvaluatedMessages,
  consumePendingReeval,
  pushToBuffer,
  setLastResponseAt,
} from './triage-buffer.js';
import { getDynamicInterval, isChannelEligible, resolveTriageConfig } from './triage-config.js';

import { checkTriggerWords, isGratitude, sanitizeText } from './triage-filter.js';

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

// System prompts are loaded once at startup since they're static; per-call
// provider/model/key/baseUrl overrides are resolved per-eval from the live
// guild config so admin changes take effect without a restart.
/** @type {string|null} Classifier system prompt */
let classifySystemPrompt = null;
/** @type {string|null} Default responder system prompt */
let respondSystemDefault = null;
/** @type {string|null} Responder JSON schema appendix */
let respondJsonSchemaAppend = null;

/**
 * Build per-call AI SDK config for the classifier from an effective guild config.
 * Picks up per-guild model/timeout/apiKey/baseUrl overrides on every eval.
 * @param {Object} evalConfig - Effective guild config
 * @param {Object} [resolved] - Pre-resolved triage config (avoids double resolution)
 * @returns {Object} AI SDK call config
 */
function buildClassifierConfig(evalConfig, resolved) {
  const r = resolved ?? resolveTriageConfig(evalConfig.triage || {});
  return {
    model: r.classifyModel,
    system: classifySystemPrompt,
    thinking: 0,
    timeout: r.timeout,
    ...(r.classifyBaseUrl && { baseUrl: r.classifyBaseUrl }),
    ...(r.classifyApiKey && { apiKey: r.classifyApiKey }),
  };
}

/**
 * Build per-call AI SDK config for the responder from an effective guild config.
 * Picks up per-guild model/timeout/apiKey/baseUrl/systemPrompt overrides on every eval.
 * @param {Object} evalConfig - Effective guild config
 * @param {Object} [resolved] - Pre-resolved triage config (avoids double resolution)
 * @returns {Object} AI SDK call config
 */
function buildResponderConfig(evalConfig, resolved) {
  const r = resolved ?? resolveTriageConfig(evalConfig.triage || {});
  const baseSystem = evalConfig.ai?.systemPrompt || respondSystemDefault;
  return {
    model: r.respondModel,
    system: `${baseSystem}\n\n${respondJsonSchemaAppend}`,
    thinking: 0,
    timeout: r.timeout,
    tools: [],
    ...(r.respondBaseUrl && { baseUrl: r.respondBaseUrl }),
    ...(r.respondApiKey && { apiKey: r.respondApiKey }),
  };
}

// ── Budget alert throttle ────────────────────────────────────────────────────
// Track the last time a budget-exceeded alert was posted per guild so we don't
// spam the moderation log channel on every evaluation attempt.
/** @type {Map<string, number>} guildId → timestamp of last alert (ms) */
const budgetAlertSentAt = new Map();
/** Minimum gap between budget-exceeded alerts for the same guild (1 hour). */
const BUDGET_ALERT_COOLDOWN_MS = 60 * 60 * 1_000;

// ── Two-step CLI evaluation ──────────────────────────────────────────────────

/**
 * Classify a buffered channel snapshot and prepare context and memory for potential responses.
 *
 * Sends a classification prompt built from recent channel context and the provided snapshot to the classifier;
 * when the result indicates a response is required, gathers the channel context and per-target memory context.
 * @param {string} channelId - ID of the channel being evaluated.
 * @param {Array<Object>} snapshot - Buffered message entries (objects containing at least author, content, userId, messageId, and optional guildId).
 * @param {Object} evalConfig - Evaluation configuration; uses triage settings such as `contextMessages` and `confidenceThreshold`.
 * @param {import('discord.js').Client} evalClient - Discord client used to detect the bot user and to fetch additional channel/user context.
 * @param {AbortSignal} [abortSignal] - Optional abort signal; forwarded to the classifier SDK call so a superseded evaluation can be cancelled.
 * @returns {{classification: Object, classifyMessage: Object, context: Array<Object>, memoryContext: string, wasMentioned: boolean}|null} An object with:
 *   - `classification`: parsed classification result (label, confidence, reasoning, targetMessageIds, etc.),
 *   - `classifyMessage`: raw classifier response message (includes cost/metadata),
 *   - `context`: array of channel context messages used for prompting,
 *   - `memoryContext`: concatenated memory context for target users (may be empty string),
 *   - `wasMentioned`: `true` if the bot was @mentioned in the snapshot; `false` otherwise.
 *   Returns `null` if classification failed, was determined to be `'ignore'`, or failed the confidence threshold gates.
 */
async function runClassification(channelId, snapshot, evalConfig, evalClient, abortSignal) {
  const timings = { start: Date.now() };

  const contextLimit = evalConfig.triage?.contextMessages ?? 10;
  const context =
    contextLimit > 0
      ? await fetchChannelContext(channelId, evalClient, snapshot, contextLimit)
      : [];
  timings.contextFetched = Date.now();

  // Gather bot's recent responses in this channel for self-awareness
  const BOT_ACTIVITY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
  const now = Date.now();
  const channelHistory = getConversationHistory().get(channelId) || [];
  const botActivity = channelHistory
    .filter(
      (m) => m.role === 'assistant' && m.timestamp && now - m.timestamp < BOT_ACTIVITY_WINDOW_MS,
    )
    .slice(-3); // last 3 bot responses at most

  const classifyPrompt = buildClassifyPrompt(context, snapshot, evalClient.user?.id, botActivity);
  debug('Classifier prompt built', {
    channelId,
    promptLength: classifyPrompt.length,
    promptSnippet: classifyPrompt.slice(0, 500),
  });
  const classifyCfg = buildClassifierConfig(evalConfig);
  const classifyMessage = await generate({
    ...classifyCfg,
    prompt: classifyPrompt,
    abortSignal,
  });
  timings.classifyDone = Date.now();

  const classification = parseClassifyResult(classifyMessage, channelId);

  if (!classification) {
    return null;
  }

  info('Triage classification', {
    channelId,
    classification: classification.classification,
    reasoning: classification.reasoning,
    targetCount: classification.targetMessageIds.length,
    totalCostUsd: classifyMessage.costUsd,
  });

  debug('runClassification timing', {
    channelId,
    contextFetchMs: timings.contextFetched - timings.start,
    classifyApiMs: timings.classifyDone - timings.contextFetched,
    totalMs: timings.classifyDone - timings.start,
  });

  // Never ignore when the bot is @mentioned — override classifier mistakes.
  let wasMentioned = false;
  const botId = evalClient.user?.id;
  if (botId) {
    const mentionTag = `<@${botId}>`;
    wasMentioned = snapshot.some((m) => m.content?.includes(mentionTag));
    if (classification.classification === 'ignore' && wasMentioned) {
      info('Triage: overriding ignore → respond (bot was @mentioned)', {
        channelId,
      });
      classification.classification = 'respond';
      classification.targetMessageIds = snapshot
        .filter((m) => m.content?.includes(mentionTag))
        .map((m) => m.messageId);
    }
  }

  if (classification.classification === 'ignore') {
    info('Triage: ignoring channel', {
      channelId,
      reasoning: classification.reasoning,
    });
    return null;
  }

  // ── Confidence threshold gate ─────────────────────────────────────────────
  // Drop low-confidence classifications unless safety-critical or @mentioned.
  const confidenceThreshold = evalConfig.triage?.confidenceThreshold ?? 0.6;
  const confidence = classification.confidence ?? 1;
  if (
    classification.classification !== 'moderate' &&
    !wasMentioned &&
    confidence < confidenceThreshold
  ) {
    info('Triage: confidence below threshold, skipping', {
      channelId,
      confidence,
      threshold: confidenceThreshold,
      classification: classification.classification,
    });
    return null;
  }

  // Build memory context for target users
  timings.memoryStart = Date.now();
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
        let timer;
        try {
          return await Promise.race([
            buildMemoryContext(userId, username, content),
            new Promise((_, reject) => {
              timer = setTimeout(() => reject(new Error('Memory context timeout')), 5000);
            }),
          ]);
        } catch (err) {
          debug('Memory context fetch failed', { userId, error: err.message });
          return '';
        } finally {
          clearTimeout(timer);
        }
      }),
    );
    memoryContext = memoryParts.filter(Boolean).join('');
  }
  timings.memoryDone = Date.now();

  debug('runClassification full timing', {
    channelId,
    contextFetchMs: timings.contextFetched - timings.start,
    classifyApiMs: timings.classifyDone - timings.contextFetched,
    memoryFetchMs: timings.memoryDone - timings.memoryStart,
    totalMs: timings.memoryDone - timings.start,
  });

  return { classification, classifyMessage, context, memoryContext, wasMentioned };
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
  abortSignal = null,
  resolved = null,
) {
  const timings = { start: Date.now() };

  const respondPrompt = buildRespondPrompt(
    context,
    snapshot,
    classification,
    evalConfig,
    memoryContext,
  );
  timings.promptBuilt = Date.now();
  debug('Responder prompt built', { channelId, promptLength: respondPrompt.length });

  // Per-call overrides: thinking and tools are driven by the classifier's signals
  const resolvedConfig = resolved ?? resolveTriageConfig(evalConfig.triage || {});
  const responderCfg = buildResponderConfig(evalConfig, resolvedConfig);
  const thinkingForCall = classification.needsThinking ? resolvedConfig.thinkingTokens : 0;
  const toolsForCall = classification.needsSearch ? ['WebSearch'] : [];

  // Transition: remove 👀, add 🧠 or 💬 (shows current stage)
  const respondEmoji = thinkingForCall > 0 ? '\uD83E\uDDE0' : '\uD83D\uDCAC';
  if (statusReactions && triggerMessageId) {
    removeReaction(evalClient, channelId, triggerMessageId, '\uD83D\uDC40');
    addReaction(evalClient, channelId, triggerMessageId, respondEmoji);
  }

  // Detect WebSearch tool use mid-stream: send a typing indicator + count searches
  let searchNotified = false;
  let searchCount = 0;
  const respondMessage = await stream({
    ...responderCfg,
    thinking: thinkingForCall,
    tools: toolsForCall,
    prompt: respondPrompt,
    abortSignal,
    onChunk: async (toolName) => {
      if (toolName === 'web_search') {
        searchCount++;
        if (!searchNotified) {
          searchNotified = true;
          // Add 🔍 reaction to the trigger message to signal web search
          if (statusReactions && triggerMessageId) {
            addReaction(evalClient, channelId, triggerMessageId, '\uD83D\uDD0D');
          }
          const ch = await fetchChannelCached(evalClient, channelId).catch(() => null);
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
  });
  timings.streamDone = Date.now();

  // Fallback: if server-side tool didn't emit onChunk events, check result.sources
  if (searchCount === 0 && respondMessage.sources?.length > 0) {
    searchCount = respondMessage.sources.length;
  }
  const parsed = parseRespondResult(respondMessage, channelId);

  if (!parsed?.responses?.length) {
    warn('Responder returned no responses', { channelId });
    return null;
  }

  debug('runResponder timing', {
    channelId,
    promptBuildMs: timings.promptBuilt - timings.start,
    streamApiMs: timings.streamDone - timings.promptBuilt,
  });

  info('Triage response generated', {
    channelId,
    responseCount: parsed.responses.length,
    totalCostUsd: respondMessage.costUsd,
  });

  return { parsed, respondMessage, searchCount, respondEmoji };
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
 * Performs a classification pass over the provided snapshot and, if the classification warrants, generates and sends responses to Discord, writes analytics/moderation logs, and initiates background memory extraction. Any AI client timeout is rethrown to the caller; other failures are logged and may produce a user-visible error message in the channel.
 *
 * @param {string} channelId - ID of the Discord channel being evaluated.
 * @param {Array<Object>} snapshot - A snapshot of buffered messages for the channel.
 * @param {Object} evalConfig - Effective triage configuration to use for this evaluation.
 * @param {import('discord.js').Client} evalClient - Discord client used to fetch channels and send messages.
 * @throws {AIClientError} When the classifier/responder AIClient call times out or is aborted; rethrown so the caller can no-op cleanly.
 */
async function evaluateAndRespond(channelId, snapshot, evalConfig, evalClient, abortSignal) {
  const snapshotIds = new Set(snapshot.map((m) => m.messageId));

  try {
    // Shared state used by gratitude detection, cooldown gate, and status reactions
    const buf = channelBuffers.get(channelId);
    const newestMsg = snapshot.at(-1);

    // ── Gratitude detection (before any AI call) ────────────────────────────
    // If the bot recently responded and the newest message is gratitude,
    // react with ❤️ and skip entirely — no classifier or responder cost.
    const gratitudeWindowMs = 60_000;
    if (
      buf?.lastResponseAt > 0 &&
      Date.now() - buf.lastResponseAt < gratitudeWindowMs &&
      newestMsg &&
      isGratitude(newestMsg.content)
    ) {
      info('Triage: gratitude detected, reacting with ❤️', {
        channelId,
        messageId: newestMsg.messageId,
        author: newestMsg.author,
      });
      addReaction(evalClient, channelId, newestMsg.messageId, '\u2764\uFE0F');
      return;
    }

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
                fetchChannelCached(evalClient, logChannelId, guildId)
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
    const classResult = await runClassification(
      channelId,
      snapshot,
      evalConfig,
      evalClient,
      abortSignal,
    );
    if (!classResult) return;

    const { classification, classifyMessage, context, memoryContext, wasMentioned } = classResult;

    // ── Response cooldown gate ───────────────────────────────────────────────
    // Prevent rapid-fire responses. @mentions and moderation bypass the cooldown.
    const cooldownMs = evalConfig.triage?.responseCooldownMs ?? 10_000;
    if (
      buf?.lastResponseAt > 0 &&
      Date.now() - buf.lastResponseAt < cooldownMs &&
      classification.classification !== 'moderate' &&
      !wasMentioned
    ) {
      info('Triage: cooldown active, skipping response', {
        channelId,
        elapsed: Date.now() - buf.lastResponseAt,
        cooldownMs,
      });
      return;
    }

    // Add 👀 reaction to trigger message as visual "I'm on it" signal (fire-and-forget)
    const statusReactions = evalConfig.triage?.statusReactions !== false;
    const triggerMessageId = newestMsg?.messageId ?? null;
    if (statusReactions && triggerMessageId) {
      addReaction(evalClient, channelId, triggerMessageId, '\uD83D\uDC40');
    }

    // Resolve triage config once for the entire evaluation cycle
    const resolved = resolveTriageConfig(evalConfig.triage || {});

    // B3: Budget enforcement — warn if classifier cost exceeded its budget
    if (classifyMessage.costUsd > resolved.classifyBudget) {
      warn('Classify cost exceeded budget', {
        channelId,
        costUsd: classifyMessage.costUsd,
        classifyBudget: resolved.classifyBudget,
        overage: classifyMessage.costUsd - resolved.classifyBudget,
      });
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
      abortSignal,
      resolved,
    );
    if (!respResult) return;

    const { parsed, respondMessage, searchCount, respondEmoji } = respResult;

    // B3: Budget enforcement — warn if responder cost exceeded its budget
    if (respondMessage.costUsd > resolved.respondBudget) {
      warn('Respond cost exceeded budget', {
        channelId,
        costUsd: respondMessage.costUsd,
        respondBudget: resolved.respondBudget,
        overage: respondMessage.costUsd - resolved.respondBudget,
      });
    }

    // Step 3: Build stats, log analytics, and send to Discord
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
      sendModerationLog(
        evalClient,
        classification,
        snapshot,
        channelId,
        evalConfig,
        channel?.guildId,
      ).catch((err) => debug('Moderation log fire-and-forget failed', { error: err.message }));
    }

    const didSend = await sendResponses(
      channel,
      parsed,
      classification,
      snapshot,
      evalConfig,
      stats,
      channelId,
    );

    // Record response timestamp for cooldown tracking — only if we actually sent something
    if (didSend) setLastResponseAt(channelId);

    // Clean up status reactions — remove 💬/🧠 now that response is sent (🔍 stays as historical marker)
    if (statusReactions && triggerMessageId) {
      removeReaction(evalClient, channelId, triggerMessageId, respondEmoji);
    }

    // Step 4: Extract memories (fire-and-forget)
    extractMemories(snapshot, parsed);
  } catch (err) {
    // Abort and timeout are silent no-ops — the caller (evaluateNow) may have
    // intentionally superseded this evaluation, or the provider cut us off.
    // Either way, this is routine and must NOT surface a user-visible error.
    if (err instanceof AIClientError && (err.reason === 'timeout' || err.reason === 'aborted')) {
      warn('Triage evaluation aborted', { channelId, reason: err.reason });
      throw err;
    }

    logError('Triage evaluation failed', { channelId, error: err.message, stack: err.stack });

    // Only send user-visible error for non-parse failures (persistent issues)
    if (!(err instanceof AIClientError && err.reason === 'parse')) {
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

  // Load static prompts once; per-call model/timeout/apiKey/baseUrl are
  // resolved per evaluation from the live guild config so admin changes
  // take effect without restarting.
  classifySystemPrompt = loadPrompt('triage-classify-system');
  respondSystemDefault = loadPrompt('triage-respond-system');
  respondJsonSchemaAppend = loadPrompt('triage-respond-schema');

  const triageConfig = botConfig.triage || {};
  const resolved = resolveTriageConfig(triageConfig);

  info('Triage configured', {
    classifyModel: resolved.classifyModel,
    classifyBaseUrl: resolved.classifyBaseUrl || 'direct',
    respondModel: resolved.respondModel,
    respondBaseUrl: resolved.respondBaseUrl || 'direct',
    intervalMs: triageConfig.defaultInterval ?? 0,
  });

  // Pre-warm provider cache + TCP/TLS connections (best-effort, non-blocking)
  warmConnection(resolved.classifyModel, {
    ...(resolved.classifyBaseUrl && { baseUrl: resolved.classifyBaseUrl }),
    ...(resolved.classifyApiKey && { apiKey: resolved.classifyApiKey }),
  }).catch(() => {});
  warmConnection(resolved.respondModel, {
    ...(resolved.respondBaseUrl && { baseUrl: resolved.respondBaseUrl }),
    ...(resolved.respondApiKey && { apiKey: resolved.respondApiKey }),
  }).catch(() => {});
}

/**
 * Clear all timers, abort in-flight evaluations, and reset state.
 */
export function stopTriage() {
  classifySystemPrompt = null;
  respondSystemDefault = null;
  respondJsonSchemaAppend = null;

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
 * Append a Discord message to the channel's triage buffer and trigger evaluation when appropriate.
 *
 * Builds a sanitized buffer entry (truncating message content to 1000 characters), optionally attaches up to
 * 500 characters of referenced message context for replies, stores the entry in the per-channel ring buffer,
 * and records the message in conversation history. If configured trigger words are present, attempts an immediate
 * evaluation and falls back to scheduling; otherwise sets or refreshes the dynamic evaluation timer for the channel.
 *
 * @param {import('discord.js').Message} message - The Discord message to accumulate.
 * @param {Object} [msgConfig] - Optional configuration override; when provided it is used instead of calling getConfig.
 */
export async function accumulateMessage(message, msgConfig) {
  const liveConfig = msgConfig || getConfig(message.guild?.id || null);
  const triageConfig = liveConfig.triage;
  if (!triageConfig?.enabled) return;
  if (!isChannelEligible(message.channel.id, triageConfig)) return;

  // Skip blocked channels (no triage processing)
  // Only check parentId for threads - for regular channels, parentId is the category ID
  const parentId = message.channel.isThread?.() ? message.channel.parentId : null;
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
    channelName: message.channel.name ?? null,
    channelTopic: message.channel.topic ?? null,
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
      // Mark replies to non-bot users so the classifier can deprioritize them
      const botId = client?.user?.id;
      entry.replyToHuman = !ref.author.bot && ref.author.id !== botId;
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
    entry.userId,
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
 * Run an immediate triage evaluation of the buffered messages for the given channel.
 *
 * @param {string} channelId - ID of the channel whose buffer should be evaluated.
 * @param {Object} evalConfig - Bot configuration used for this evaluation (and for any bounded recursive re-evaluations).
 * @param {import('discord.js').Client} [evalClient] - Optional Discord client to use instead of the module client.
 * @param {Object} [evalMonitor] - Optional health monitor used for recursive evaluations.
 * @param {number} [depth=0] - Current recursion depth; stops further re-evaluations once the configured max depth is reached.
 */
export async function evaluateNow(channelId, evalConfig, evalClient, evalMonitor, depth = 0) {
  if (depth >= MAX_REEVAL_DEPTH) {
    warn('evaluateNow recursion depth limit reached, skipping re-evaluation', { channelId, depth });
    return;
  }
  const buf = channelBuffers.get(channelId);
  if (!buf || buf.messages.length === 0) return;

  // Check if channel is blocked before processing buffered messages.
  // This guards against the case where a channel is blocked AFTER messages
  // were buffered but BEFORE evaluateNow runs.
  // Also captures guildId for the evaluation log below (avoiding a second fetch).
  const usedClient = evalClient || client;
  let cachedGuildId = null;
  try {
    const ch = await fetchChannelCached(usedClient, channelId);
    cachedGuildId = ch?.guildId ?? null;
    // Only check parentId for threads - for regular channels, parentId is the category ID
    const parentId = ch?.isThread?.() ? ch.parentId : null;
    if (isChannelBlocked(channelId, parentId, cachedGuildId)) {
      debug('evaluateNow skipping blocked channel with buffered messages', {
        channelId,
        guildId: cachedGuildId,
      });
      return;
    }
  } catch (err) {
    debug('Failed to fetch channel for blocked check, continuing', {
      channelId,
      error: err?.message,
    });
  }

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
    info('Triage evaluating', {
      guildId: cachedGuildId,
      channelId,
      buffered: buf.messages.length,
    });

    // Take a snapshot of the buffer for evaluation
    const snapshot = [...buf.messages];

    // Check if aborted before evaluation
    if (abortController.signal.aborted) {
      info('Triage evaluation aborted', { channelId });
      return;
    }

    await evaluateAndRespond(
      channelId,
      snapshot,
      evalConfig,
      evalClient || client,
      abortController.signal,
    );
  } catch (err) {
    // Both timeout and aborted are silent no-ops here. An abort is almost
    // always us cancelling a superseded run in the guard above; a timeout
    // was already warned once inside evaluateAndRespond. No need to log
    // it as an error or notify the channel.
    if (err instanceof AIClientError && (err.reason === 'timeout' || err.reason === 'aborted')) {
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
