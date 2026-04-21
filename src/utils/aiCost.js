/**
 * AI Cost Calculation
 *
 * Calculates USD cost from token usage using the unified provider catalog
 * (`src/data/providers.json`) via `providerRegistry.js`. Prices are USD per 1M tokens.
 *
 * To add a new model, edit providers.json — no code changes needed.
 * Falls back to 0 on unknown models — never crashes the caller.
 */

import { warn } from '../logger.js';
import {
  getModelConfig,
  getProviderConfig,
  listProviders,
  normaliseModelId,
} from './providerRegistry.js';

// Case-insensitive pricing map built from the provider registry on import.
// Keys are `provider:model` (lowercase); values are the pricing block.
const pricingMap = buildPricingMap();

function buildPricingMap() {
  const map = new Map();
  for (const providerName of listProviders()) {
    const provider = getProviderConfig(providerName);
    if (!provider) continue;
    for (const modelEntry of provider.models.values()) {
      const key = `${providerName}:${modelEntry.id}`.toLowerCase();
      map.set(key, modelEntry.pricing);
    }
  }
  return map;
}

/**
 * Look up pricing for a provider:model pair (case-insensitive).
 * Tries the raw model ID first, then delegates to the registry which handles
 * date-suffix stripping and case-insensitive lookups uniformly.
 *
 * @param {string} provider
 * @param {string} modelId
 * @returns {{ input: number, output: number, cacheRead: number, cacheWrite: number } | null}
 */
function lookupPricing(provider, modelId) {
  const rawKey = `${provider}:${modelId}`.toLowerCase();
  if (pricingMap.has(rawKey)) return pricingMap.get(rawKey);

  const modelCfg = getModelConfig(provider, modelId);
  return modelCfg ? modelCfg.pricing : null;
}

/**
 * Calculate USD cost from token usage.
 *
 * @param {string} provider - Provider name (e.g. 'minimax', 'moonshot', 'openrouter')
 * @param {string} modelId - Model ID (e.g. 'MiniMax-M2.7', 'kimi-k2.6')
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

  // Contract: `inputTokens` is ALWAYS the total input count reported by the
  // SDK — it includes both cache-read and cache-creation tokens. Callers that
  // pre-subtracted cache tokens would be double-counting and must be fixed at
  // the source rather than compensated for here.
  // Clamp at 0 to defend against provider metadata mismatches without silently
  // hiding them (they'll surface via the callers' usage dashboards).
  const regularInputTokens = Math.max(
    0,
    inputTokens - cachedInputTokens - cacheCreationInputTokens,
  );

  return (
    (regularInputTokens / 1_000_000) * pricing.input +
    (cachedInputTokens / 1_000_000) * pricing.cacheRead +
    (cacheCreationInputTokens / 1_000_000) * pricing.cacheWrite +
    (outputTokens / 1_000_000) * pricing.output
  );
}

// Exported for testing
export { normaliseModelId as _normaliseModelId, pricingMap as _pricingMap };
