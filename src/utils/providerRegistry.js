/**
 * Provider Registry
 *
 * Single source of truth for AI provider + model metadata. Loads `src/data/providers.json`
 * at import time with fail-fast validation — malformed entries throw during startup so
 * the bot never boots with a broken catalog.
 *
 * See issue #553 for the unified-catalog design and #530 for multi-shape SDK extensibility.
 */

import providersData from '../data/providers.json' with { type: 'json' };

// ── Allow-list ──────────────────────────────────────────────────────────────
// Which API shapes `aiClient.js` can dispatch to today. Expand when new SDKs land
// (see issue #530). The registry rejects any provider declaring a shape outside this list.
const ALLOWED_API_SHAPES = Object.freeze(['anthropic']);

// ── Internal cache ──────────────────────────────────────────────────────────
// Normalised providers keyed by lowercase provider name. Populated by `buildRegistry()`.
let registry = new Map();

/**
 * Validate and load `providers.json`. Throws on any structural error.
 * Called once at import time and exposed via `_resetRegistry()` for tests.
 */
function buildRegistry() {
  const next = new Map();

  if (!providersData || typeof providersData !== 'object') {
    throw new Error('providers.json: top-level must be an object');
  }

  const providers = providersData.providers;
  if (!providers || typeof providers !== 'object') {
    throw new Error('providers.json: missing required `providers` object');
  }

  for (const [name, cfg] of Object.entries(providers)) {
    if (!cfg || typeof cfg !== 'object') {
      throw new Error(`providers.json: provider "${name}" must be an object`);
    }

    // Required string fields
    for (const field of ['displayName', 'envKey', 'baseUrl']) {
      if (typeof cfg[field] !== 'string' || !cfg[field]) {
        throw new Error(`providers.json: provider "${name}" missing required string "${field}"`);
      }
    }

    // apiShape: string OR array of strings → normalise to array and validate against allow-list
    let apiShape = cfg.apiShape;
    if (typeof apiShape === 'string') apiShape = [apiShape];
    if (!Array.isArray(apiShape) || apiShape.length === 0) {
      throw new Error(
        `providers.json: provider "${name}" apiShape must be a non-empty string or array`,
      );
    }
    for (const shape of apiShape) {
      if (typeof shape !== 'string' || !shape) {
        throw new Error(`providers.json: provider "${name}" apiShape entries must be strings`);
      }
      if (!ALLOWED_API_SHAPES.includes(shape)) {
        throw new Error(
          `providers.json: provider "${name}" declares unsupported apiShape "${shape}" ` +
            `(allowed: ${ALLOWED_API_SHAPES.join(', ')}). See issue #530.`,
        );
      }
    }

    // Capabilities
    const capabilities = cfg.capabilities;
    if (!capabilities || typeof capabilities !== 'object') {
      throw new Error(`providers.json: provider "${name}" missing required "capabilities" object`);
    }
    for (const cap of ['webSearch', 'thinking']) {
      if (typeof capabilities[cap] !== 'boolean') {
        throw new Error(`providers.json: provider "${name}" capabilities.${cap} must be boolean`);
      }
    }

    // Models
    const models = cfg.models;
    if (!models || typeof models !== 'object' || Object.keys(models).length === 0) {
      throw new Error(
        `providers.json: provider "${name}" must declare a non-empty "models" object`,
      );
    }

    const normalisedModels = new Map();
    for (const [modelId, modelCfg] of Object.entries(models)) {
      if (!modelCfg || typeof modelCfg !== 'object') {
        throw new Error(`providers.json: provider "${name}" model "${modelId}" must be an object`);
      }
      const pricing = modelCfg.pricing;
      if (!pricing || typeof pricing !== 'object') {
        throw new Error(
          `providers.json: provider "${name}" model "${modelId}" missing "pricing" object`,
        );
      }
      for (const field of ['input', 'output', 'cacheRead', 'cacheWrite']) {
        if (typeof pricing[field] !== 'number' || !Number.isFinite(pricing[field])) {
          throw new Error(
            `providers.json: provider "${name}" model "${modelId}" pricing.${field} must be a finite number`,
          );
        }
      }

      const availability = modelCfg.availability ?? {};
      normalisedModels.set(modelId.toLowerCase(), {
        id: modelId, // preserve original casing for display
        displayName: modelCfg.displayName ?? modelId,
        pricing: {
          input: pricing.input,
          output: pricing.output,
          cacheRead: pricing.cacheRead,
          cacheWrite: pricing.cacheWrite,
        },
        availability: {
          visible: availability.visible ?? true,
          tier: availability.tier ?? 'free',
        },
      });
    }

    next.set(name.toLowerCase(), {
      name,
      displayName: cfg.displayName,
      apiShape, // normalised to array
      baseUrl: cfg.baseUrl,
      envKey: cfg.envKey,
      capabilities: {
        webSearch: capabilities.webSearch,
        thinking: capabilities.thinking,
      },
      models: normalisedModels,
    });
  }

  if (next.size === 0) {
    throw new Error('providers.json: at least one provider must be declared');
  }

  registry = next;
}

// Eager load at import — fail fast.
buildRegistry();

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Strip a trailing date suffix (e.g. `-20250929`) from a model ID. Matches the
 * Anthropic API convention where "claude-sonnet-4-5-20250929" aliases "claude-sonnet-4-5".
 * @param {string} modelId
 * @returns {string}
 */
export function normaliseModelId(modelId) {
  if (typeof modelId !== 'string') return modelId;
  return modelId.replace(/-\d{8}$/, '');
}

/**
 * Look up a provider config by name (case-insensitive).
 * @param {string} providerName
 * @returns {{ name: string, displayName: string, apiShape: string[], baseUrl: string, envKey: string, capabilities: { webSearch: boolean, thinking: boolean }, models: Map<string, object> } | null}
 */
export function getProviderConfig(providerName) {
  if (typeof providerName !== 'string' || !providerName) return null;
  return registry.get(providerName.toLowerCase()) ?? null;
}

/**
 * Look up a model config by (provider, modelId). Case-insensitive. Falls back to
 * date-stripped lookup so callers can pass dated Anthropic-style IDs.
 * @param {string} providerName
 * @param {string} modelId
 * @returns {{ id: string, displayName: string, pricing: { input: number, output: number, cacheRead: number, cacheWrite: number }, availability: { visible: boolean, tier: string } } | null}
 */
export function getModelConfig(providerName, modelId) {
  const provider = getProviderConfig(providerName);
  if (!provider || typeof modelId !== 'string' || !modelId) return null;

  const direct = provider.models.get(modelId.toLowerCase());
  if (direct) return direct;

  const stripped = normaliseModelId(modelId);
  if (stripped !== modelId) {
    return provider.models.get(stripped.toLowerCase()) ?? null;
  }
  return null;
}

/**
 * Get capability flags for a provider. Returns a conservative default when the
 * provider is unknown so callers can gate cleanly without null-checking.
 * @param {string} providerName
 * @returns {{ webSearch: boolean, thinking: boolean }}
 */
export function getCapabilities(providerName) {
  const provider = getProviderConfig(providerName);
  if (!provider) return { webSearch: false, thinking: false };
  return { ...provider.capabilities };
}

/**
 * Does the provider declare support for the given wire-protocol shape?
 * Today only `'anthropic'` is accepted by the allow-list, but the field is
 * already first-class so issue #530 can flip on OpenAI-shape without schema churn.
 * @param {string} providerName
 * @param {string} shape
 * @returns {boolean}
 */
export function supportsShape(providerName, shape) {
  const provider = getProviderConfig(providerName);
  if (!provider || typeof shape !== 'string') return false;
  return provider.apiShape.includes(shape);
}

/**
 * List all registered provider names (original casing preserved).
 * @returns {string[]}
 */
export function listProviders() {
  return Array.from(registry.values()).map((p) => p.name);
}

/**
 * Test-only: rebuild the registry from the current `providers.json` payload.
 * Exposed so tests can force a reload after mocking the JSON module.
 */
export function _resetRegistry() {
  buildRegistry();
}

/**
 * Test-only: expose the set of accepted API shapes.
 */
export const _ALLOWED_API_SHAPES = ALLOWED_API_SHAPES;
