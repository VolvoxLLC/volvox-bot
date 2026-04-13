/**
 * AI Cost Calculation
 *
 * Calculates USD cost from token usage using a local pricing JSON file
 * (`src/data/model-pricing.json`). Prices are USD per 1M tokens.
 *
 * To add a new model, edit model-pricing.json — no code changes needed.
 * Falls back to 0 on unknown models — never crashes the caller.
 */

import pricingData from '../data/model-pricing.json' with { type: 'json' };
import { warn } from '../logger.js';

// Build a case-insensitive lookup map from the JSON on import.
const pricingMap = new Map(
  Object.entries(pricingData.models).map(([key, val]) => [key.toLowerCase(), val]),
);

/**
 * Normalise an Anthropic API model ID to the base format used in pricing JSON.
 *
 * The Anthropic API uses hyphen-separated version numbers and optional date
 * suffixes (e.g. 'claude-haiku-4-5-20250514'), while the pricing JSON uses
 * short names (e.g. 'claude-haiku-4-5').
 *
 * @param {string} modelId - API model ID
 * @returns {string} Normalised model ID for pricing lookup
 */
function normaliseModelId(modelId) {
  // Strip date suffix (e.g. '-20250514', '-20250929')
  const stripped = modelId.replace(/-\d{8}$/, '');

  // Preserve the family/version format and only remove provider date suffixes.
  return stripped;
}

/**
 * Look up pricing for a provider:model pair (case-insensitive).
 * Tries the raw model ID first, then the normalised (date-stripped) version.
 *
 * @param {string} provider
 * @param {string} modelId
 * @returns {{ input: number, output: number, cacheRead: number, cacheWrite: number } | null}
 */
function lookupPricing(provider, modelId) {
  const rawKey = `${provider}:${modelId}`.toLowerCase();
  if (pricingMap.has(rawKey)) return pricingMap.get(rawKey);

  const normKey = `${provider}:${normaliseModelId(modelId)}`.toLowerCase();
  if (normKey !== rawKey && pricingMap.has(normKey)) return pricingMap.get(normKey);

  return null;
}

/**
 * Calculate USD cost from token usage.
 *
 * @param {string} provider - Provider name (e.g. 'anthropic', 'openai', 'minimax')
 * @param {string} modelId - Model ID (e.g. 'claude-sonnet-4-6', 'gpt-4.1', 'MiniMax-M2.7')
 * @param {Object} usage
 * @param {number} [usage.inputTokens]
 * @param {number} [usage.outputTokens]
 * @param {number} [usage.cachedInputTokens]
 * @param {number} [usage.cacheCreationInputTokens]
 * @returns {number} Cost in USD (0 if model not found)
 */
export function calculateCost(provider, modelId, usage = {}) {
  const pricing = lookupPricing(provider, modelId);
  if (!pricing) {
    warn('Unknown model for cost calculation, returning 0', { provider, modelId });
    return 0;
  }

  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const cachedInputTokens = usage.cachedInputTokens ?? 0;
  const cacheCreationInputTokens = usage.cacheCreationInputTokens ?? 0;
  const cacheTotal = cachedInputTokens + cacheCreationInputTokens;

  // SDK usage normally reports total input tokens including cache read/write.
  // If a caller passes only uncached input tokens, keep them instead of going negative.
  const regularInputTokens = inputTokens >= cacheTotal ? inputTokens - cacheTotal : inputTokens;

  return (
    (regularInputTokens / 1_000_000) * pricing.input +
    (cachedInputTokens / 1_000_000) * pricing.cacheRead +
    (cacheCreationInputTokens / 1_000_000) * pricing.cacheWrite +
    (outputTokens / 1_000_000) * pricing.output
  );
}

// Exported for testing
export { normaliseModelId as _normaliseModelId, pricingMap as _pricingMap };
