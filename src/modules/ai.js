/**
 * AI Module
 * Handles AI chat functionality powered by Claude Agent SDK
 * Conversation history is persisted to PostgreSQL with in-memory cache
 */

import { AbortError, query } from '@anthropic-ai/claude-agent-sdk';
import { info, error as logError, warn as logWarn } from '../logger.js';
import { loadPrompt } from '../prompts/index.js';
import { getConfig } from './config.js';
import { buildMemoryContext, extractAndStoreMemories } from './memory.js';

// Conversation history per channel (in-memory cache)
let conversationHistory = new Map();

/** Default history length if not configured */
const DEFAULT_HISTORY_LENGTH = 20;

/** Default TTL in days for conversation cleanup */
const DEFAULT_HISTORY_TTL_DAYS = 30;

/** Cleanup interval: 6 hours in milliseconds */
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Reference to the cleanup interval timer */
let cleanupTimer = null;

/** In-flight async hydrations keyed by channel ID (dedupes concurrent DB reads) */
const pendingHydrations = new Map();

/**
 * Get the configured history length from config
 * @param {string} [guildId] - Guild ID for per-guild config
 * @returns {number} History length
 */
function getHistoryLength(guildId) {
  try {
    const config = getConfig(guildId);
    const len = config?.ai?.historyLength;
    if (typeof len === 'number' && len > 0) return len;
  } catch {
    // Config not loaded yet, use default
  }
  return DEFAULT_HISTORY_LENGTH;
}

/**
 * Get the configured TTL days from config
 * @param {string} [guildId] - Guild ID for per-guild config
 * @returns {number} TTL in days
 */
function getHistoryTTLDays(guildId) {
  try {
    const config = getConfig(guildId);
    const ttl = config?.ai?.historyTTLDays;
    if (typeof ttl === 'number' && ttl > 0) return ttl;
  } catch {
    // Config not loaded yet, use default
  }
  return DEFAULT_HISTORY_TTL_DAYS;
}

// Use a lazy-loaded pool getter to avoid import issues
let _getPoolFn = null;

/**
 * Set the pool getter function (for dependency injection / testing)
 * @param {Function} fn - Function that returns the pool or null
 */
export function _setPoolGetter(fn) {
  _getPoolFn = fn;
}

/**
 * Get the database pool safely
 * @returns {import('pg').Pool|null}
 */
function getPool() {
  if (_getPoolFn) return _getPoolFn();
  return _poolRef;
}

/** @type {import('pg').Pool|null} */
let _poolRef = null;

/**
 * Initialize the pool reference for the AI module
 * Called during startup after DB is initialized
 * @param {import('pg').Pool|null} pool
 */
export function setPool(pool) {
  _poolRef = pool;
}

/**
 * Get the full conversation history map (for state persistence)
 * @returns {Map} Conversation history map
 */
export function getConversationHistory() {
  return conversationHistory;
}

/**
 * Replace the in-memory conversation history with the provided map.
 *
 * Also clears any pending hydration promises to avoid stale in-flight hydrations.
 * @param {Map} history - Map from channelId (string) to an array of message objects representing each channel's history.
 */
export function setConversationHistory(history) {
  conversationHistory = history;
  pendingHydrations.clear();
}

/**
 * Approximate model pricing (USD per 1M tokens).
 * Used for dashboard-level cost estimation only.
 *
 * NOTE: This table requires manual updates when Anthropic releases new models.
 * Unknown models return $0 and log a warning (see logWarn in estimateAiCostUsd).
 * Pricing reference: https://www.anthropic.com/pricing
 */
const MODEL_PRICING_PER_MILLION = {
  'claude-opus-4-1-20250805': { input: 15, output: 75 },
  'claude-opus-4-20250514': { input: 15, output: 75 },
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
  // Haiku 4.5: $1/M input, $5/M output (https://www.anthropic.com/pricing)
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
  // Haiku 3.5: $0.80/M input, $4/M output (https://www.anthropic.com/pricing)
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4 },
};

/** Track models we've already warned about to avoid log flooding. */
const warnedUnknownModels = new Set();

/** Test-only helper to clear unknown-model warning dedupe state. */
export function _resetWarnedUnknownModels() {
  warnedUnknownModels.clear();
}

/**
 * Safely convert a value to a non-negative finite number.
 * @param {unknown} value
 * @returns {number}
 */
function toNonNegativeNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return 0;
  return num;
}

/**
 * Estimate request cost from token usage and model pricing.
 * Returns 0 when pricing for the model is unknown.
 *
 * @param {string} model
 * @param {number} promptTokens
 * @param {number} completionTokens
 * @returns {number}
 */
function estimateAiCostUsd(model, promptTokens, completionTokens) {
  const pricing = MODEL_PRICING_PER_MILLION[model];
  if (!pricing) {
    // Only warn once per unknown model to avoid log flooding
    if (!warnedUnknownModels.has(model)) {
      logWarn('Unknown model for cost estimation, returning $0', { model });
      warnedUnknownModels.add(model);
    }
    return 0;
  }

  const inputCost = (promptTokens / 1_000_000) * pricing.input;
  const outputCost = (completionTokens / 1_000_000) * pricing.output;

  // Keep precision stable in logs for easier DB aggregation
  return Number((inputCost + outputCost).toFixed(6));
}

/**
 * Hydrate conversation history for a channel from DB.
 * Dedupes concurrent hydrations and merges DB rows with in-flight in-memory writes.
 *
 * @param {string} channelId - Channel ID
 * @param {string} [guildId] - Guild ID for per-guild config
 * @returns {Promise<Array>} Conversation history
 */
function hydrateHistory(channelId, guildId) {
  const pending = pendingHydrations.get(channelId);
  if (pending) {
    return pending;
  }

  if (!conversationHistory.has(channelId)) {
    conversationHistory.set(channelId, []);
  }

  const historyRef = conversationHistory.get(channelId);
  const pool = getPool();
  if (!pool) {
    return Promise.resolve(historyRef);
  }

  const limit = getHistoryLength(guildId);
  const hydrationPromise = pool
    .query(
      `SELECT role, content FROM conversations
       WHERE channel_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [channelId, limit],
    )
    .then(({ rows }) => {
      if (rows.length > 0) {
        const dbHistory = rows.reverse().map((row) => ({
          role: row.role,
          content: row.content,
        }));

        // Merge DB history with any messages added while hydration was in-flight.
        const arr = conversationHistory.get(channelId) || historyRef;
        const merged = [...dbHistory, ...arr];

        // Mutate the existing array in-place so callers holding references
        // (e.g. getHistoryAsync callers) observe hydrated contents.
        arr.length = 0;
        arr.push(...merged.slice(-limit));

        info('Hydrated history from DB for channel', {
          channelId,
          count: dbHistory.length,
          merged: merged.length,
        });
      }

      return conversationHistory.get(channelId) || historyRef;
    })
    .catch((err) => {
      logWarn('Failed to load history from DB, using in-memory only', {
        channelId,
        error: err.message,
      });
      return conversationHistory.get(channelId) || historyRef;
    })
    .finally(() => {
      pendingHydrations.delete(channelId);
    });

  pendingHydrations.set(channelId, hydrationPromise);
  return hydrationPromise;
}

/**
 * Async version of history retrieval that waits for in-flight hydration.
 * @param {string} channelId - Channel ID
 * @param {string} [guildId] - Guild ID for per-guild config
 * @returns {Promise<Array>} Conversation history
 */
export async function getHistoryAsync(channelId, guildId) {
  if (conversationHistory.has(channelId)) {
    const pending = pendingHydrations.get(channelId);
    if (pending) {
      await pending;
    }
    return conversationHistory.get(channelId);
  }

  return hydrateHistory(channelId, guildId);
}

/**
 * Add message to conversation history
 * Writes to both in-memory cache and DB (write-through)
 * @param {string} channelId - Channel ID
 * @param {string} role - Message role (user/assistant)
 * @param {string} content - Message content
 * @param {string} [username] - Optional username
 * @param {string} [guildId] - Optional guild ID for scoping
 */
export function addToHistory(channelId, role, content, username, guildId) {
  if (!conversationHistory.has(channelId)) {
    conversationHistory.set(channelId, []);
  }
  const history = conversationHistory.get(channelId);
  history.push({ role, content });

  const maxHistory = getHistoryLength(guildId);

  // Trim old messages from in-memory cache
  while (history.length > maxHistory) {
    history.shift();
  }

  // Write-through to DB (fire-and-forget, don't block)
  const pool = getPool();
  if (pool) {
    pool
      .query(
        `INSERT INTO conversations (channel_id, role, content, username, guild_id)
       VALUES ($1, $2, $3, $4, $5)`,
        [channelId, role, content, username || null, guildId || null],
      )
      .catch((err) => {
        logError('Failed to persist message to DB', {
          channelId,
          role,
          username: username || null,
          error: err.message,
        });
      });
  }
}

/**
 * Initialize conversation history from DB on startup.
 * Loads last N messages per active channel.
 *
 * Note: Uses global config defaults for history length and TTL intentionally —
 * this runs at startup across all channels/guilds and guildId is not available.
 * The guild-aware config path is through generateResponse(), which passes guildId.
 *
 * @returns {Promise<void>}
 */
export async function initConversationHistory() {
  const pool = getPool();
  if (!pool) {
    info('No DB available, skipping conversation history hydration');
    return;
  }

  try {
    const limit = getHistoryLength();
    const ttl = getHistoryTTLDays();

    // Single query: fetch the last N messages per channel using ROW_NUMBER()
    // Limited to non-expired rows to avoid full table scans.
    const { rows } = await pool.query(
      `SELECT channel_id, role, content
       FROM (
         SELECT channel_id, role, content, created_at,
                ROW_NUMBER() OVER (PARTITION BY channel_id ORDER BY created_at DESC) AS rn
         FROM conversations
         WHERE created_at >= NOW() - INTERVAL '1 day' * $2
       ) sub
       WHERE rn <= $1
       ORDER BY channel_id, created_at ASC`,
      [limit, ttl],
    );

    // Group rows by channel_id
    const hydratedByChannel = new Map();

    for (const row of rows) {
      const channelId = row.channel_id;
      if (!hydratedByChannel.has(channelId)) {
        hydratedByChannel.set(channelId, []);
      }
      hydratedByChannel.get(channelId).push({
        role: row.role,
        content: row.content,
      });
    }

    // Replace channel histories with DB snapshots to avoid appending onto
    // file-loaded state (which causes duplicate growth across restarts).
    for (const [channelId, hydratedHistory] of hydratedByChannel.entries()) {
      if (!conversationHistory.has(channelId)) {
        conversationHistory.set(channelId, []);
      }
      const target = conversationHistory.get(channelId);
      target.length = 0;
      target.push(...hydratedHistory);
    }

    info('Conversation history hydrated from DB', {
      channels: hydratedByChannel.size,
      totalMessages: rows.length,
    });
  } catch (err) {
    logWarn('Failed to hydrate conversation history from DB', {
      error: err.message,
    });
  }
}

/**
 * Start periodic cleanup of old conversation messages
 * Deletes messages older than ai.historyTTLDays from the DB
 */
export function startConversationCleanup() {
  // Only run if we have a DB
  const pool = getPool();
  if (!pool) {
    info('No DB available, skipping conversation cleanup scheduler');
    return;
  }

  // Run cleanup immediately once, then on interval
  runCleanup();
  cleanupTimer = setInterval(runCleanup, CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();
  info('Conversation cleanup scheduler started', {
    intervalHours: CLEANUP_INTERVAL_MS / (60 * 60 * 1000),
  });
}

/**
 * Stop the periodic cleanup timer
 */
export function stopConversationCleanup() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
    info('Conversation cleanup scheduler stopped');
  }
}

/**
 * Delete conversation records older than the configured history TTL from the database.
 *
 * Note: Uses global config default for TTL intentionally — cleanup runs
 * across all guilds/channels and guildId is not available in this context.
 * The guild-aware config path is through generateResponse(), which passes guildId.
 *
 * If no database pool is configured this is a no-op; failures are logged but not thrown.
 * @returns {Promise<void>}
 */
async function runCleanup() {
  const pool = getPool();
  if (!pool) return;

  try {
    const ttlDays = getHistoryTTLDays();
    const result = await pool.query(
      `DELETE FROM conversations
       WHERE created_at < NOW() - INTERVAL '1 day' * $1`,
      [ttlDays],
    );

    if (result.rowCount > 0) {
      info('Cleaned up old conversation messages', {
        deleted: result.rowCount,
        ttlDays,
      });
    }
  } catch (err) {
    logWarn('Conversation cleanup failed', { error: err.message });
  }
}

/**
 * Generate an AI reply for a channel message using the Claude Agent SDK, integrating short-term history and optional user memory.
 *
 * Pre-response: may append a short, relevant memory context scoped to `userId` to the system prompt. Post-response: triggers asynchronous extraction and storage of memorable facts.
 *
 * @param {string} channelId - Conversation channel identifier.
 * @param {string} userMessage - The user's message text.
 * @param {string} username - Display name to attribute user messages in history.
 * @param {Object} [healthMonitor] - Optional health monitor; if provided, request/result status and counts will be recorded.
 * @param {string} [userId] - Optional user identifier used to scope memory lookups and post-response memory extraction.
 * @param {string} [guildId] - Discord guild ID for per-guild config and conversation scoping.
 * @param {Object} [options] - Optional SDK overrides.
 * @param {string} [options.model] - Model identifier to override the configured default.
 * @param {number} [options.maxThinkingTokens] - Override for the SDK's thinking-token budget.
 * @returns {Promise<string>} The assistant's reply text.
 */
export async function generateResponse(
  channelId,
  userMessage,
  username,
  healthMonitor = null,
  userId = null,
  guildId = null,
  { model, maxThinkingTokens } = {},
) {
  // Use guild-aware config for AI settings (systemPrompt, model, maxTokens)
  // so per-guild overrides via /config are respected.
  const guildConfig = getConfig(guildId);
  const history = await getHistoryAsync(channelId, guildId);

  let systemPrompt = guildConfig.ai?.systemPrompt || loadPrompt('default-personality');

  // Pre-response: inject user memory context into system prompt (with timeout)
  if (userId) {
    try {
      const memoryContext = await Promise.race([
        buildMemoryContext(userId, username, userMessage, guildId),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Memory context timeout')), 5000),
        ),
      ]);
      if (memoryContext) {
        systemPrompt += memoryContext;
      }
    } catch (err) {
      // Memory lookup failed or timed out — continue without it
      logWarn('Memory context lookup failed', { userId, error: err.message });
    }
  }

  // Build conversation context from history
  const historyText = history
    .map((msg) => (msg.role === 'user' ? msg.content : `Assistant: ${msg.content}`))
    .join('\n');
  const formattedPrompt = historyText
    ? `${historyText}\n${username}: ${userMessage}`
    : `${username}: ${userMessage}`;

  // Log incoming AI request
  info('AI request', { channelId, username, message: userMessage });

  // Resolve config values with legacy nested-format fallback.
  // The DB may still have old format: models: {default}, budget: {response}, timeouts: {response}
  const triageCfg = guildConfig.triage || {};
  const cfgModel =
    typeof triageCfg.model === 'string'
      ? triageCfg.model
      : (triageCfg.models?.default ?? 'claude-sonnet-4-5');
  const cfgBudget =
    typeof triageCfg.budget === 'number' ? triageCfg.budget : (triageCfg.budget?.response ?? 0.5);
  const cfgTimeout =
    typeof triageCfg.timeout === 'number'
      ? triageCfg.timeout
      : (triageCfg.timeouts?.response ?? 30000);

  const resolvedModel = model ?? cfgModel;
  const controller = new AbortController();
  const responseTimeout = cfgTimeout;
  const timeout = setTimeout(() => controller.abort(), responseTimeout);

  try {
    const generator = query({
      prompt: formattedPrompt,
      options: {
        model: resolvedModel,
        systemPrompt: systemPrompt,
        allowedTools: ['WebSearch'],
        maxBudgetUsd: cfgBudget,
        maxThinkingTokens: maxThinkingTokens ?? 1024,
        abortController: controller,
        stderr: (data) => logWarn('SDK stderr (ai)', { channelId, data }),
        // bypassPermissions is required for headless SDK usage (no interactive
        // permission prompts). Safety is enforced by the tightly scoped
        // allowedTools list above — only WebSearch is permitted.
        permissionMode: 'bypassPermissions',
      },
    });

    let result = null;
    for await (const message of generator) {
      if (message.type === 'result') {
        result = message;
      }
    }

    if (!result || result.is_error) {
      const errorMsg = result?.errors?.map((e) => e.message || e).join('; ') || 'Unknown SDK error';
      logError('SDK query error', { channelId, error: errorMsg, errors: result?.errors });
      if (healthMonitor) {
        healthMonitor.setAPIStatus('error');
      }
      return "Sorry, I'm having trouble thinking right now. Try again in a moment!";
    }

    const reply = result.result || 'I got nothing. Try again?';

    // Log AI response with cost
    info('AI response', {
      channelId,
      username,
      model: resolvedModel,
      total_cost_usd: result.total_cost_usd,
      duration_ms: result.duration_ms,
      response: reply.substring(0, 500),
    });

    // Record successful AI request
    if (healthMonitor) {
      healthMonitor.recordAIRequest();
      healthMonitor.setAPIStatus('ok');
    }

    // Update history with username for DB persistence
    addToHistory(channelId, 'user', `${username}: ${userMessage}`, username, guildId);
    addToHistory(channelId, 'assistant', reply, undefined, guildId);

    // Post-response: extract and store memorable facts (fire-and-forget)
    if (userId) {
      extractAndStoreMemories(userId, username, userMessage, reply, guildId).catch((err) => {
        logWarn('Memory extraction failed', { userId, error: err.message });
      });
    }

    return reply;
  } catch (err) {
    if (err instanceof AbortError) {
      info('AI response aborted', { channelId });
      return "Sorry, I'm having trouble thinking right now. Try again in a moment!";
    }
    logError('SDK query error', { error: err.message, stack: err.stack });
    if (healthMonitor) {
      healthMonitor.setAPIStatus('error');
    }
    return "Sorry, I'm having trouble thinking right now. Try again in a moment!";
  } finally {
    clearTimeout(timeout);
  }
}