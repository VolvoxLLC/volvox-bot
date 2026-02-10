/**
 * Split Message Utility
 * Splits long messages to fit within Discord's 2000-character limit.
 */

/**
 * Discord's maximum message length.
 */
const DISCORD_MAX_LENGTH = 2000;

/**
 * Safe chunk size leaving room for potential overhead.
 */
const SAFE_CHUNK_SIZE = 1990;

/**
 * Splits a message into chunks that fit within Discord's character limit.
 * Attempts to split on word boundaries to avoid breaking words, URLs, or emoji.
 *
 * @param {string} text - The text to split
 * @param {number} [maxLength=1990] - Maximum length per chunk (default 1990 to stay under 2000)
 * @returns {string[]} Array of text chunks, each within the specified limit
 */
export function splitMessage(text, maxLength = SAFE_CHUNK_SIZE) {
  if (!text || text.length <= maxLength) {
    return text ? [text] : [];
  }

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Try to find a space to split on (word boundary)
    let splitAt = remaining.lastIndexOf(' ', maxLength);

    // If no space found or it's at the start, force split at maxLength
    if (splitAt <= 0) {
      splitAt = maxLength;
    }

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  return chunks;
}

/**
 * Checks if a message exceeds Discord's character limit.
 *
 * @param {string} text - The text to check
 * @returns {boolean} True if the message needs splitting
 */
export function needsSplitting(text) {
  return text && text.length > DISCORD_MAX_LENGTH;
}
