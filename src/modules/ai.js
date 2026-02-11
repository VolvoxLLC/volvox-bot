/**
 * AI Module
 * Handles AI chat functionality powered by Claude via OpenClaw
 * Conversation history is persisted to PostgreSQL with in-memory cache
 */

import { info, error as logError, warn as logWarn } from '../logger.js';
import { getConfig } from './config.js';

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
 * @returns {number} History length
 */
function getHistoryLength() {
  try {
    const config = getConfig();
    const len = config?.ai?.historyLength;
    if (typeof len === 'number' && len > 0) return len;
  } catch {
    // Config not loaded yet, use default
  }
  return DEFAULT_HISTORY_LENGTH;
}

/**
 * Get the configured TTL days from config
 * @returns {number} TTL in days
 */
function getHistoryTTLDays() {
  try {
    const config = getConfig();
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
 * Set the conversation history map (for state restoration)
 * @param {Map} history - Conversation history map to restore
 */
export function setConversationHistory(history) {
  conversationHistory = history;
  pendingHydrations.clear();
}

// OpenClaw API endpoint/token (exported for shared use by other modules)
export const OPENCLAW_URL =
  process.env.OPENCLAW_API_URL ||
  process.env.OPENCLAW_URL ||
  'http://localhost:18789/v1/chat/completions';
export const OPENCLAW_TOKEN = process.env.OPENCLAW_API_KEY || process.env.OPENCLAW_TOKEN || '';

/**
 * Hydrate conversation history for a channel from DB.
 * Dedupes concurrent hydrations and merges DB rows with in-flight in-memory writes.
 * @param {string} channelId - Channel ID
 * @returns {Promise<Array>} Conversation history
 */
function hydrateHistory(channelId) {
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

  const limit = getHistoryLength();
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
 * @returns {Promise<Array>} Conversation history
 */
export async function getHistoryAsync(channelId) {
  if (conversationHistory.has(channelId)) {
    const pending = pendingHydrations.get(channelId);
    if (pending) {
      await pending;
    }
    return conversationHistory.get(channelId);
  }

  return hydrateHistory(channelId);
}

/**
 * Add message to conversation history
 * Writes to both in-memory cache and DB (write-through)
 * @param {string} channelId - Channel ID
 * @param {string} role - Message role (user/assistant)
 * @param {string} content - Message content
 * @param {string} [username] - Optional username
 */
export function addToHistory(channelId, role, content, username) {
  if (!conversationHistory.has(channelId)) {
    conversationHistory.set(channelId, []);
  }
  const history = conversationHistory.get(channelId);
  history.push({ role, content });

  const maxHistory = getHistoryLength();

  // Trim old messages from in-memory cache
  while (history.length > maxHistory) {
    history.shift();
  }

  // Write-through to DB (fire-and-forget, don't block)
  const pool = getPool();
  if (pool) {
    pool
      .query(
        `INSERT INTO conversations (channel_id, role, content, username)
       VALUES ($1, $2, $3, $4)`,
        [channelId, role, content, username || null],
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
 * Initialize conversation history from DB on startup
 * Loads last N messages per active channel
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
 * Run a single cleanup pass
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
 * Generate AI response using OpenClaw's chat completions endpoint
 * @param {string} channelId - Channel ID
 * @param {string} userMessage - User's message
 * @param {string} username - Username
 * @param {Object} config - Bot configuration
 * @param {Object} healthMonitor - Health monitor instance (optional)
 * @returns {Promise<string>} AI response
 */
export async function generateResponse(
  channelId,
  userMessage,
  username,
  config,
  healthMonitor = null,
) {
  const history = await getHistoryAsync(channelId);

  const systemPrompt =
    config.ai?.systemPrompt ||
    `You are Volvox Bot, a helpful and friendly Discord bot for the Volvox developer community.
You're witty, knowledgeable about programming and tech, and always eager to help.
Keep responses concise and Discord-friendly (under 2000 chars).
You can use Discord markdown formatting.`;

  // Build messages array for OpenAI-compatible API
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: `${username}: ${userMessage}` },
  ];

  // Log incoming AI request
  info('AI request', { channelId, username, message: userMessage });

  try {
    const response = await fetch(OPENCLAW_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(OPENCLAW_TOKEN && { Authorization: `Bearer ${OPENCLAW_TOKEN}` }),
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
    const reply = data.choices?.[0]?.message?.content || 'I got nothing. Try again?';

    // Log AI response
    info('AI response', { channelId, username, response: reply.substring(0, 500) });

    // Record successful AI request
    if (healthMonitor) {
      healthMonitor.recordAIRequest();
      healthMonitor.setAPIStatus('ok');
    }

    // Update history with username for DB persistence
    addToHistory(channelId, 'user', `${username}: ${userMessage}`, username);
    addToHistory(channelId, 'assistant', reply);

    return reply;
  } catch (err) {
    logError('OpenClaw API error', { error: err.message });
    if (healthMonitor) {
      healthMonitor.setAPIStatus('error');
    }
    return "Sorry, I'm having trouble thinking right now. Try again in a moment!";
  }
}
