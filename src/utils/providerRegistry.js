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

// ── Rebuild subscribers ─────────────────────────────────────────────────────
// Downstream modules (e.g. aiCost.js's pricingMap) that cache derived data from
// the registry can register a callback here to be notified on rebuild, so
// tests exercising `_resetRegistry()` can keep their derived caches in sync.
const rebuildSubscribers = new Set();

// ── Validation helpers ──────────────────────────────────────────────────────

/**
 * Assert that `cfg[field]` is a non-empty string. Throws TypeError on mismatch.
 * @param {object} cfg
 * @param {string} name - Provider name for error context.
 * @param {string} field
 */
function validateRequiredString(cfg, name, field) {
  if (typeof cfg[field] !== 'string' || !cfg[field]) {
    throw new TypeError(`providers.json: provider "${name}" missing required string "${field}"`);
  }
}

/**
 * Validate `baseUrl`: must be either a non-empty string or `null` (SDK default).
 * @param {object} cfg
 * @param {string} name
 */
function validateBaseUrl(cfg, name) {
  if (cfg.baseUrl === null) return;
  if (typeof cfg.baseUrl !== 'string' || !cfg.baseUrl) {
    throw new TypeError(
      `providers.json: provider "${name}" baseUrl must be null or a non-empty string`,
    );
  }
}

/**
 * Normalise `apiShape` to an array and assert every entry is in the allow-list.
 * @param {unknown} apiShape
 * @param {string} name
 * @returns {string[]}
 */
function normaliseApiShape(apiShape, name) {
  let shapes = apiShape;
  if (typeof shapes === 'string') shapes = [shapes];
  if (!Array.isArray(shapes) || shapes.length === 0) {
    throw new TypeError(
      `providers.json: provider "${name}" apiShape must be a non-empty string or array`,
    );
  }
  for (const shape of shapes) {
    if (typeof shape !== 'string' || !shape) {
      throw new TypeError(`providers.json: provider "${name}" apiShape entries must be strings`);
    }
    if (!ALLOWED_API_SHAPES.includes(shape)) {
      throw new Error(
        `providers.json: provider "${name}" declares unsupported apiShape "${shape}" ` +
          `(allowed: ${ALLOWED_API_SHAPES.join(', ')}). See issue #530.`,
      );
    }
  }
  return shapes;
}

/**
 * Validate the capabilities object. Requires `webSearch` and `thinking` as booleans.
 * @param {object} cfg
 * @param {string} name
 * @returns {{ webSearch: boolean, thinking: boolean }}
 */
function validateCapabilities(cfg, name) {
  const capabilities = cfg.capabilities;
  if (!capabilities || typeof capabilities !== 'object') {
    throw new TypeError(
      `providers.json: provider "${name}" missing required "capabilities" object`,
    );
  }
  for (const cap of ['webSearch', 'thinking']) {
    if (typeof capabilities[cap] !== 'boolean') {
      throw new TypeError(`providers.json: provider "${name}" capabilities.${cap} must be boolean`);
    }
  }
  return { webSearch: capabilities.webSearch, thinking: capabilities.thinking };
}

/**
 * Validate a single model's pricing block. Requires finite, non-negative numbers.
 * @param {object} pricing
 * @param {string} name
 * @param {string} modelId
 */
function validatePricing(pricing, name, modelId) {
  if (!pricing || typeof pricing !== 'object') {
    throw new TypeError(
      `providers.json: provider "${name}" model "${modelId}" missing "pricing" object`,
    );
  }
  for (const field of ['input', 'output', 'cacheRead', 'cacheWrite']) {
    const value = pricing[field];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new TypeError(
        `providers.json: provider "${name}" model "${modelId}" pricing.${field} ` +
          `must be a finite non-negative number`,
      );
    }
  }
}

/**
 * Normalise a single model entry.
 * @param {string} modelId
 * @param {object} modelCfg
 * @param {string} name - Provider name for error context.
 * @returns {object}
 */
function normaliseModel(modelId, modelCfg, name) {
  if (!modelCfg || typeof modelCfg !== 'object') {
    throw new TypeError(`providers.json: provider "${name}" model "${modelId}" must be an object`);
  }
  validatePricing(modelCfg.pricing, name, modelId);

  const availability = modelCfg.availability ?? {};
  return {
    id: modelId, // preserve original casing for display
    displayName: modelCfg.displayName ?? modelId,
    pricing: {
      input: modelCfg.pricing.input,
      output: modelCfg.pricing.output,
      cacheRead: modelCfg.pricing.cacheRead,
      cacheWrite: modelCfg.pricing.cacheWrite,
    },
    availability: {
      visible: availability.visible ?? true,
      tier: availability.tier ?? 'free',
    },
  };
}

/**
 * Validate and normalise a single provider entry.
 * @param {string} name
 * @param {object} cfg
 * @returns {object} Normalised provider record.
 */
function validateProvider(name, cfg) {
  if (!cfg || typeof cfg !== 'object') {
    throw new TypeError(`providers.json: provider "${name}" must be an object`);
  }

  validateRequiredString(cfg, name, 'displayName');
  validateRequiredString(cfg, name, 'envKey');
  validateBaseUrl(cfg, name);

  const apiShape = normaliseApiShape(cfg.apiShape, name);
  const capabilities = validateCapabilities(cfg, name);

  const models = cfg.models;
  if (!models || typeof models !== 'object' || Object.keys(models).length === 0) {
    throw new TypeError(
      `providers.json: provider "${name}" must declare a non-empty "models" object`,
    );
  }

  const normalisedModels = new Map();
  for (const [modelId, modelCfg] of Object.entries(models)) {
    normalisedModels.set(modelId.toLowerCase(), normaliseModel(modelId, modelCfg, name));
  }

  return {
    name,
    displayName: cfg.displayName,
    apiShape, // normalised to array
    baseUrl: cfg.baseUrl ?? null,
    envKey: cfg.envKey,
    capabilities,
    models: normalisedModels,
  };
}

/**
 * Validate and load `providers.json`. Throws on any structural error.
 * Called once at import time and exposed via `_resetRegistry()` for tests.
 */
function buildRegistry() {
  const next = new Map();

  if (!providersData || typeof providersData !== 'object') {
    throw new TypeError('providers.json: top-level must be an object');
  }

  const providers = providersData.providers;
  if (!providers || typeof providers !== 'object') {
    throw new TypeError('providers.json: missing required `providers` object');
  }

  for (const [name, cfg] of Object.entries(providers)) {
    next.set(name.toLowerCase(), validateProvider(name, cfg));
  }

  if (next.size === 0) {
    throw new Error('providers.json: at least one provider must be declared');
  }

  registry = next;

  // Fan out to anyone caching derived data (e.g. aiCost.js pricingMap).
  for (const fn of rebuildSubscribers) {
    try {
      fn();
    } catch (_err) {
      // Subscribers must not break registry load; swallow.
    }
  }
}

// Eager load at import — fail fast.
buildRegistry();

// ── Clone helpers ───────────────────────────────────────────────────────────

/**
 * Clone a normalised model record so callers cannot mutate registry internals.
 * @param {object} model
 * @returns {object}
 */
function cloneModelConfig(model) {
  return {
    ...model,
    pricing: { ...model.pricing },
    availability: { ...model.availability },
  };
}

/**
 * Clone a normalised provider record (including a fresh Map of cloned models).
 * @param {object} provider
 * @returns {object}
 */
function cloneProviderConfig(provider) {
  return {
    ...provider,
    apiShape: [...provider.apiShape],
    capabilities: { ...provider.capabilities },
    models: new Map(Array.from(provider.models, ([key, model]) => [key, cloneModelConfig(model)])),
  };
}

// ── Public helpers ──────────────────────────────────────────────────────────

/**
 * Strip a trailing date suffix (e.g. `-20250929`) from a model ID. Matches the
 * Anthropic API convention where "claude-sonnet-4-5-20250929" aliases "claude-sonnet-4-5".
 *
 * OpenRouter-style namespaced IDs (containing `/`) are returned unchanged so we
 * don't accidentally collapse `moonshotai/kimi-k2-20250905` into a different model.
 *
 * @param {unknown} modelId - Any value; non-strings are returned untouched.
 * @returns {unknown} Date-stripped string when applicable; otherwise the input.
 */
export function normaliseModelId(modelId) {
  if (typeof modelId !== 'string') return modelId;
  if (modelId.includes('/')) return modelId;
  return modelId.replace(/-\d{8}$/, '');
}

/**
 * Look up a provider config by name (case-insensitive). Returns a defensive
 * deep copy so callers cannot mutate the registry's internal state.
 * @param {string} providerName
 * @returns {{ name: string, displayName: string, apiShape: string[], baseUrl: string | null, envKey: string, capabilities: { webSearch: boolean, thinking: boolean }, models: Map<string, object> } | null}
 */
export function getProviderConfig(providerName) {
  if (typeof providerName !== 'string' || !providerName) return null;
  const provider = registry.get(providerName.toLowerCase());
  return provider ? cloneProviderConfig(provider) : null;
}

/**
 * Look up a model config by (provider, modelId). Case-insensitive. Falls back to
 * date-stripped lookup so callers can pass dated Anthropic-style IDs. Returns a
 * defensive copy.
 * @param {string} providerName
 * @param {string} modelId
 * @returns {{ id: string, displayName: string, pricing: { input: number, output: number, cacheRead: number, cacheWrite: number }, availability: { visible: boolean, tier: string } } | null}
 */
export function getModelConfig(providerName, modelId) {
  if (typeof providerName !== 'string' || !providerName) return null;
  const provider = registry.get(providerName.toLowerCase());
  if (!provider || typeof modelId !== 'string' || !modelId) return null;

  const direct = provider.models.get(modelId.toLowerCase());
  if (direct) return cloneModelConfig(direct);

  const stripped = normaliseModelId(modelId);
  if (stripped !== modelId && typeof stripped === 'string') {
    const hit = provider.models.get(stripped.toLowerCase());
    return hit ? cloneModelConfig(hit) : null;
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
  if (typeof providerName !== 'string' || !providerName) {
    return { webSearch: false, thinking: false };
  }
  const provider = registry.get(providerName.toLowerCase());
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
  if (typeof providerName !== 'string' || !providerName) return false;
  if (typeof shape !== 'string' || !shape) return false;
  const provider = registry.get(providerName.toLowerCase());
  if (!provider) return false;
  return provider.apiShape.includes(shape);
}

/**
 * List all registered provider names (original casing preserved).
 * Provider-name lookups elsewhere (pricingMap keys, env var prefixes) are
 * case-insensitive; callers should not assume any specific casing here.
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
 * Register a callback invoked every time `buildRegistry()` completes (including
 * the initial load and every test-triggered `_resetRegistry`). Used by modules
 * that cache derived data from the registry (e.g. `aiCost.js` pricingMap) to
 * keep in sync across test reloads.
 *
 * @param {() => void} fn
 * @returns {() => void} Unsubscribe function.
 */
export function onRegistryRebuild(fn) {
  if (typeof fn !== 'function') return () => {};
  rebuildSubscribers.add(fn);
  return () => rebuildSubscribers.delete(fn);
}

/**
 * Test-only: expose the set of accepted API shapes.
 */
export const _ALLOWED_API_SHAPES = ALLOWED_API_SHAPES;
