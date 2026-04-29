import { listProviderModelTypes } from './providerRegistry.js';

export const FALLBACK_AI_MODEL = 'minimax:MiniMax-M2.7';

export const SUPPORTED_AI_MODEL_TYPES = Object.freeze(
  listProviderModelTypes({ visibleOnly: true }),
);

export const DEFAULT_AI_MODEL = SUPPORTED_AI_MODEL_TYPES[0] ?? FALLBACK_AI_MODEL;

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isSupportedAiModel(value) {
  return typeof value === 'string' && SUPPORTED_AI_MODEL_TYPES.includes(value);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeSupportedAiModel(value) {
  return isSupportedAiModel(value) ? value : DEFAULT_AI_MODEL;
}
