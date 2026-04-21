/**
 * AI Client — Vercel AI SDK wrapper for the bot's AI inference needs.
 *
 * Supports multi-provider model selection via `provider:model` strings
 * (e.g. 'minimax:MiniMax-M2.7', 'moonshot:kimi-k2.6'). Bare model names are
 * **not** supported — every caller must declare the provider (see issue #553 D1).
 *
 * Provider metadata (base URL, env key, capabilities, apiShape) lives in
 * `src/data/providers.json` and is loaded via `providerRegistry.js`. All
 * currently-listed providers speak the Anthropic Messages wire protocol, so
 * requests are dispatched through the Anthropic SDK (`createAnthropic`) — the
 * SDK key `anthropic` is a wire-protocol identifier, not a vendor identity.
 * Other API shapes will be supported when issue #530 lands; the registry
 * rejects any shape not in its allow-list at load time.
 *
 * The SDK runs in-process — only credentials we explicitly pass are sent to
 * the provider endpoint.
 */

import { debug, error as logError, warn } from '../logger.js';
import { calculateCost } from './aiCost.js';
import { AIClientError, isRetryable } from './errors.js';
import { parseProviderModel } from './modelString.js';
import { getCapabilities, getProviderConfig, supportsShape } from './providerRegistry.js';

// ── Lazy SDK loading ────────────────────────────────────────────────────────

/**
 * Cached SDK modules after lazy load.
 * @type {{ createAnthropic: Function, generateText: Function, streamText: Function, stepCountIs: Function } | null}
 */
let _sdkModules = null;

/**
 * In-flight SDK load promise (deduplicates concurrent calls).
 * @type {Promise<typeof _sdkModules> | null}
 */
let _sdkLoadPromise = null;

/**
 * Lazy-load the Vercel AI SDK modules.
 * First call triggers the import; subsequent calls return the cached promise.
 * @returns {Promise<NonNullable<typeof _sdkModules>>}
 */
async function getSDK() {
  if (_sdkModules) return _sdkModules;
  if (!_sdkLoadPromise) {
    _sdkLoadPromise = Promise.all([import('@ai-sdk/anthropic'), import('ai')]).then(
      ([anthropicModule, aiModule]) => {
        _sdkModules = {
          createAnthropic: anthropicModule.createAnthropic,
          generateText: aiModule.generateText,
          streamText: aiModule.streamText,
          stepCountIs: aiModule.stepCountIs,
        };
        return _sdkModules;
      },
    );
  }
  return _sdkLoadPromise;
}

/**
 * Fire-and-forget SDK preload. Call at startup to warm the SDK in background.
 * Does not block — the promise is not awaited.
 */
export function preloadSDK() {
  getSDK().catch((err) => {
    logError('SDK preload failed', { error: err.message });
  });
}

// ── Retry helper ───────────────────────────────────────────────────────────

/**
 * Retry a function with exponential backoff.
 *
 * @param {() => Promise<T>} fn - Async function to retry
 * @param {{ maxRetries?: number, signal?: AbortSignal }} [opts]
 * @returns {Promise<T>}
 * @template T
 */
async function withRetry(fn, opts = {}) {
  const { maxRetries = 3, signal } = opts;
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      // Don't retry if aborted or on last attempt
      if (signal?.aborted || attempt === maxRetries - 1) throw err;

      // Don't retry non-transient errors. SDKs vary: Vercel AI SDK uses
      // `statusCode`, others use `status`. Normalize to cover both.
      const status = err.status ?? err.statusCode;
      if (!isRetryable(err, { status })) throw err;

      // Calculate delay: min(1000 * 2^attempt, 15_000) + jitter
      const retryAfter =
        status === 429 ? (Number.parseFloat(err.headers?.['retry-after']) || 0) * 1000 : 0;
      const exponential = Math.min(1000 * 2 ** attempt, 15_000);
      const jitter = Math.random() * 1000;
      const delay = Math.max(exponential + jitter, retryAfter);

      warn('Retrying AI request', {
        attempt: attempt + 1,
        maxRetries,
        delayMs: Math.round(delay),
        reason: err.message,
      });

      await new Promise((resolve, reject) => {
        let onAbort;
        const timer = setTimeout(() => {
          // Remove the abort listener on normal timer completion so we don't
          // accumulate listeners across retries (each retry adds one).
          if (signal && onAbort) signal.removeEventListener('abort', onAbort);
          resolve();
        }, delay);
        if (signal) {
          onAbort = () => {
            clearTimeout(timer);
            reject(err);
          };
          signal.addEventListener('abort', onAbort, { once: true });
        }
      });
    }
  }

  throw lastError;
}

// ── Provider cache ──────────────────────────────────────────────────────────

/**
 * Cache provider instances by (providerName, apiKey, baseUrl) tuple.
 * The bot has at most ~4 distinct configurations (classifier, responder, tldr, automod).
 * @type {Map<string, import('@ai-sdk/anthropic').AnthropicProvider>}
 */
const providerCache = new Map();

// Re-export the pure string parser so existing callers that reach for it via
// aiClient (alongside generate/stream) still work. The implementation lives
// in `modelString.js` so callers that only need the parser — e.g. debug
// footer builders — don't transitively import the Vercel AI SDK, and tests
// that mock aiClient don't lose the helper.
export { parseProviderModel };

/**
 * Parse a model string and resolve the provider instance + model object.
 *
 * @param {string} modelString - `provider:model` identifier (bare model names throw; see D1).
 * @param {{ apiKey?: string, baseUrl?: string }} [overrides]
 * @returns {Promise<{ model: object, providerName: string, modelId: string, factory: object }>}
 */
async function resolveModel(modelString, overrides = {}) {
  const { createAnthropic } = await getSDK();

  const { providerName, modelId } = parseProviderModel(modelString);

  // Fail loudly on unknown providers — the registry is the source of truth.
  const providerConfig = getProviderConfig(providerName);
  if (!providerConfig) {
    throw new AIClientError(
      `Unknown provider '${providerName}'. Declare it in src/data/providers.json.`,
      'api',
    );
  }

  // aiClient currently dispatches only to Anthropic-shape endpoints. When
  // OpenAI-shape support lands (issue #530), swap this for a per-shape SDK
  // selector keyed off the provider's declared apiShape preference.
  if (!supportsShape(providerName, 'anthropic')) {
    throw new AIClientError(
      `Provider '${providerName}' declares apiShape [${providerConfig.apiShape.join(', ')}]; ` +
        `aiClient currently only supports 'anthropic' shape (see issue #530).`,
      'api',
    );
  }

  // Resolve credential + base URL BEFORE building the cache key so env rotation,
  // <PROVIDER>_BASE_URL changes, and fallback-key pickups each invalidate the
  // cached factory. Keying on just overrides would collapse all env-backed
  // calls onto one entry and skip the env/missing-key check on second call.
  const envKey = providerConfig.envKey;
  // Sanitize provider names: uppercase + replace `-` with `_` so hyphenated
  // provider keys (e.g. `open-router`) still produce legal shell env var names.
  const envPrefix = providerName.toUpperCase().replace(/-/g, '_');

  // Env lookup order: the declared envKey first, then <PROVIDER>_API_KEY as
  // a permissive fallback so ad-hoc deployments don't need to edit the
  // catalog to ship a new provider name.
  const apiKey = overrides.apiKey || process.env[envKey] || process.env[`${envPrefix}_API_KEY`];

  if (!apiKey) {
    throw new AIClientError(
      `Missing API key for provider '${providerName}'. Set ${envKey} or pass an apiKey override.`,
      'api',
    );
  }

  // baseUrl resolution: explicit override > <PROVIDER>_BASE_URL env > registry default.
  // registry may declare `null` for SDK-default providers (see issue #553/#530).
  const baseUrl =
    overrides.baseUrl || process.env[`${envPrefix}_BASE_URL`] || providerConfig.baseUrl;

  if (baseUrl === undefined || baseUrl === '' || baseUrl === false) {
    throw new AIClientError(
      `Missing base URL for provider '${providerName}'. Set ${envPrefix}_BASE_URL, ` +
        `pass a baseUrl override, or populate baseUrl in src/data/providers.json.`,
      'api',
    );
  }

  // Cache key: include resolved apiKey + baseUrl so any change (env rotation,
  // override swap, registry reload) produces a distinct cache entry and picks
  // up a fresh factory instead of returning a stale TLS pool.
  // Canonicalise provider name to lowercase so `minimax:…` and `MiniMax:…` share
  // one pool instead of forking TCP/TLS resources.
  // Safe to embed the raw apiKey — the Map is module-private, never serialized,
  // logged, or exported.
  const canonicalName = providerName.toLowerCase();
  const cacheKey = `${canonicalName}\x00${apiKey}\x00${baseUrl ?? ''}`;

  if (!providerCache.has(cacheKey)) {
    // Every catalog provider authenticates via bearer token (Anthropic's
    // `x-api-key` path is not used — our catalog contains no direct
    // api.anthropic.com entries). Always pass as `authToken`.
    // `baseURL: null` lets the SDK use its own default (reserved for #530).
    providerCache.set(
      cacheKey,
      createAnthropic({
        authToken: apiKey,
        baseURL: baseUrl ?? undefined,
      }),
    );
  }

  const factory = providerCache.get(cacheKey);
  return {
    model: factory(modelId),
    providerName,
    modelId,
    factory,
    resolvedBaseUrl: baseUrl ?? null,
  };
}

// ── Option builders ─────────────────────────────────────────────────────────

/**
 * Build provider-specific options (e.g. thinking tokens).
 *
 * The SDK option key is `anthropic` because all currently-supported providers
 * route through the Anthropic Messages wire protocol — this is the SDK's
 * wire-level key, not a vendor identity. When a non-Anthropic SDK path is
 * added (issue #530) this function should map the resolved `apiShape` to the
 * matching SDK option key.
 *
 * @param {string} providerName - Logical provider name; thinking only emitted when the provider declares the capability.
 * @param {number} [thinking] - Thinking token budget (0 = disabled)
 * @returns {Object}
 */
function buildProviderOptions(providerName, thinking) {
  if (!thinking || thinking <= 0) return {};
  if (!getCapabilities(providerName).thinking) return {};
  return { anthropic: { thinking: { type: 'enabled', budgetTokens: thinking } } };
}

function getProviderMetadata(providerMetadata, providerName) {
  // Prefer the provider-keyed bucket; fall back to the Anthropic-shape bucket
  // (which is what the Vercel AI SDK actually populates today for every
  // provider routed through createAnthropic). Callers normalise against this.
  return providerMetadata?.[providerName] ?? providerMetadata?.anthropic ?? {};
}

/**
 * Build tool definitions from a list of tool names.
 * Uses the resolved provider factory instance for credentials consistency.
 *
 * @param {string[]|undefined} toolNames - Tool names (e.g. ['WebSearch'])
 * @param {string} providerName
 * @param {object} factory - The provider factory from resolveModel()
 * @returns {Object} Tool definitions for the SDK
 */
function buildTools(toolNames, providerName, factory) {
  const tools = {};
  if (!toolNames?.length) return tools;

  const knownTools = ['WebSearch'];
  const unknown = toolNames.filter((t) => !knownTools.includes(t));
  if (unknown.length) {
    warn('Unknown tool names ignored', { unknown });
  }

  if (
    toolNames.includes('WebSearch') &&
    getCapabilities(providerName).webSearch &&
    factory?.tools
  ) {
    tools.web_search = factory.tools.webSearch_20250305();
  }

  return tools;
}

/**
 * Create a combined AbortSignal from timeout + optional external signal.
 * @param {number} timeoutMs
 * @param {AbortSignal} [externalSignal]
 * @returns {{ signal: AbortSignal, cleanup: () => void }}
 */
function createAbortController(timeoutMs, externalSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let onExternalAbort;
  if (externalSignal?.aborted) {
    clearTimeout(timer);
    controller.abort();
  } else if (externalSignal) {
    onExternalAbort = () => {
      clearTimeout(timer);
      controller.abort();
    };
    externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      if (externalSignal && onExternalAbort) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    },
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Generate a complete text response (non-streaming).
 *
 * @param {Object} opts
 * @param {string} opts.model - `provider:model` string (e.g. 'minimax:MiniMax-M2.7'). Bare names throw (D1).
 * @param {string} [opts.system] - System prompt string
 * @param {string} opts.prompt - User prompt
 * @param {string[]} [opts.tools] - Tool names (e.g. ['WebSearch'])
 * @param {number} [opts.thinking] - Thinking token budget (0 = disabled)
 * @param {number} [opts.maxTokens=4096] - Max output tokens
 * @param {number} [opts.timeout=120000] - Timeout in ms
 * @param {AbortSignal} [opts.abortSignal] - External abort signal
 * @param {string} [opts.apiKey] - Override API key
 * @param {string} [opts.baseUrl] - Override base URL
 * @returns {Promise<{ text: string, usage: Object, costUsd: number, durationMs: number, finishReason: string, sources: Array, providerMetadata: Object }>}
 */
export async function generate(opts) {
  const {
    model: modelString,
    system,
    prompt,
    tools: toolNames,
    thinking = 0,
    maxTokens = 4096,
    timeout = 120_000,
    abortSignal: externalSignal,
    apiKey,
    baseUrl,
  } = opts;

  const timings = { start: Date.now() };

  const [sdk, resolved] = await Promise.all([
    getSDK(),
    resolveModel(modelString, { apiKey, baseUrl }),
  ]);
  timings.sdkResolved = Date.now();

  const { generateText, stepCountIs } = sdk;
  const { model, providerName, modelId, factory } = resolved;

  const tools = buildTools(toolNames, providerName, factory);
  const providerOptions = buildProviderOptions(providerName, thinking);
  const hasTools = Object.keys(tools).length > 0;

  const { signal, cleanup } = createAbortController(timeout, externalSignal);
  timings.preApiCall = Date.now();

  try {
    const result = await withRetry(
      () =>
        generateText({
          model,
          system,
          prompt,
          ...(hasTools && { tools, stopWhen: stepCountIs(5) }),
          maxTokens,
          providerOptions,
          abortSignal: signal,
        }),
      { maxRetries: 3, signal },
    );
    timings.apiComplete = Date.now();

    const usage = result.totalUsage ?? result.usage ?? {};
    const providerMeta = getProviderMetadata(result.providerMetadata, providerName);
    const cachedInputTokens = providerMeta.cacheReadInputTokens ?? 0;
    const cacheCreationInputTokens = providerMeta.cacheCreationInputTokens ?? 0;
    const costUsd = calculateCost(providerName, modelId, {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cachedInputTokens,
      cacheCreationInputTokens,
    });

    const durationMs = Date.now() - timings.start;
    debug('aiClient.generate timing breakdown', {
      model: modelString,
      sdkResolveMs: timings.sdkResolved - timings.start,
      preApiSetupMs: timings.preApiCall - timings.sdkResolved,
      apiCallMs: timings.apiComplete - timings.preApiCall,
      postProcessMs: Date.now() - timings.apiComplete,
      totalMs: durationMs,
    });

    return {
      text: result.text,
      usage,
      costUsd,
      durationMs,
      finishReason: result.finishReason,
      sources: result.sources ?? [],
      providerMetadata: result.providerMetadata ?? {},
    };
  } catch (err) {
    if (err instanceof AIClientError) throw err;
    if (signal.aborted) {
      if (externalSignal?.aborted) {
        throw new AIClientError('Request was cancelled', 'aborted');
      }
      throw new AIClientError('Request timed out', 'timeout');
    }
    throw new AIClientError(`API error: ${err.message}`, 'api', {
      statusCode: err.status ?? err.statusCode,
    });
  } finally {
    cleanup();
  }
}

/**
 * Generate a text response with streaming (for mid-stream event detection).
 *
 * @param {Object} opts - Same as generate() plus:
 * @param {Function} [opts.onChunk] - Called with (toolName, args) when a tool-call event fires mid-stream
 * @returns {Promise<{ text: string, usage: Object, costUsd: number, durationMs: number, finishReason: string, sources: Array, providerMetadata: Object }>}
 */
export async function stream(opts) {
  const {
    model: modelString,
    system,
    prompt,
    tools: toolNames,
    thinking = 0,
    maxTokens = 4096,
    timeout = 120_000,
    abortSignal: externalSignal,
    apiKey,
    baseUrl,
    onChunk: userOnChunk,
  } = opts;

  const timings = { start: Date.now() };

  const [sdk, resolved] = await Promise.all([
    getSDK(),
    resolveModel(modelString, { apiKey, baseUrl }),
  ]);
  timings.sdkResolved = Date.now();

  const { streamText, stepCountIs } = sdk;
  const { model, providerName, modelId, factory } = resolved;

  const tools = buildTools(toolNames, providerName, factory);
  const providerOptions = buildProviderOptions(providerName, thinking);
  const hasTools = Object.keys(tools).length > 0;

  const { signal, cleanup } = createAbortController(timeout, externalSignal);
  timings.preApiCall = Date.now();

  try {
    const result = await withRetry(
      async () => {
        // Capture stream-creation time on the *first* successful attempt we
        // reach here. Retries overwrite this so the final value reflects the
        // attempt that actually produced the result.
        timings.streamStarted = Date.now();
        const streamResult = streamText({
          model,
          system,
          prompt,
          ...(hasTools && { tools, stopWhen: stepCountIs(5) }),
          maxTokens,
          providerOptions,
          abortSignal: signal,
          onChunk: ({ chunk }) => {
            if (chunk.type === 'tool-call' && userOnChunk) {
              try {
                const cbResult = userOnChunk(chunk.toolName, chunk.args);
                if (cbResult?.catch)
                  cbResult.catch((err) =>
                    logError('onChunk callback error', { error: err.message }),
                  );
              } catch (err) {
                logError('onChunk callback error (sync)', { error: err.message });
              }
            }
          },
        });

        const text = await streamResult.text;
        const usage = (await streamResult.totalUsage) ?? (await streamResult.usage) ?? {};
        const finishReason = await streamResult.finishReason;
        const sources = (await streamResult.sources) ?? [];
        const providerMetadata = (await streamResult.providerMetadata) ?? {};

        return {
          text,
          usage,
          finishReason,
          sources,
          providerMetadata,
        };
      },
      { maxRetries: 3, signal },
    );
    timings.streamComplete = Date.now();

    const providerMeta = getProviderMetadata(result.providerMetadata, providerName);
    const cachedInputTokens = providerMeta.cacheReadInputTokens ?? 0;
    const cacheCreationInputTokens = providerMeta.cacheCreationInputTokens ?? 0;
    const costUsd = calculateCost(providerName, modelId, {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cachedInputTokens,
      cacheCreationInputTokens,
    });

    const durationMs = Date.now() - timings.start;
    debug('aiClient.stream timing breakdown', {
      model: modelString,
      sdkResolveMs: timings.sdkResolved - timings.start,
      preApiSetupMs: timings.preApiCall - timings.sdkResolved,
      streamInitMs: timings.streamStarted - timings.preApiCall,
      streamConsumeMs: timings.streamComplete - timings.streamStarted,
      postProcessMs: Date.now() - timings.streamComplete,
      totalMs: durationMs,
    });

    return {
      text: result.text,
      usage: result.usage,
      costUsd,
      durationMs,
      finishReason: result.finishReason,
      sources: result.sources,
      providerMetadata: result.providerMetadata,
    };
  } catch (err) {
    if (err instanceof AIClientError) throw err;
    if (signal.aborted) {
      if (externalSignal?.aborted) {
        throw new AIClientError('Request was cancelled', 'aborted');
      }
      throw new AIClientError('Request timed out', 'timeout');
    }
    throw new AIClientError(`API error: ${err.message}`, 'api', {
      statusCode: err.status ?? err.statusCode,
    });
  } finally {
    cleanup();
  }
}

/**
 * Clear the provider cache (for testing).
 */
export function _clearProviderCache() {
  providerCache.clear();
}

/**
 * Reset lazy-loaded SDK state (for testing).
 */
export function _resetSDK() {
  _sdkModules = null;
  _sdkLoadPromise = null;
}

/**
 * Pre-warm the provider cache and TCP/TLS connection for a model.
 *
 * Call at startup (e.g. from startTriage) so the first real request
 * doesn't pay the cold-connection penalty (~200ms).
 *
 * @param {string} modelString - Model identifier (e.g. 'minimax:MiniMax-M2.7')
 * @param {{ apiKey?: string, baseUrl?: string }} [overrides]
 */
export async function warmConnection(modelString, overrides = {}) {
  // Use the resolved baseUrl from the registry (not SDK internals like
  // `model.config?.baseURL`, which are undocumented and can drift between
  // SDK versions).
  const { resolvedBaseUrl } = await resolveModel(modelString, overrides);
  if (resolvedBaseUrl) {
    try {
      await fetch(resolvedBaseUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      }).catch(() => {});
    } catch {
      // Swallow — warming is best-effort
    }
  }
}
