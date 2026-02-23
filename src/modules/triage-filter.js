/**
 * Triage Filtering
 * Text sanitization, trigger word detection, moderation keyword matching,
 * and message ID resolution.
 */

import { isSpam } from './spam.js';

// ── Text sanitization ────────────────────────────────────────────────────────

/**
 * Strip lone Unicode surrogates from a string, replacing them with U+FFFD.
 * Discord messages can contain broken surrogates (truncated emoji, malformed
 * Unicode from mobile clients) that produce invalid JSON when serialized,
 * causing the Anthropic API to reject the request with a 400 error.
 * @param {string} str - Input string (may be null/undefined)
 * @returns {string} Sanitized string with lone surrogates replaced
 */
export function sanitizeText(str) {
  if (!str) return str;
  return str.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    '\uFFFD',
  );
}

// ── Trigger word detection ───────────────────────────────────────────────────

/**
 * Detects whether text matches spam heuristics or any configured moderation keywords.
 * @param {string} content - Message text to inspect.
 * @param {Object} config - Bot configuration; uses `config.triage.moderationKeywords` if present.
 * @returns {boolean} `true` if the content matches spam patterns or contains a configured moderation keyword, `false` otherwise.
 */
export function isModerationKeyword(content, config) {
  if (isSpam(content)) return true;

  const keywords = config.triage?.moderationKeywords || [];
  if (keywords.length === 0) return false;

  const lower = content.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

/**
 * Determine whether the message content contains any configured trigger or moderation keywords.
 * @param {string} content - Message text to examine.
 * @param {Object} config - Bot configuration containing triage.triggerWords and moderation keywords.
 * @returns {boolean} `true` if any configured trigger word or moderation keyword is present, `false` otherwise.
 */
export function checkTriggerWords(content, config) {
  const triageConfig = config.triage || {};
  const triggerWords = triageConfig.triggerWords || [];

  if (triggerWords.length > 0) {
    const lower = content.toLowerCase();
    if (triggerWords.some((tw) => lower.includes(tw.toLowerCase()))) {
      return true;
    }
  }

  if (isModerationKeyword(content, config)) return true;

  return false;
}

// ── Message ID resolution ────────────────────────────────────────────────────

/**
 * Resolve a targetMessageId to a valid message ID from the buffer snapshot.
 * Returns the validated ID, or falls back to the last message from the target user,
 * or the last message in the buffer.
 * @param {string} targetMessageId - The message ID from the SDK response
 * @param {string} targetUser - The username for fallback lookup
 * @param {Array<{author: string, content: string, userId: string, messageId: string}>} snapshot - Buffer snapshot
 * @returns {string|null} A valid message ID, or null if snapshot is empty
 */
export function resolveMessageId(targetMessageId, targetUser, snapshot) {
  // Check if the ID exists in the snapshot
  if (targetMessageId && snapshot.some((m) => m.messageId === targetMessageId)) {
    return targetMessageId;
  }

  // Fallback: last message from the target user
  if (targetUser) {
    for (let i = snapshot.length - 1; i >= 0; i--) {
      if (snapshot[i].author === targetUser) {
        return snapshot[i].messageId;
      }
    }
  }

  // Final fallback: last message in the buffer
  if (snapshot.length > 0) {
    return snapshot[snapshot.length - 1].messageId;
  }

  return null;
}
