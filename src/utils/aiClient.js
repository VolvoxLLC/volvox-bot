/**
 * AI Client — Vercel AI SDK wrapper for the bot's AI inference needs.
 *
 * Supports multi-provider model selection via `provider:model` strings
 * (e.g. 'anthropic:claude-sonnet-4-6', 'minimax:MiniMax-M2.7').
 * Bare model names default to Anthropic.
 *
 * Providers using Anthropic-compatible API endpoints (like MiniMax) are
 * routed through the Anthropic SDK with custom base URLs. The SDK runs
 * in-process — only credentials we explicitly pass via apiKey/authToken
 * are sent to the provider.
 */

import { debug, error as logError, warn } from '../logger.js';
import { calculateCost } from './aiCost.js';
import { AIClientError, isRetryable } from './errors.js';

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
        status === 429 ? (parseFloat(err.headers?.['retry-after']) || 0) * 1000 : 0;
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
        const timer = setTimeout(resolve, delay);
        if (signal) {
          const onAbort = () => {
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

// ── Provider defaults ───────────────────────────────────────────────────────

/**
 * Default base URLs for known providers.
 * Providers not listed here require a `<PROVIDER>_BASE_URL` env var or
 * a per-model `baseUrl` override in config.
 */
const KNOWN_BASE_URLS = {
  minimax: 'https://api.minimax.io/anthropic/v1',
};

// ── Provider cache ──────────────────────────────────────────────────────────

/**
 * Cache provider instances by (providerName, apiKey, baseUrl) tuple.
 * The bot has at most ~4 distinct configurations (classifier, responder, tldr, automod).
 * @type {Map<string, import('@ai-sdk/anthropic').AnthropicProvider>}
 */
const providerCache = new Map();

/**
 * Detect whether an Anthropic credential should be sent as authToken.
 * Standard API keys typically use the `sk-ant-` prefix; OAuth-style tokens
 * may use known OAuth prefixes or be significantly longer.
 *
 * @param {string|undefined} credential
 * @returns {boolean}
 */
function isAnthropicAuthToken(credential) {
  if (!credential) return false;
  if (credential.startsWith('oauth2_')) return true;
  if (!credential.startsWith('sk-ant-') && credential.length > 128) return true;
  return false;
}

/**
 * Parse a model string and resolve the provider instance + model object.
 *
 * @param {string} modelString - Model identifier, optionally prefixed with provider
 *   (e.g. 'anthropic:claude-sonnet-4-6' or bare 'claude-haiku-4-5').
 * @param {{ apiKey?: string, baseUrl?: string }} [overrides]
 * @returns {Promise<{ model: object, providerName: string, modelId: string, factory: object }>}
 */
async function resolveModel(modelString, overrides = {}) {
  const { createAnthropic } = await getSDK();

  const colonIdx = modelString.indexOf(':');
  const providerName = colonIdx > 0 ? modelString.slice(0, colonIdx) : 'anthropic';
  const modelId = colonIdx > 0 ? modelString.slice(colonIdx + 1) : modelString;

  // Cache key uses the raw apiKey as a discriminator. Safe because the Map
  // lives in-process and is never serialized, logged, or exported. Using the
  // raw key avoids node:crypto for a non-security discriminator (CodeQL
  // flagged the prior SHA-256 as "insecure password hash").
  const cacheKey = `${providerName}\x00${overrides.apiKey ?? ''}\x00${overrides.baseUrl ?? ''}`;

  if (!providerCache.has(cacheKey)) {
    // Resolve credentials by convention. Anthropic uses ANTHROPIC_API_KEY
    // directly; other providers follow the <PROVIDER>_API_KEY /
    // <PROVIDER>_BASE_URL convention. We deliberately do NOT fall back to
    // ANTHROPIC_API_KEY for non-Anthropic providers — that would leak our
    // Anthropic credentials to a third-party endpoint.
    const isAnthropic = providerName === 'anthropic';
    const envPrefix = providerName.toUpperCase();

    const apiKey =
      overrides.apiKey ||
      (isAnthropic ? process.env.ANTHROPIC_API_KEY : process.env[`${envPrefix}_API_KEY`]);

    if (!apiKey) {
      const envVar = isAnthropic ? 'ANTHROPIC_API_KEY' : `${envPrefix}_API_KEY`;
      throw new AIClientError(
        `Missing API key for provider '${providerName}'. Set ${envVar} or pass an apiKey override.`,
        'api',
      );
    }

    const baseUrl =
      overrides.baseUrl ||
      (isAnthropic ? undefined : process.env[`${envPrefix}_BASE_URL`]) ||
      KNOWN_BASE_URLS[providerName];

    providerCache.set(
      cacheKey,
      createAnthropic({
        ...(isAnthropic
          ? isAnthropicAuthToken(apiKey)
            ? { authToken: apiKey }
            : { apiKey }
          : { authToken: apiKey }),
        ...(baseUrl && { baseURL: baseUrl }),
      }),
    );
  }

  const factory = providerCache.get(cacheKey);
  return { model: factory(modelId), providerName, modelId, factory };
}

// ── Option builders ─────────────────────────────────────────────────────────

/**
 * Build provider-specific options (e.g. thinking tokens).
 *
 * All providers currently route through the Anthropic SDK (`createAnthropic`),
 * so options MUST be keyed as `anthropic` — this is the SDK key, not the
 * logical provider name. If a non-Anthropic SDK is added in the future,
 * this function should map provider names to their SDK option keys.
 *
 * @param {string} providerName - Logical provider name; thinking is only sent for 'anthropic' provider
 * @param {number} [thinking] - Thinking token budget (0 = disabled)
 * @returns {Object}
 */
function buildProviderOptions(providerName, thinking) {
  if (!thinking || thinking <= 0) return {};
  if (providerName !== 'anthropic') return {};
  return { anthropic: { thinking: { type: 'enabled', budgetTokens: thinking } } };
}

function getProviderMetadata(providerMetadata, providerName) {
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

  if (toolNames.includes('WebSearch') && providerName === 'anthropic' && factory?.tools) {
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
 * @param {string} opts.model - Model string (e.g. 'anthropic:claude-haiku-4-5' or 'claude-haiku-4-5')
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
    timings.streamStarted = Date.now();
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
  const { model } = await resolveModel(modelString, overrides);
  // Establish TCP+TLS by making a lightweight request to the provider's base URL
  const baseUrl = model.config?.baseURL;
  if (baseUrl) {
    try {
      await fetch(baseUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) }).catch(() => {});
    } catch {
      // Swallow — warming is best-effort
    }
  }
}
