/**
 * Memory Module
 * Integrates mem0 for persistent user memory across conversations.
 *
 * Uses the official mem0ai SDK with the hosted platform (api.mem0.ai)
 * and graph memory enabled for entity relationship tracking.
 *
 * All operations are scoped per-user (Discord ID) and namespaced
 * with app_id="bills-bot" to isolate from other consumers.
 *
 * Graceful fallback: if mem0 is unavailable, all operations return
 * safe defaults (empty arrays / false) so the AI pipeline continues.
 *
 * **Privacy Notice:**
 * This module sends user messages to the mem0 hosted platform
 * (api.mem0.ai) for memory extraction and storage. By interacting
 * with the bot, users' messages may be processed and stored externally.
 * Users can view and delete their stored memories via the /memory command.
 * The /memory forget command allows users to clear all their data.
 */

import MemoryClient from 'mem0ai';
import { debug, info, warn as logWarn } from '../logger.js';
import { getConfig } from './config.js';
import { isOptedOut } from './optout.js';

/** App namespace — isolates memories from other mem0 consumers */
const APP_ID = 'bills-bot';

/** Default maximum memories to inject into context */
const DEFAULT_MAX_CONTEXT_MEMORIES = 5;

/** Cooldown period before retrying after a transient failure (ms) */
const RECOVERY_COOLDOWN_MS = 60_000;

/** HTTP status codes and error patterns for transient (retryable) errors */
const TRANSIENT_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
]);

/**
 * Determine whether an error is transient (temporary network/server issue)
 * or permanent (auth failure, bad request, etc.).
 *
 * Transient errors should NOT disable the memory system — they are expected
 * to resolve on their own (network blips, server restarts, 5xx errors).
 *
 * Permanent errors (401, 403, 422, other 4xx) indicate configuration issues
 * that won't self-resolve, so the system should be marked unavailable.
 *
 * @param {Error} err - The caught error
 * @returns {boolean} true if the error is transient and retryable
 */
function isTransientError(err) {
  // Network-level errors (no HTTP response)
  if (err.code && TRANSIENT_ERROR_CODES.has(err.code)) return true;

  // HTTP status-based classification
  const status = err.status || err.statusCode || err.response?.status;
  if (status) {
    // 5xx = server error (transient), 429 = rate limited (transient)
    if (status >= 500 || status === 429) return true;
    // 4xx = client error (permanent) — auth failures, bad requests
    if (status >= 400 && status < 500) return false;
  }

  // Common transient error message patterns
  const msg = (err.message || '').toLowerCase();
  if (
    msg.includes('timeout') ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset') ||
    msg.includes('network') ||
    msg.includes('socket hang up') ||
    msg.includes('fetch failed')
  ) {
    return true;
  }

  // Default: treat unknown errors as permanent (safer — triggers markUnavailable)
  return false;
}

/** Tracks whether mem0 is reachable (set by health check, cleared on errors) */
let mem0Available = false;

/** Timestamp (ms) when mem0 was last marked unavailable (0 = never) */
let mem0UnavailableSince = 0;

/** Singleton MemoryClient instance */
let client = null;

/**
 * Mark mem0 as unavailable with a cooldown for auto-recovery.
 * After RECOVERY_COOLDOWN_MS, the next request will be allowed through
 * to check if the service has recovered.
 */
export function markUnavailable() {
  mem0Available = false;
  mem0UnavailableSince = Date.now();
}

/**
 * Mark mem0 as available and clear the recovery cooldown.
 */
function markAvailable() {
  mem0Available = true;
  mem0UnavailableSince = 0;
}

/**
 * Get or create the mem0 client instance.
 * Returns null if the API key is not configured.
 * @returns {MemoryClient|null}
 */
function getClient() {
  if (client) return client;

  const apiKey = process.env.MEM0_API_KEY;
  if (!apiKey) return null;

  try {
    client = new MemoryClient({ apiKey });
    return client;
  } catch (err) {
    logWarn('Failed to create mem0 client', { error: err.message });
    return null;
  }
}

/**
 * Get memory config from bot config
 * @param {string} [guildId] - Guild ID for per-guild config
 * @returns {Object} Memory configuration with defaults applied
 */
export function getMemoryConfig(guildId) {
  try {
    const config = getConfig(guildId);
    return {
      enabled: config?.memory?.enabled ?? true,
      maxContextMemories: config?.memory?.maxContextMemories ?? DEFAULT_MAX_CONTEXT_MEMORIES,
      autoExtract: config?.memory?.autoExtract ?? true,
    };
  } catch {
    return {
      enabled: false,
      maxContextMemories: DEFAULT_MAX_CONTEXT_MEMORIES,
      autoExtract: false,
    };
  }
}

/**
 * Pure availability check — no side effects.
 * Returns true only if memory is both enabled in config and currently marked available.
 * Does NOT trigger auto-recovery. Use {@link checkAndRecoverMemory} when you want
 * the cooldown-based recovery logic.
 * @param {string} [guildId] - Guild ID for per-guild config
 * @returns {boolean}
 */
export function isMemoryAvailable(guildId) {
  const memConfig = getMemoryConfig(guildId);
  if (!memConfig.enabled) return false;
  return mem0Available;
}

/**
 * Check if memory feature is enabled and mem0 is available, with auto-recovery.
 * If mem0 was marked unavailable due to a transient error and the cooldown period
 * has elapsed, this will tentatively re-enable it so the next request can check
 * if the service has recovered.
 *
 * Use this instead of {@link isMemoryAvailable} when you want the recovery side effect.
 * @param {string} [guildId] - Guild ID for per-guild config
 * @returns {boolean}
 */
export function checkAndRecoverMemory(guildId) {
  const memConfig = getMemoryConfig(guildId);
  if (!memConfig.enabled) return false;

  if (mem0Available) return true;

  // Auto-recovery: if cooldown has elapsed, tentatively re-enable
  if (mem0UnavailableSince > 0 && Date.now() - mem0UnavailableSince >= RECOVERY_COOLDOWN_MS) {
    info('mem0 cooldown expired, attempting auto-recovery');
    markAvailable();
    return true;
  }

  return false;
}

/**
 * Set the mem0 availability flag (for testing / health checks).
 *
 * **Asymmetric behavior by design:**
 * - Setting `true` calls {@link markAvailable}, clearing any cooldown state.
 * - Setting `false` performs a **hard disable** — sets mem0Available to false
 *   and resets the cooldown timestamp to 0 — but does NOT trigger the recovery
 *   cooldown (unlike {@link markUnavailable} which records a timestamp so
 *   auto-recovery can kick in after RECOVERY_COOLDOWN_MS).
 *
 * This is intentional: _setMem0Available is a test/health-check helper that
 * needs to instantly toggle state without side effects from cooldown timers.
 * Production error paths use markUnavailable() instead, which enables the
 * timed auto-recovery flow.
 *
 * @param {boolean} available
 */
export function _setMem0Available(available) {
  if (available) {
    markAvailable();
  } else {
    mem0Available = false;
    mem0UnavailableSince = 0;
  }
}

/**
 * Get the recovery cooldown duration in ms (exported for testing)
 * @returns {number}
 */
export function _getRecoveryCooldownMs() {
  return RECOVERY_COOLDOWN_MS;
}

/**
 * Expose isTransientError for testing (prefixed with _ to indicate internal)
 * @param {Error} err
 * @returns {boolean}
 */
export function _isTransientError(err) {
  return isTransientError(err);
}

/**
 * Set the mem0 client instance (for testing)
 * @param {object|null} newClient
 */
export function _setClient(newClient) {
  client = newClient;
}

/**
 * Run a health check against the mem0 platform on startup.
 * Intentionally uses getMemoryConfig() without guildId — this is a startup
 * health check that verifies global mem0 connectivity, not guild-specific config.
 * Verifies the API key is configured and the SDK client can actually
 * communicate with the hosted platform by performing a lightweight search.
 * @param {object} [options]
 * @param {AbortSignal} [options.signal] - When aborted, prevents a late-resolving
 *   check from calling {@link markAvailable} (guards against race with startup timeout).
 * @returns {Promise<boolean>} true if mem0 is ready
 */
export async function checkMem0Health({ signal } = {}) {
  const memConfig = getMemoryConfig();
  if (!memConfig.enabled) {
    info('Memory module disabled via config');
    markUnavailable();
    return false;
  }

  const apiKey = process.env.MEM0_API_KEY;
  if (!apiKey) {
    logWarn('MEM0_API_KEY not set — memory features disabled');
    markUnavailable();
    return false;
  }

  try {
    const c = getClient();
    if (!c) {
      markUnavailable();
      return false;
    }

    // Verify SDK connectivity with a lightweight search against the platform
    await c.search('health-check', {
      user_id: '__health_check__',
      app_id: APP_ID,
      limit: 1,
    });

    // Guard against late resolution after a startup timeout has already
    // called markUnavailable().  If the caller's AbortSignal has fired,
    // the timeout won the race and we must not flip availability back on.
    if (signal?.aborted) return false;

    markAvailable();
    info('mem0 health check passed (SDK connectivity verified)');
    return true;
  } catch (err) {
    logWarn('mem0 health check failed', { error: err.message });
    markUnavailable();
    return false;
  }
}

/**
 * Add a memory for a user.
 * Graph memory is enabled to automatically build entity relationships.
 *
 * Part of the public API — used by extractAndStoreMemories internally and
 * exported for direct use by other modules/plugins that need to store
 * specific memories programmatically.
 *
 * @param {string} userId - Discord user ID
 * @param {string} text - The memory text to store
 * @param {Object} [metadata] - Optional metadata
 * @param {string} [guildId] - Guild ID for per-guild config
 * @returns {Promise<boolean>} true if stored successfully
 */
export async function addMemory(userId, text, metadata = {}, guildId) {
  if (!checkAndRecoverMemory(guildId)) return false;

  try {
    const c = getClient();
    if (!c) return false;

    const messages = [{ role: 'user', content: text }];
    const result = await c.add(messages, {
      user_id: userId,
      app_id: APP_ID,
      metadata,
      enable_graph: true,
    });

    const entries = Array.isArray(result) ? result : (result?.results || []);
    const stored = entries.filter(m => m.event === 'ADD' || m.event === 'UPDATE');
    debug('Memory added', {
      userId,
      textPreview: text.substring(0, 100),
      memoriesReturned: entries.length,
      memoriesStored: stored.length,
      events: entries.map(m => m.event).filter(Boolean),
    });
    return stored.length > 0 || (entries.length > 0 && !entries.some(m => m.event));
  } catch (err) {
    logWarn('Failed to add memory', { userId, error: err.message });
    if (!isTransientError(err)) markUnavailable();
    return false;
  }
}

/**
 * Search memories relevant to a query for a given user.
 * Returns both regular memory results and graph relations.
 * @param {string} userId - Discord user ID
 * @param {string} query - Search query
 * @param {number} [limit] - Max results (defaults to config maxContextMemories)
 * @param {string} [guildId] - Guild ID for per-guild config
 * @returns {Promise<{memories: Array<{memory: string, score?: number}>, relations: Array}>}
 */
export async function searchMemories(userId, query, limit, guildId) {
  if (!checkAndRecoverMemory(guildId)) return { memories: [], relations: [] };

  const memConfig = getMemoryConfig(guildId);
  const maxResults = limit ?? memConfig.maxContextMemories;

  try {
    const c = getClient();
    if (!c) return { memories: [], relations: [] };

    const result = await c.search(query, {
      user_id: userId,
      app_id: APP_ID,
      limit: maxResults,
      enable_graph: true,
    });

    // SDK returns { results: [...], relations: [...] } with graph enabled
    const rawMemories = Array.isArray(result) ? result : result?.results || [];
    const relations = result?.relations || [];

    const memories = rawMemories.map((m) => ({
      id: m.id ?? '',
      memory: m.memory || m.text || m.content || '',
      score: m.score ?? null,
    }));

    return { memories, relations };
  } catch (err) {
    logWarn('Failed to search memories', { userId, error: err.message });
    if (!isTransientError(err)) markUnavailable();
    return { memories: [], relations: [] };
  }
}

/**
 * Get all memories for a user.
 * @param {string} userId - Discord user ID
 * @param {string} [guildId] - Guild ID for per-guild config
 * @returns {Promise<Array<{id: string, memory: string}>>} All user memories
 */
export async function getMemories(userId, guildId) {
  if (!checkAndRecoverMemory(guildId)) return [];

  try {
    const c = getClient();
    if (!c) return [];

    const result = await c.getAll({
      user_id: userId,
      app_id: APP_ID,
      enable_graph: true,
    });

    const memories = Array.isArray(result) ? result : result?.results || [];

    return memories.map((m) => ({
      id: m.id ?? '',
      memory: m.memory || m.text || m.content || '',
    }));
  } catch (err) {
    logWarn('Failed to get memories', { userId, error: err.message });
    if (!isTransientError(err)) markUnavailable();
    return [];
  }
}

/**
 * Delete all memories for a user.
 * @param {string} userId - Discord user ID
 * @param {string} [guildId] - Guild ID for per-guild config
 * @returns {Promise<boolean>} true if deleted successfully
 */
export async function deleteAllMemories(userId, guildId) {
  if (!checkAndRecoverMemory(guildId)) return false;

  try {
    const c = getClient();
    if (!c) return false;

    await c.deleteAll({ user_id: userId, app_id: APP_ID });
    info('All memories deleted for user', { userId });
    return true;
  } catch (err) {
    logWarn('Failed to delete all memories', { userId, error: err.message });
    if (!isTransientError(err)) markUnavailable();
    return false;
  }
}

/**
 * Delete a specific memory by ID.
 * @param {string} memoryId - Memory ID to delete
 * @param {string} [guildId] - Guild ID for per-guild config
 * @returns {Promise<boolean>} true if deleted successfully
 */
export async function deleteMemory(memoryId, guildId) {
  if (!checkAndRecoverMemory(guildId)) return false;

  try {
    const c = getClient();
    if (!c) return false;

    await c.delete(memoryId);
    debug('Memory deleted', { memoryId });
    return true;
  } catch (err) {
    logWarn('Failed to delete memory', { memoryId, error: err.message });
    if (!isTransientError(err)) markUnavailable();
    return false;
  }
}

/**
 * Format graph relations into a readable context string.
 * @param {Array<{source: string, source_type: string, relationship: string, target: string, target_type: string}>} relations
 * @returns {string} Formatted relations string or empty string
 */
export function formatRelations(relations) {
  if (!relations || relations.length === 0) return '';

  const lines = relations
    .filter((r) => r.source && r.relationship && r.target)
    .map((r) => `- ${r.source} → ${r.relationship} → ${r.target}`);

  if (lines.length === 0) return '';

  return `\nRelationships:\n${lines.join('\n')}`;
}

/** Maximum characters for memory context injected into system prompt */
const MAX_MEMORY_CONTEXT_CHARS = 2000;

/**
 * Build a context string from user memories to inject into the system prompt.
 * Includes both regular memories and graph relations for richer context.
 * Enforces a character budget to prevent oversized system prompts.
 * @param {string} userId - Discord user ID
 * @param {string} username - Display name
 * @param {string} query - The user's current message (for relevance search)
 * @param {string} [guildId] - Guild ID for per-guild config
 * @returns {Promise<string>} Context string or empty string
 */
export async function buildMemoryContext(userId, username, query, guildId) {
  if (!checkAndRecoverMemory(guildId)) return '';
  if (isOptedOut(userId)) return '';

  const { memories, relations } = await searchMemories(userId, query, undefined, guildId);

  if (memories.length === 0 && (!relations || relations.length === 0)) return '';

  let context = '';

  if (memories.length > 0) {
    const memoryLines = memories.map((m) => `- ${m.memory}`).join('\n');
    context += `\n\nWhat you know about ${username}:\n${memoryLines}`;
  }

  const relationsContext = formatRelations(relations);
  if (relationsContext) {
    context += relationsContext;
  }

  // Enforce character budget to prevent oversized system prompts
  if (context.length > MAX_MEMORY_CONTEXT_CHARS) {
    context = `${context.substring(0, MAX_MEMORY_CONTEXT_CHARS)}...`;
  }

  return context;
}

/**
 * Analyze a conversation exchange and extract memorable facts to store.
 * Uses mem0's AI to identify new personal info worth remembering.
 * Graph memory is enabled to automatically build entity relationships.
 * @param {string} userId - Discord user ID
 * @param {string} username - Display name
 * @param {string} userMessage - What the user said
 * @param {string} assistantReply - What the bot replied
 * @param {string} [guildId] - Guild ID for per-guild config
 * @returns {Promise<boolean>} true if any memories were stored
 */
export async function extractAndStoreMemories(
  userId,
  username,
  userMessage,
  assistantReply,
  guildId,
) {
  if (!checkAndRecoverMemory(guildId)) return false;
  if (isOptedOut(userId)) return false;

  const memConfig = getMemoryConfig(guildId);
  if (!memConfig.autoExtract) return false;

  try {
    const c = getClient();
    if (!c) return false;

    const messages = [
      { role: 'user', content: userMessage },
      { role: 'assistant', content: assistantReply },
    ];

    const result = await c.add(messages, {
      user_id: userId,
      app_id: APP_ID,
      metadata: { username },
      enable_graph: true,
    });

    const entries = Array.isArray(result) ? result : (result?.results || []);
    const stored = entries.filter(m => m.event === 'ADD' || m.event === 'UPDATE');
    debug('Memory extraction completed', {
      userId,
      username,
      messagePreview: userMessage.substring(0, 80),
      memoriesReturned: entries.length,
      memoriesStored: stored.length,
      events: entries.map(m => m.event).filter(Boolean),
    });
    return stored.length > 0 || (entries.length > 0 && !entries.some(m => m.event));
  } catch (err) {
    // Only log — do NOT call markUnavailable() here.
    // This runs fire-and-forget in the background; a failure for one user's
    // extraction should not disable the memory system for all other users.
    logWarn('Memory extraction failed', { userId, error: err.message });
    return false;
  }
}
