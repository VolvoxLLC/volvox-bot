/**
 * Memory Module
 * Integrates mem0 for persistent user memory across conversations.
 *
 * Uses the mem0 REST API to store/search/retrieve user facts.
 * All operations are scoped per-user (Discord ID) and namespaced
 * with app_id="bills-bot" to isolate from other consumers.
 *
 * Graceful fallback: if mem0 is unavailable, all operations return
 * safe defaults (empty arrays / false) so the AI pipeline continues.
 */

import { debug, info, warn as logWarn } from '../logger.js';
import { getConfig } from './config.js';

/** Default mem0 API base URL */
const DEFAULT_MEM0_URL = 'http://localhost:8080';

/** App namespace — isolates memories from other mem0 consumers */
const APP_ID = 'bills-bot';

/** Default maximum memories to inject into context */
const DEFAULT_MAX_CONTEXT_MEMORIES = 5;

/** HTTP request timeout in ms */
const REQUEST_TIMEOUT_MS = 5000;

/** Tracks whether mem0 is reachable (set by health check, cleared on errors) */
let mem0Available = false;

/**
 * Get the mem0 base URL from environment
 * @returns {string} Base URL (no trailing slash)
 */
export function getMem0Url() {
  const url = process.env.MEM0_API_URL || DEFAULT_MEM0_URL;
  return url.replace(/\/+$/, '');
}

/**
 * Get memory config from bot config
 * @returns {Object} Memory configuration with defaults applied
 */
export function getMemoryConfig() {
  try {
    const config = getConfig();
    return {
      enabled: config?.memory?.enabled ?? true,
      maxContextMemories: config?.memory?.maxContextMemories ?? DEFAULT_MAX_CONTEXT_MEMORIES,
      autoExtract: config?.memory?.autoExtract ?? true,
      extractModel: config?.memory?.extractModel ?? null,
    };
  } catch {
    return {
      enabled: true,
      maxContextMemories: DEFAULT_MAX_CONTEXT_MEMORIES,
      autoExtract: true,
      extractModel: null,
    };
  }
}

/**
 * Check if memory feature is enabled and mem0 is available
 * @returns {boolean}
 */
export function isMemoryAvailable() {
  const memConfig = getMemoryConfig();
  return memConfig.enabled && mem0Available;
}

/**
 * Set the mem0 availability flag (for testing / health checks)
 * @param {boolean} available
 */
export function _setMem0Available(available) {
  mem0Available = available;
}

/**
 * Internal fetch wrapper with timeout and error handling.
 * Returns null on failure instead of throwing.
 * @param {string} path - API path (e.g. "/v1/memories/")
 * @param {Object} options - Fetch options
 * @returns {Promise<Object|null>} Parsed JSON response or null
 */
async function mem0Fetch(path, options = {}) {
  const baseUrl = getMem0Url();
  const url = `${baseUrl}${path}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      logWarn('mem0 API error', {
        path,
        status: response.status,
        statusText: response.statusText,
      });
      return null;
    }

    const data = await response.json();
    return data;
  } catch (err) {
    if (err.name === 'AbortError') {
      logWarn('mem0 request timed out', { path });
    } else {
      debug('mem0 request failed', { path, error: err.message });
    }
    // Mark as unavailable on network errors so subsequent calls skip faster
    mem0Available = false;
    return null;
  }
}

/**
 * Run a health check against the mem0 API on startup.
 * Sets the availability flag accordingly.
 * @returns {Promise<boolean>} true if mem0 is reachable
 */
export async function checkMem0Health() {
  const memConfig = getMemoryConfig();
  if (!memConfig.enabled) {
    info('Memory module disabled via config');
    mem0Available = false;
    return false;
  }

  const baseUrl = getMem0Url();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(`${baseUrl}/v1/memories/`, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
    });

    clearTimeout(timeout);

    if (response.ok || response.status === 404) {
      // 404 is acceptable — some mem0 deployments return 404 on GET /v1/memories/ with no params
      mem0Available = true;
      info('mem0 health check passed', { url: baseUrl });
      return true;
    }

    logWarn('mem0 health check failed', { status: response.status });
    mem0Available = false;
    return false;
  } catch (err) {
    logWarn('mem0 unreachable — memory features disabled', {
      url: baseUrl,
      error: err.message,
    });
    mem0Available = false;
    return false;
  }
}

/**
 * Add a memory for a user.
 * @param {string} userId - Discord user ID
 * @param {string} text - The memory text to store
 * @param {Object} [metadata] - Optional metadata
 * @returns {Promise<boolean>} true if stored successfully
 */
export async function addMemory(userId, text, metadata = {}) {
  if (!isMemoryAvailable()) return false;

  const body = {
    messages: [{ role: 'user', content: text }],
    user_id: userId,
    app_id: APP_ID,
    metadata,
  };

  const result = await mem0Fetch('/v1/memories/', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (result) {
    debug('Memory added', { userId, textPreview: text.substring(0, 100) });
    return true;
  }

  return false;
}

/**
 * Search memories relevant to a query for a given user.
 * @param {string} userId - Discord user ID
 * @param {string} query - Search query
 * @param {number} [limit] - Max results (defaults to config maxContextMemories)
 * @returns {Promise<Array<{memory: string, score?: number}>>} Matching memories
 */
export async function searchMemories(userId, query, limit) {
  if (!isMemoryAvailable()) return [];

  const memConfig = getMemoryConfig();
  const maxResults = limit ?? memConfig.maxContextMemories;

  const body = {
    query,
    user_id: userId,
    app_id: APP_ID,
    limit: maxResults,
  };

  const result = await mem0Fetch('/v1/memories/search/', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!result) return [];

  // mem0 returns { results: [...] } or an array directly depending on version
  const memories = Array.isArray(result) ? result : result.results || [];

  return memories.map((m) => ({
    memory: m.memory || m.text || m.content || '',
    score: m.score ?? null,
  }));
}

/**
 * Get all memories for a user.
 * @param {string} userId - Discord user ID
 * @returns {Promise<Array<{id: string, memory: string}>>} All user memories
 */
export async function getMemories(userId) {
  if (!isMemoryAvailable()) return [];

  const result = await mem0Fetch(
    `/v1/memories/?user_id=${encodeURIComponent(userId)}&app_id=${encodeURIComponent(APP_ID)}`,
    {
      method: 'GET',
    },
  );

  if (!result) return [];

  // mem0 returns { results: [...] } or array
  const memories = Array.isArray(result) ? result : result.results || [];

  return memories.map((m) => ({
    id: m.id || '',
    memory: m.memory || m.text || m.content || '',
  }));
}

/**
 * Delete all memories for a user.
 * @param {string} userId - Discord user ID
 * @returns {Promise<boolean>} true if deleted successfully
 */
export async function deleteAllMemories(userId) {
  if (!isMemoryAvailable()) return false;

  const result = await mem0Fetch(
    `/v1/memories/?user_id=${encodeURIComponent(userId)}&app_id=${encodeURIComponent(APP_ID)}`,
    {
      method: 'DELETE',
    },
  );

  if (result !== null) {
    info('All memories deleted for user', { userId });
    return true;
  }

  return false;
}

/**
 * Delete a specific memory by ID.
 * @param {string} memoryId - Memory ID to delete
 * @returns {Promise<boolean>} true if deleted successfully
 */
export async function deleteMemory(memoryId) {
  if (!isMemoryAvailable()) return false;

  const result = await mem0Fetch(`/v1/memories/${encodeURIComponent(memoryId)}/`, {
    method: 'DELETE',
  });

  if (result !== null) {
    debug('Memory deleted', { memoryId });
    return true;
  }

  return false;
}

/**
 * Build a context string from user memories to inject into the system prompt.
 * @param {string} userId - Discord user ID
 * @param {string} username - Display name
 * @param {string} query - The user's current message (for relevance search)
 * @returns {Promise<string>} Context string or empty string
 */
export async function buildMemoryContext(userId, username, query) {
  if (!isMemoryAvailable()) return '';

  const memories = await searchMemories(userId, query);

  if (memories.length === 0) return '';

  const memoryLines = memories.map((m) => `- ${m.memory}`).join('\n');

  return `\n\nWhat you know about ${username}:\n${memoryLines}`;
}

/**
 * Analyze a conversation exchange and extract memorable facts to store.
 * Uses the AI to identify new personal info worth remembering.
 * @param {string} userId - Discord user ID
 * @param {string} username - Display name
 * @param {string} userMessage - What the user said
 * @param {string} assistantReply - What the bot replied
 * @returns {Promise<boolean>} true if any memories were stored
 */
export async function extractAndStoreMemories(userId, username, userMessage, assistantReply) {
  if (!isMemoryAvailable()) return false;

  const memConfig = getMemoryConfig();
  if (!memConfig.autoExtract) return false;

  const body = {
    messages: [
      { role: 'user', content: `${username}: ${userMessage}` },
      { role: 'assistant', content: assistantReply },
    ],
    user_id: userId,
    app_id: APP_ID,
  };

  const result = await mem0Fetch('/v1/memories/', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (result) {
    debug('Memory extraction completed', {
      userId,
      username,
      messagePreview: userMessage.substring(0, 80),
    });
    return true;
  }

  return false;
}
