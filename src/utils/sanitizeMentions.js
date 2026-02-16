/**
 * Mention Sanitization Utility
 * Defense-in-depth layer to strip @everyone and @here from outgoing messages.
 * Even though allowedMentions is set at the Client level, this ensures
 * the raw text never contains these pings.
 *
 * @see https://github.com/BillChirico/bills-bot/issues/61
 */

/**
 * Zero-width space character used to break mention parsing.
 * Inserted after '@' so Discord doesn't recognize the mention.
 */
const ZWS = '\u200B';

/**
 * Pattern matching @everyone and @here mentions.
 * Uses a negative lookbehind for word characters to avoid false positives
 * in email addresses (e.g. user@everyone.com should NOT be mutated).
 *
 * Discord treats @everyone and @here as case-sensitive — only exact
 * lowercase forms trigger mass pings. @Everyone, @HERE, etc. are NOT
 * parsed as mentions by Discord, so we intentionally omit the /i flag.
 */
const MENTION_PATTERN = /(?<!\w)@(everyone|here)\b/g;

/**
 * Sanitize a message string by escaping @everyone and @here mentions.
 * Inserts a zero-width space after '@' to prevent Discord from parsing them.
 *
 * - Normal user mentions like <@123456> are NOT affected
 * - Returns non-string inputs unchanged (null, undefined, numbers, etc.)
 *
 * @param {*} text - The text to sanitize
 * @returns {*} The sanitized text, or the original value if not a string
 */
export function sanitizeMentions(text) {
  if (typeof text !== 'string') {
    return text;
  }

  return text.replace(MENTION_PATTERN, `@${ZWS}$1`);
}

/**
 * Sanitize the content field of a message options object.
 * If given a string, sanitizes it directly.
 * If given an object with a 'content' property, sanitizes that property.
 * Returns other types unchanged.
 *
 * @param {string|object|*} options - Message content or options object
 * @returns {string|object|*} Sanitized version
 */
export function sanitizeMessageOptions(options) {
  if (typeof options === 'string') {
    return sanitizeMentions(options);
  }

  if (options && typeof options === 'object' && 'content' in options) {
    return {
      ...options,
      content: sanitizeMentions(options.content),
    };
  }

  return options;
}
