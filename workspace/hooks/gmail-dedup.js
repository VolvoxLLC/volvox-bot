/**
 * Gmail Hook Dedup Transform
 *
 * gog serve sends multiple hook calls per email (messagesAdded, labelsAdded, etc.)
 * each with different internal IDs. This transform deduplicates by hashing the
 * message content (from + subject) within a TTL window.
 *
 * Returns null to skip duplicate hooks, undefined to proceed.
 */

const seen = new Map(); // key -> timestamp
const TTL_MS = 60_000; // 60 seconds dedup window
const CLEANUP_INTERVAL_MS = 300_000; // cleanup every 5 min

// Periodic cleanup of stale entries
setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of seen) {
    if (now - ts > TTL_MS * 2) seen.delete(key);
  }
}, CLEANUP_INTERVAL_MS).unref?.();

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
  // Using from + subject + first 100 chars of body as fingerprint
  const bodyPrefix = (msg.body || '').slice(0, 100);
  const dedupKey = `${msg.from || ''}|${msg.subject || ''}|${bodyPrefix}`;

  const now = Date.now();

  if (seen.has(dedupKey)) {
    const firstSeen = seen.get(dedupKey);
    if (now - firstSeen < TTL_MS) {
      // Duplicate within TTL window — skip
      return null;
    }
  }

  // First occurrence — record and proceed
  seen.set(dedupKey, now);
  return undefined;
}
