import { listProviderModelTypes } from './providerRegistry.js';

export const FALLBACK_AI_MODEL = 'minimax:MiniMax-M2.7';

export const SUPPORTED_AI_MODEL_TYPES = Object.freeze(
  listProviderModelTypes({ visibleOnly: true }),
);

export const DEFAULT_AI_MODEL = SUPPORTED_AI_MODEL_TYPES[0] ?? FALLBACK_AI_MODEL;

const SUPPORTED_AI_MODEL_TYPE_BY_LOWERCASE = new Map(
  SUPPORTED_AI_MODEL_TYPES.map((modelType) => [modelType.toLowerCase(), modelType]),
);

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isSupportedAiModel(value) {
  return typeof value === 'string' && SUPPORTED_AI_MODEL_TYPE_BY_LOWERCASE.has(value.toLowerCase());
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeSupportedAiModel(value) {
  if (typeof value !== 'string') return DEFAULT_AI_MODEL;
  return SUPPORTED_AI_MODEL_TYPE_BY_LOWERCASE.get(value.toLowerCase()) ?? DEFAULT_AI_MODEL;
}
