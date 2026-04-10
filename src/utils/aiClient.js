/**
 * AI Client — Vercel AI SDK wrapper for the bot's AI inference needs.
 *
 * Replaces the old CLIProcess subprocess manager with direct SDK calls.
 * Supports multi-provider model selection via `provider:model` strings
 * (e.g. 'anthropic:claude-sonnet-4-6'). Bare model names default to Anthropic.
 *
 * Security note: Unlike the old buildEnv() which isolated subprocess environment
 * variables, the SDK runs in-process with access to all of process.env. This is
 * safe because the SDK only sends credentials we explicitly pass via `apiKey` —
 * it does not read arbitrary env vars or leak DISCORD_TOKEN, DATABASE_URL, etc.
 */

import { createHash } from 'node:crypto';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText, stepCountIs, streamText } from 'ai';
import { debug, error as logError, warn } from '../logger.js';
import { calculateCost } from './aiCost.js';
import { AIClientError, isRetryable } from './errors.js';

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

      // Don't retry non-transient errors
      if (!isRetryable(err, { statusCode: err.statusCode })) throw err;

      // Calculate delay: min(1000 * 2^attempt, 15_000) + jitter
      const retryAfter = err.statusCode === 429 ? (parseFloat(err.headers?.['retry-after']) || 0) * 1000 : 0;
      const exponential = Math.min(1000 * 2 ** attempt, 15_000);
      const jitter = Math.random() * 1000;
      const delay = Math.max(exponential + jitter, retryAfter);

      warn('Retrying AI request', { attempt: attempt + 1, maxRetries, delayMs: Math.round(delay), reason: err.message });

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

// ── Provider cache ──────────────────────────────────────────────────────────

/**
 * Cache provider instances by (providerName, apiKey, baseUrl) tuple.
 * The bot has at most ~4 distinct configurations (classifier, responder, tldr, automod).
 * @type {Map<string, import('@ai-sdk/anthropic').AnthropicProvider>}
 */
const providerCache = new Map();

/**
 * Parse a model string and resolve the provider instance + model object.
 *
 * @param {string} modelString - Model identifier, optionally prefixed with provider
 *   (e.g. 'anthropic:claude-sonnet-4-6' or bare 'claude-haiku-4-5').
 * @param {{ apiKey?: string, baseUrl?: string }} [overrides]
 * @returns {{ model: object, providerName: string, modelId: string, factory: object }}
 */
function resolveModel(modelString, overrides = {}) {
  const colonIdx = modelString.indexOf(':');
  const providerName = colonIdx > 0 ? modelString.slice(0, colonIdx) : 'anthropic';
  const modelId = colonIdx > 0 ? modelString.slice(colonIdx + 1) : modelString;

  const keyHash = overrides.apiKey
    ? createHash('sha256').update(overrides.apiKey).digest('hex').slice(0, 12)
    : 'default';
  const cacheKey = `${providerName}:${keyHash}:${overrides.baseUrl ?? 'default'}`;

  if (!providerCache.has(cacheKey)) {
    if (providerName === 'anthropic') {
      providerCache.set(
        cacheKey,
        createAnthropic({
          apiKey: overrides.apiKey || process.env.ANTHROPIC_API_KEY,
          ...(overrides.baseUrl && { baseURL: overrides.baseUrl }),
        }),
      );
    } else {
      throw new AIClientError(`Unsupported AI provider: ${providerName}`, 'api');
    }
  }

  const factory = providerCache.get(cacheKey);
  return { model: factory(modelId), providerName, modelId, factory };
}

// ── Option builders ─────────────────────────────────────────────────────────

/**
 * Build provider-specific options (e.g. thinking tokens).
 * @param {string} providerName
 * @param {number} [thinking] - Thinking token budget (0 = disabled)
 * @returns {Object}
 */
function buildProviderOptions(providerName, thinking) {
  if (!thinking || thinking <= 0) return {};
  return { [providerName]: { thinking: { type: 'enabled', budgetTokens: thinking } } };
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
  const unknown = toolNames.filter(t => !knownTools.includes(t));
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
  if (externalSignal) {
    onExternalAbort = () => controller.abort();
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

  const { model, providerName, modelId, factory } = resolveModel(modelString, { apiKey, baseUrl });
  const tools = buildTools(toolNames, providerName, factory);
  const providerOptions = buildProviderOptions(providerName, thinking);
  const hasTools = Object.keys(tools).length > 0;

  const { signal, cleanup } = createAbortController(timeout, externalSignal);
  const start = Date.now();

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

    const usage = result.totalUsage ?? result.usage ?? {};
    const anthropicMeta = result.providerMetadata?.anthropic ?? {};
    const cachedInputTokens = anthropicMeta.cacheReadInputTokens ?? 0;
    const costUsd = await calculateCost(providerName, modelId, {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cachedInputTokens,
    });

    return {
      text: result.text,
      usage,
      costUsd,
      durationMs: Date.now() - start,
      finishReason: result.finishReason,
      sources: result.sources ?? [],
      providerMetadata: result.providerMetadata ?? {},
    };
  } catch (err) {
    if (err instanceof AIClientError) throw err;
    if (signal.aborted) {
      throw new AIClientError('Request timed out or was cancelled', 'timeout');
    }
    throw new AIClientError(`API error: ${err.message}`, 'api', { statusCode: err.statusCode });
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

  const { model, providerName, modelId, factory } = resolveModel(modelString, { apiKey, baseUrl });
  const tools = buildTools(toolNames, providerName, factory);
  const providerOptions = buildProviderOptions(providerName, thinking);
  const hasTools = Object.keys(tools).length > 0;

  const { signal, cleanup } = createAbortController(timeout, externalSignal);
  const start = Date.now();

  try {
    const result = await withRetry(
      () =>
        streamText({
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
                if (cbResult?.catch) cbResult.catch(err => logError('onChunk callback error', { error: err.message }));
              } catch (err) {
                logError('onChunk callback error (sync)', { error: err.message });
              }
            }
          },
        }),
      { maxRetries: 3, signal },
    );

    // Await final results from the stream
    const text = await result.text;
    const usage = (await result.totalUsage) ?? (await result.usage) ?? {};
    const finishReason = await result.finishReason;
    const sources = (await result.sources) ?? [];
    const providerMetadata = (await result.providerMetadata) ?? {};

    const anthropicMeta = providerMetadata?.anthropic ?? {};
    const cachedInputTokens = anthropicMeta.cacheReadInputTokens ?? 0;
    const costUsd = await calculateCost(providerName, modelId, {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cachedInputTokens,
    });

    return {
      text,
      usage,
      costUsd,
      durationMs: Date.now() - start,
      finishReason,
      sources,
      providerMetadata,
    };
  } catch (err) {
    if (err instanceof AIClientError) throw err;
    if (signal.aborted) {
      throw new AIClientError('Request timed out or was cancelled', 'timeout');
    }
    throw new AIClientError(`API error: ${err.message}`, 'api', { statusCode: err.statusCode });
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
