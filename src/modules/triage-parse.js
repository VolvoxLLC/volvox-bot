/**
 * Triage Result Parsers
 * Parse and validate JSON results from classifier and responder CLI processes.
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

  // Strip markdown code fences if present
  const stripped = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/, '');

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
    const recovered = {
      classification: classMatch[1],
      reasoning: reasonMatch ? reasonMatch[1] : 'Recovered from truncated response',
      targetMessageIds: [],
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
 * @param {Object} sdkMessage - Raw CLI result message
 * @param {string} channelId - For logging
 * @returns {Object|null} Parsed { classification, reasoning, targetMessageIds } or null
 */
export function parseClassifyResult(sdkMessage, channelId) {
  const parsed = parseSDKResult(sdkMessage.result, channelId, 'Classifier');

  if (!parsed || !parsed.classification) {
    warn('Classifier result unparseable', {
      channelId,
      resultType: typeof sdkMessage.result,
      messageKeys: Object.keys(sdkMessage),
      hasResult: 'result' in sdkMessage,
      isError: sdkMessage.is_error,
      errors: sdkMessage.errors?.map((e) => e.message || e).slice(0, 5),
      stopReason: sdkMessage.stop_reason,
      resultSnippet: JSON.stringify(sdkMessage.result)?.slice(0, 300),
    });
    return null;
  }

  return parsed;
}

// ── Responder result parser ──────────────────────────────────────────────────

/**
 * Parse the responder's JSON text output.
 * @param {Object} sdkMessage - Raw CLI result message
 * @param {string} channelId - For logging
 * @returns {Object|null} Parsed { responses: [...] } or null
 */
export function parseRespondResult(sdkMessage, channelId) {
  const parsed = parseSDKResult(sdkMessage.result, channelId, 'Responder');

  if (!parsed) {
    warn('Responder result unparseable', {
      channelId,
      resultType: typeof sdkMessage.result,
      messageKeys: Object.keys(sdkMessage),
      hasResult: 'result' in sdkMessage,
      isError: sdkMessage.is_error,
      errors: sdkMessage.errors?.map((e) => e.message || e).slice(0, 5),
      stopReason: sdkMessage.stop_reason,
      resultSnippet: JSON.stringify(sdkMessage.result)?.slice(0, 300),
    });
    return null;
  }

  return parsed;
}
