/**
 * AI Cost Calculation
 *
 * Calculates USD cost from token usage via the `token-costs` library,
 * which provides daily-updated pricing for Anthropic, OpenAI, Google, and OpenRouter,
 * plus local pricing for MiniMax models that are not yet in token-costs.
 *
 * Falls back to 0 on unknown models or network errors — never crashes the caller.
 */

import { warn } from '../logger.js';

/** @type {Promise<import('token-costs').CostClient> | null} */
let costClientPromise = null;

// MiniMax's Anthropic-compatible endpoint is not covered by token-costs yet.
// Prices are USD per 1M tokens from MiniMax docs, checked 2026-04-12:
// https://platform.minimax.io/docs/api-reference/anthropic-api-compatible-cache
const MINIMAX_PRICING = {
  'minimax-m2.7': { input: 0.3, output: 1.2, cached: 0.06, cacheWrite: 0.375 },
  'minimax-m2.7-highspeed': { input: 0.3, output: 2.4, cached: 0.06, cacheWrite: 0.375 },
  'minimax-m2.5': { input: 0.3, output: 1.2, cached: 0.03, cacheWrite: 0.375 },
  'minimax-m2.5-highspeed': { input: 0.3, output: 2.4, cached: 0.03, cacheWrite: 0.375 },
  'minimax-m2.1': { input: 0.3, output: 1.2, cached: 0.03, cacheWrite: 0.375 },
  'minimax-m2.1-highspeed': { input: 0.3, output: 2.4, cached: 0.03, cacheWrite: 0.375 },
  'minimax-m2': { input: 0.3, output: 1.2, cached: 0.03, cacheWrite: 0.375 },
  'minimax-m2-stable': { input: 0.3, output: 1.2, cached: 0.03, cacheWrite: 0.375 },
};

/**
 * Initialise the CostClient.
 * Uses timeOffsetMs: 0 by default; in environments with clock skew the
 * ClockMismatchError is caught and a lenient client is created instead.
 * @returns {Promise<import('token-costs').CostClient>}
 */
async function initClient() {
  const { CostClient, ClockMismatchError } = await import('token-costs');
  try {
    const client = new CostClient();
    // Trigger a fetch to surface clock issues early
    await client.listModels('anthropic');
    return client;
  } catch (err) {
    if (err instanceof ClockMismatchError || err?.name === 'ClockMismatchError') {
      warn('token-costs clock mismatch detected, creating lenient client', {
        error: err.message,
      });
      // Offset enough to avoid the mismatch — 60 days back is generous
      return new CostClient({ timeOffsetMs: -60 * 24 * 60 * 60 * 1000 });
    }
    throw err;
  }
}

/**
 * Lazily initialise the CostClient singleton.
 * Uses a promise sentinel to prevent concurrent initialisations.
 * @returns {Promise<import('token-costs').CostClient>}
 */
async function getClient() {
  if (!costClientPromise) {
    costClientPromise = initClient();
  }
  return costClientPromise;
}

/**
 * Normalise an Anthropic API model ID to the token-costs format.
 *
 * The Anthropic API uses hyphen-separated version numbers and optional date
 * suffixes (e.g. 'claude-haiku-4-5-20250514'), while token-costs uses dots
 * (e.g. 'claude-haiku-4.5').
 *
 * @param {string} modelId - API model ID
 * @returns {string} Normalised model ID for token-costs lookup
 */
function normaliseModelId(modelId) {
  // Strip date suffix (e.g. '-20250514', '-20250929')
  const stripped = modelId.replace(/-\d{8}$/, '');

  // Family-last: 'claude-sonnet-4-6' → 'claude-sonnet-4.6'
  const match = stripped.match(/^(claude-\w+)-(\d+)-(\d+)$/);
  if (match) {
    return `${match[1]}-${match[2]}.${match[3]}`;
  }

  // Version-first (3-segment): 'claude-3-5-sonnet' → 'claude-3.5-sonnet'
  const match2 = stripped.match(/^(claude)-(\d+)-(\d+)-(\w+)$/);
  if (match2) {
    return `${match2[1]}-${match2[2]}.${match2[3]}-${match2[4]}`;
  }

  // Single version number (e.g. 'claude-opus-4') — no conversion needed
  return stripped;
}

function normaliseMinimaxModelId(modelId) {
  return modelId.toLowerCase();
}

function calculateMinimaxCost(modelId, usage = {}) {
  const pricing = MINIMAX_PRICING[normaliseMinimaxModelId(modelId)];
  if (!pricing) return null;

  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const cachedInputTokens = usage.cachedInputTokens ?? 0;
  const cacheCreationInputTokens = usage.cacheCreationInputTokens ?? 0;
  const cacheTokens = cachedInputTokens + cacheCreationInputTokens;

  // SDK usage normally reports total input tokens including cache read/write.
  // If a caller passes only uncached input tokens, keep them instead of going negative.
  const regularInputTokens =
    inputTokens >= cacheTokens ? inputTokens - cacheTokens : inputTokens;

  return (
    (regularInputTokens / 1_000_000) * pricing.input +
    (cachedInputTokens / 1_000_000) * pricing.cached +
    (cacheCreationInputTokens / 1_000_000) * pricing.cacheWrite +
    (outputTokens / 1_000_000) * pricing.output
  );
}

/**
 * Calculate USD cost from token usage.
 *
 * @param {string} provider - Provider name (e.g. 'anthropic', 'openai')
 * @param {string} modelId - Model ID (e.g. 'claude-sonnet-4-6' or 'claude-sonnet-4.6')
 * @param {Object} usage
 * @param {number} [usage.inputTokens]
 * @param {number} [usage.outputTokens]
 * @param {number} [usage.cachedInputTokens]
 * @param {number} [usage.cacheCreationInputTokens]
 * @returns {Promise<number>} Cost in USD (0 on failure)
 */
export async function calculateCost(provider, modelId, usage) {
  try {
    if (provider === 'minimax') {
      const minimaxCost = calculateMinimaxCost(modelId, usage);
      if (minimaxCost != null) return minimaxCost;
    }

    const client = await getClient();
    const normalisedModel = provider === 'anthropic' ? normaliseModelId(modelId) : modelId;

    const result = await client.calculateCost(provider, normalisedModel, {
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      cachedInputTokens: usage.cachedInputTokens ?? 0,
    });
    if (result.stale) {
      warn('Token pricing data is stale', { provider, modelId: normalisedModel });
    }
    return result.totalCost ?? 0;
  } catch (err) {
    warn('Cost calculation failed, returning 0', { provider, modelId, error: err.message });
    return 0;
  }
}

/**
 * Replace the CostClient singleton (for testing).
 * @param {import('token-costs').CostClient | null} client
 */
export function _setCostClient(client) {
  costClientPromise = client ? Promise.resolve(client) : null;
}

// Exported for testing
export { normaliseModelId as _normaliseModelId };
