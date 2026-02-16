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
 */

import MemoryClient from 'mem0ai';
import { debug, info, warn as logWarn } from '../logger.js';
import { getConfig } from './config.js';

/** App namespace — isolates memories from other mem0 consumers */
const APP_ID = 'bills-bot';

/** Default maximum memories to inject into context */
const DEFAULT_MAX_CONTEXT_MEMORIES = 5;

/** Tracks whether mem0 is reachable (set by health check, cleared on errors) */
let mem0Available = false;

/** Singleton MemoryClient instance */
let client = null;

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
 * Set the mem0 client instance (for testing)
 * @param {object|null} newClient
 */
export function _setClient(newClient) {
  client = newClient;
}

/**
 * Run a health check against the mem0 platform on startup.
 * Verifies the API key is configured and the SDK client can be created.
 * @returns {Promise<boolean>} true if mem0 is ready
 */
export async function checkMem0Health() {
  const memConfig = getMemoryConfig();
  if (!memConfig.enabled) {
    info('Memory module disabled via config');
    mem0Available = false;
    return false;
  }

  const apiKey = process.env.MEM0_API_KEY;
  if (!apiKey) {
    logWarn('MEM0_API_KEY not set — memory features disabled');
    mem0Available = false;
    return false;
  }

  try {
    const c = getClient();
    if (!c) {
      mem0Available = false;
      return false;
    }

    mem0Available = true;
    info('mem0 health check passed (API key configured, SDK client initialized)');
    return true;
  } catch (err) {
    logWarn('mem0 health check failed', { error: err.message });
    mem0Available = false;
    return false;
  }
}

/**
 * Add a memory for a user.
 * Graph memory is enabled to automatically build entity relationships.
 * @param {string} userId - Discord user ID
 * @param {string} text - The memory text to store
 * @param {Object} [metadata] - Optional metadata
 * @returns {Promise<boolean>} true if stored successfully
 */
export async function addMemory(userId, text, metadata = {}) {
  if (!isMemoryAvailable()) return false;

  try {
    const c = getClient();
    if (!c) return false;

    const messages = [{ role: 'user', content: text }];
    await c.add(messages, {
      user_id: userId,
      app_id: APP_ID,
      metadata,
      enable_graph: true,
    });

    debug('Memory added', { userId, textPreview: text.substring(0, 100) });
    return true;
  } catch (err) {
    logWarn('Failed to add memory', { userId, error: err.message });
    mem0Available = false;
    return false;
  }
}

/**
 * Search memories relevant to a query for a given user.
 * Returns both regular memory results and graph relations.
 * @param {string} userId - Discord user ID
 * @param {string} query - Search query
 * @param {number} [limit] - Max results (defaults to config maxContextMemories)
 * @returns {Promise<{memories: Array<{memory: string, score?: number}>, relations: Array}>}
 */
export async function searchMemories(userId, query, limit) {
  if (!isMemoryAvailable()) return { memories: [], relations: [] };

  const memConfig = getMemoryConfig();
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
      id: m.id || '',
      memory: m.memory || m.text || m.content || '',
      score: m.score ?? null,
    }));

    return { memories, relations };
  } catch (err) {
    logWarn('Failed to search memories', { userId, error: err.message });
    mem0Available = false;
    return { memories: [], relations: [] };
  }
}

/**
 * Get all memories for a user.
 * @param {string} userId - Discord user ID
 * @returns {Promise<Array<{id: string, memory: string}>>} All user memories
 */
export async function getMemories(userId) {
  if (!isMemoryAvailable()) return [];

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
      id: m.id || '',
      memory: m.memory || m.text || m.content || '',
    }));
  } catch (err) {
    logWarn('Failed to get memories', { userId, error: err.message });
    mem0Available = false;
    return [];
  }
}

/**
 * Delete all memories for a user.
 * @param {string} userId - Discord user ID
 * @returns {Promise<boolean>} true if deleted successfully
 */
export async function deleteAllMemories(userId) {
  if (!isMemoryAvailable()) return false;

  try {
    const c = getClient();
    if (!c) return false;

    await c.deleteAll({ user_id: userId, app_id: APP_ID });
    info('All memories deleted for user', { userId });
    return true;
  } catch (err) {
    logWarn('Failed to delete all memories', { userId, error: err.message });
    return false;
  }
}

/**
 * Delete a specific memory by ID.
 * @param {string} memoryId - Memory ID to delete
 * @returns {Promise<boolean>} true if deleted successfully
 */
export async function deleteMemory(memoryId) {
  if (!isMemoryAvailable()) return false;

  try {
    const c = getClient();
    if (!c) return false;

    await c.delete(memoryId);
    debug('Memory deleted', { memoryId });
    return true;
  } catch (err) {
    logWarn('Failed to delete memory', { memoryId, error: err.message });
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

  const lines = relations.map((r) => `- ${r.source} → ${r.relationship} → ${r.target}`);

  return `\nRelationships:\n${lines.join('\n')}`;
}

/**
 * Build a context string from user memories to inject into the system prompt.
 * Includes both regular memories and graph relations for richer context.
 * @param {string} userId - Discord user ID
 * @param {string} username - Display name
 * @param {string} query - The user's current message (for relevance search)
 * @returns {Promise<string>} Context string or empty string
 */
export async function buildMemoryContext(userId, username, query) {
  if (!isMemoryAvailable()) return '';

  const { memories, relations } = await searchMemories(userId, query);

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
 * @returns {Promise<boolean>} true if any memories were stored
 */
export async function extractAndStoreMemories(userId, username, userMessage, assistantReply) {
  if (!isMemoryAvailable()) return false;

  const memConfig = getMemoryConfig();
  if (!memConfig.autoExtract) return false;

  try {
    const c = getClient();
    if (!c) return false;

    const messages = [
      { role: 'user', content: `${username}: ${userMessage}` },
      { role: 'assistant', content: assistantReply },
    ];

    await c.add(messages, {
      user_id: userId,
      app_id: APP_ID,
      enable_graph: true,
    });

    debug('Memory extraction completed', {
      userId,
      username,
      messagePreview: userMessage.substring(0, 80),
    });
    return true;
  } catch (err) {
    logWarn('Memory extraction failed', { userId, error: err.message });
    mem0Available = false;
    return false;
  }
}
