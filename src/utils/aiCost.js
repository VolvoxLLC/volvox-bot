/**
 * AI Cost Calculation
 *
 * Calculates USD cost from token usage via the `token-costs` library,
 * which provides daily-updated pricing for Anthropic, OpenAI, Google, and OpenRouter.
 *
 * Falls back to 0 on unknown models or network errors — never crashes the caller.
 */

import { warn } from '../logger.js';

/** @type {Promise<import('token-costs').CostClient> | null} */
let costClientPromise = null;

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

/**
 * Calculate USD cost from token usage.
 *
 * @param {string} provider - Provider name (e.g. 'anthropic', 'openai')
 * @param {string} modelId - Model ID (e.g. 'claude-sonnet-4-6' or 'claude-sonnet-4.6')
 * @param {{ inputTokens?: number, outputTokens?: number, cachedInputTokens?: number }} usage
 * @returns {Promise<number>} Cost in USD (0 on failure)
 */
export async function calculateCost(provider, modelId, usage) {
  try {
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
