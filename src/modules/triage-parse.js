/**
 * Triage Result Parsers
 * Parse and validate JSON results returned by the Vercel AI SDK classifier
 * and responder calls.
 */

import { info, warn } from '../logger.js';

// ── Generic SDK result parser ────────────────────────────────────────────────

/**
 * Parse SDK result text as JSON, tolerating truncation and markdown fencing.
 * Returns parsed object on success, or null on failure (after logging).
 * @param {string|Object} raw - Raw result from the SDK
 * @param {string} channelId - Channel ID for logging context
 * @param {string} label - Human-readable label for log messages
 * @returns {Object|null} Parsed JSON object or null
 */
export function parseSDKResult(raw, channelId, label) {
  if (!raw) {
    warn(`${label}: raw result is falsy`, {
      channelId,
      rawType: typeof raw,
      rawValue: String(raw),
    });
    return null;
  }
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);

  // Strip markdown code fences if present. Some providers prepend blank lines
  // before the fence, so trim outer whitespace before checking fence markers.
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim();

  try {
    return JSON.parse(stripped);
  } catch {
    warn(`${label}: JSON parse failed, attempting extraction`, {
      channelId,
      rawLength: text.length,
      rawSnippet: text.slice(0, 200),
    });
  }

  // Try to extract classification from truncated JSON via regex
  const classMatch = stripped.match(/"classification"\s*:\s*"([^"]+)"/);
  const reasonMatch = stripped.match(/"reasoning"\s*:\s*"([^"]*)/);

  if (classMatch) {
    // Recovery is type-safe: extracts a validated classification string,
    // defaults reasoning to a sentinel, and sets an empty targetMessageIds
    // array. No blind JSON bracket-appending is performed.
    const recovered = {
      classification: classMatch[1],
      reasoning: reasonMatch ? reasonMatch[1] : 'Recovered from truncated response',
      confidence: 0.5,
      targetMessageIds: [],
      needsThinking: false,
      needsSearch: false,
    };
    info(`${label}: recovered classification from truncated JSON`, { channelId, ...recovered });
    return recovered;
  }

  warn(`${label}: could not extract classification from response`, {
    channelId,
    rawSnippet: text.slice(0, 200),
  });
  return null;
}

// ── Classifier result parser ─────────────────────────────────────────────────

/**
 * Parse the classifier's JSON text output.
 * @param {Object} sdkResult - Vercel AI SDK result object (has `.text`, `.finishReason`, etc.)
 * @param {string} channelId - For logging
 * @returns {Object|null} Parsed { classification, reasoning, targetMessageIds, needsThinking, needsSearch } or null
 */
export function parseClassifyResult(sdkResult, channelId) {
  const parsed = parseSDKResult(sdkResult.text, channelId, 'Classifier');

  if (!parsed?.classification) {
    warn('Classifier result unparseable', {
      channelId,
      resultType: typeof sdkResult.text,
      hasText: 'text' in sdkResult,
      finishReason: sdkResult.finishReason,
      resultSnippet: sdkResult.text?.slice(0, 300),
    });
    return null;
  }

  // Normalize classifier hints (default false for backward compat / truncated responses)
  parsed.needsThinking = parsed.needsThinking === true;
  parsed.needsSearch = parsed.needsSearch === true;

  return parsed;
}

// ── Responder result parser ──────────────────────────────────────────────────

/**
 * Parse the responder's JSON text output.
 *
 * Note: Response length enforcement (Discord's 2000-char limit) is not applied
 * here. Individual response text is bounded by MAX_MESSAGE_CHARS=1000 at
 * accumulation time, and splitMessage() in triage-respond.js handles chunking
 * for any edge cases before sending to Discord.
 *
 * @param {Object} sdkResult - Vercel AI SDK result object (has `.text`, `.finishReason`, etc.)
 * @param {string} channelId - For logging
 * @returns {Object|null} Parsed { responses: [...] } or null
 */
export function parseRespondResult(sdkResult, channelId) {
  const parsed = parseSDKResult(sdkResult.text, channelId, 'Responder');

  if (!parsed) {
    warn('Responder result unparseable', {
      channelId,
      resultType: typeof sdkResult.text,
      hasText: 'text' in sdkResult,
      finishReason: sdkResult.finishReason,
      resultSnippet: sdkResult.text?.slice(0, 300),
    });
    return null;
  }

  return parsed;
}
