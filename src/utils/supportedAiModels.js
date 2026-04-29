export const DEFAULT_AI_MODEL = 'minimax:MiniMax-M2.7';

export const SUPPORTED_AI_MODEL_TYPES = Object.freeze([
  DEFAULT_AI_MODEL,
  'minimax:MiniMax-M2.7-highspeed',
  'minimax:MiniMax-M2.5',
  'minimax:MiniMax-M2.5-highspeed',
  'moonshot:kimi-k2.6',
  'moonshot:kimi-k2.5',
  'moonshot:kimi-k2-thinking',
  'openrouter:minimax/minimax-m2.5',
  'openrouter:moonshotai/kimi-k2.6',
]);

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
