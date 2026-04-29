import { describe, expect, it } from 'vitest';

import providersCatalog from '../../src/data/providers.json' with { type: 'json' };
import {
  DEFAULT_AI_MODEL,
  isSupportedAiModel,
  normalizeSupportedAiModel,
  SUPPORTED_AI_MODEL_TYPES,
} from '../../src/utils/supportedAiModels.js';
import webProvidersCatalog from '../../web/src/data/providers.json' with { type: 'json' };

function visibleModelTypes(catalog) {
  return Object.entries(catalog.providers).flatMap(([providerName, providerConfig]) =>
    Object.entries(providerConfig.models)
      .filter(([, modelConfig]) => modelConfig.availability?.visible !== false)
      .map(([modelName]) => `${providerName}:${modelName}`),
  );
}

describe('supported AI models', () => {
  it('derives the API allowlist from visible providers.json models', () => {
    expect(SUPPORTED_AI_MODEL_TYPES).toEqual(visibleModelTypes(providersCatalog));
    expect(SUPPORTED_AI_MODEL_TYPES).toContain('minimax:MiniMax-M2.1');
    expect(SUPPORTED_AI_MODEL_TYPES).toContain('openrouter:minimax/minimax-m2.5:free');
  });

  it('keeps the web Docker-local provider catalog synced with the backend catalog', () => {
    expect(webProvidersCatalog).toEqual(providersCatalog);
  });

  it('validates and normalizes against the generated allowlist', () => {
    expect(DEFAULT_AI_MODEL).toBe(SUPPORTED_AI_MODEL_TYPES[0]);
    expect(isSupportedAiModel('openrouter:minimax/minimax-m2.5:free')).toBe(true);
    expect(isSupportedAiModel('MINIMAX:minimax-m2.5')).toBe(true);
    expect(normalizeSupportedAiModel('MINIMAX:minimax-m2.5')).toBe('minimax:MiniMax-M2.5');
    expect(isSupportedAiModel('anthropic:claude-3-5-haiku')).toBe(false);
    expect(normalizeSupportedAiModel('anthropic:claude-3-5-haiku')).toBe(DEFAULT_AI_MODEL);
  });
});
