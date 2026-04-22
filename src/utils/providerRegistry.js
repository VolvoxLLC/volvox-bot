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
import { warn } from '../logger.js';

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
 * Validate `baseUrl`: must be either a non-empty string, `null`, or omitted.
 * Omitted/`null`/`undefined` all collapse to the SDK default, matching the
 * `cfg.baseUrl ?? null` normalisation in `validateProvider`. Only `""`,
 * non-strings, and empty strings throw.
 * @param {object} cfg
 * @param {string} name
 */
function validateBaseUrl(cfg, name) {
  if (cfg.baseUrl === undefined || cfg.baseUrl === null) return;
  if (typeof cfg.baseUrl !== 'string' || !cfg.baseUrl) {
    throw new TypeError(
      `providers.json: provider "${name}" baseUrl must be null, omitted, or a non-empty string`,
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
  // `typeof [] === 'object'`, so Array.isArray rules out a `models: [...]`
  // misconfiguration that would otherwise slip through and yield numeric-string
  // indices as model IDs via Object.entries.
  if (
    !models ||
    typeof models !== 'object' ||
    Array.isArray(models) ||
    Object.keys(models).length === 0
  ) {
    throw new TypeError(
      `providers.json: provider "${name}" must declare a non-empty "models" object`,
    );
  }

  const normalisedModels = new Map();
  const modelIdOriginals = new Map(); // lowercase → original casing, for dup detection
  for (const [modelId, modelCfg] of Object.entries(models)) {
    const key = modelId.toLowerCase();
    if (normalisedModels.has(key)) {
      // Silent overwrite would let two JSON keys that differ only in casing
      // collapse into the last-one-wins entry. Fail loud instead.
      throw new TypeError(
        `providers.json: provider "${name}" declares duplicate model IDs ` +
          `"${modelIdOriginals.get(key)}" and "${modelId}" (case-insensitive collision)`,
      );
    }
    modelIdOriginals.set(key, modelId);
    normalisedModels.set(key, normaliseModel(modelId, modelCfg, name));
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
 * Pure validator: consume a raw `providers.json` payload and return a
 * normalised Map keyed by lowercased provider name. Kept separate from
 * `buildRegistry()` so tests can exercise the top-level validation branches
 * (array-rejection, case-insensitive duplicate providers) without having to
 * mock the JSON module import.
 * @param {unknown} data
 * @returns {Map<string, object>}
 */
function validateRegistryPayload(data) {
  const next = new Map();

  if (!data || typeof data !== 'object') {
    throw new TypeError('providers.json: top-level must be an object');
  }

  const providers = data.providers;
  // Array.isArray mirrors the models-block guard — `providers: [...]` would
  // otherwise slip through `typeof === 'object'` and yield numeric-string
  // provider names via Object.entries.
  if (!providers || typeof providers !== 'object' || Array.isArray(providers)) {
    throw new TypeError('providers.json: missing required `providers` object');
  }

  const providerOriginals = new Map(); // lowercase → original casing, for dup detection
  for (const [name, cfg] of Object.entries(providers)) {
    const key = name.toLowerCase();
    if (next.has(key)) {
      throw new TypeError(
        `providers.json: duplicate provider names "${providerOriginals.get(key)}" and "${name}" ` +
          `(case-insensitive collision)`,
      );
    }
    providerOriginals.set(key, name);
    next.set(key, validateProvider(name, cfg));
  }

  if (next.size === 0) {
    throw new Error('providers.json: at least one provider must be declared');
  }

  return next;
}

/**
 * Validate and load `providers.json`. Throws on any structural error.
 * Called once at import time and exposed via `_resetRegistry()` for tests.
 */
function buildRegistry() {
  const next = validateRegistryPayload(providersData);
  registry = next;

  // Fan out to anyone caching derived data (e.g. aiCost.js pricingMap).
  for (const fn of rebuildSubscribers) {
    try {
      fn();
    } catch (err) {
      // Subscribers must not break registry load, but a silent swallow leaves
      // derived caches (e.g. aiCost.pricingMap) stale with zero signal.
      // Surface via the logger so operators see the failure without blocking
      // startup.
      warn('providerRegistry: rebuild subscriber threw', {
        subscriber: fn?.name || 'anonymous',
        error: err?.message,
      });
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

/**
 * Test-only: run provider-level validation against a raw config object
 * without touching the live registry. Used to unit-test individual validation
 * branches (e.g. baseUrl variants, array-as-models) in isolation.
 * @param {string} name
 * @param {object} cfg
 * @returns {object}
 */
export const _validateProvider = validateProvider;

/**
 * Test-only: run the top-level payload validation against a raw data object
 * without touching the live registry. Used to unit-test payload-level
 * branches (e.g. `providers: [...]` rejection, duplicate provider names)
 * in isolation.
 * @param {unknown} data
 * @returns {Map<string, object>}
 */
export const _validateRegistryPayload = validateRegistryPayload;
