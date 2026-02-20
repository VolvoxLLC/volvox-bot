/**
 * Gmail Hook Dedup Transform (V2 - Persistent)
 *
 * gog serve sends multiple hook calls per email (messagesAdded, labelsAdded, etc.)
 * each with different internal IDs. This transform deduplicates by hashing the
 * message content (from + subject + body prefix) within a TTL window.
 *
 * Uses a file-based cache to survive gateway restarts.
 */

import fs from 'fs';
import path from 'path';

const CACHE_FILE = '/tmp/openclaw-gmail-dedup.cache.json';
const TTL_MS = 60_000; // 60 seconds dedup window

function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      const now = Date.now();
      // Filter out stale entries on load
      return new Map(Object.entries(data).filter(([_, ts]) => now - ts < TTL_MS * 5));
    }
  } catch (e) {
    // Ignore errors
  }
  return new Map();
}

function saveCache(cache) {
  try {
    const obj = Object.fromEntries(cache);
    fs.writeFileSync(CACHE_FILE, JSON.stringify(obj));
  } catch (e) {
    // Ignore errors
  }
}

/**
 * @param {object} ctx - Hook context with payload, path, etc.
 * @returns {null|undefined} null = skip, undefined = proceed
 */
export default function gmailDedup(ctx) {
  const payload = ctx.payload;
  const messages = payload?.messages;

  // If no messages array or empty, skip entirely (label-only events)
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return null;
  }

  const msg = messages[0];

  // Skip empty messages (read/unread events with no content)
  if (!msg.from && !msg.subject && !msg.body) {
    return null;
  }

  // Build a dedup key from stable content fields
  const bodyPrefix = (msg.body || '').trim().slice(0, 150); // increased prefix
  const dedupKey = `${msg.from || ''}|${msg.subject || ''}|${bodyPrefix}`.replace(/\s+/g, ' ');

  const cache = loadCache();
  const now = Date.now();

  if (cache.has(dedupKey)) {
    const firstSeen = cache.get(dedupKey);
    if (now - firstSeen < TTL_MS) {
      // Duplicate within TTL window — skip
      return null;
    }
  }

  // First occurrence — record, save and proceed
  cache.set(dedupKey, now);
  saveCache(cache);
  return undefined;
}
