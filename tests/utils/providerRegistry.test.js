import { describe, expect, it } from 'vitest';

import {
  _ALLOWED_API_SHAPES,
  getCapabilities,
  getModelConfig,
  getProviderConfig,
  listProviders,
  normaliseModelId,
  supportsShape,
} from '../../src/utils/providerRegistry.js';

describe('providerRegistry — eager load + schema', () => {
  it('loads the catalog at import without throwing', () => {
    const providers = listProviders();
    expect(providers).toContain('minimax');
    expect(providers).toContain('moonshot');
    expect(providers).toContain('openrouter');
  });

  it('exposes the allow-list of supported API shapes', () => {
    expect(Array.from(_ALLOWED_API_SHAPES)).toEqual(['anthropic']);
    expect(() => _ALLOWED_API_SHAPES.push('openai')).toThrow();
  });

  it('normalises apiShape to an array regardless of JSON form', () => {
    const mm = getProviderConfig('minimax');
    expect(Array.isArray(mm.apiShape)).toBe(true);
    expect(mm.apiShape).toContain('anthropic');
  });
});

describe('getProviderConfig', () => {
  it('returns a config for a known provider', () => {
    const cfg = getProviderConfig('minimax');
    expect(cfg).not.toBeNull();
    expect(cfg.name).toBe('minimax');
    expect(cfg.displayName).toBe('MiniMax');
    expect(cfg.envKey).toBe('MINIMAX_API_KEY');
    expect(cfg.baseUrl).toContain('minimax');
    expect(cfg.capabilities).toEqual({ webSearch: false, thinking: false });
    expect(cfg.models.size).toBeGreaterThan(0);
  });

  it('is case-insensitive', () => {
    expect(getProviderConfig('MINIMAX')).not.toBeNull();
    expect(getProviderConfig('MiniMax')).not.toBeNull();
    expect(getProviderConfig('moonshot')?.name).toBe('moonshot');
  });

  it('returns null for unknown provider', () => {
    expect(getProviderConfig('nonexistent')).toBeNull();
  });

  it('returns null for falsy / non-string input', () => {
    expect(getProviderConfig('')).toBeNull();
    expect(getProviderConfig(null)).toBeNull();
    expect(getProviderConfig(undefined)).toBeNull();
    expect(getProviderConfig(123)).toBeNull();
  });
});

describe('getModelConfig', () => {
  it('returns a model config for a known provider:model', () => {
    const model = getModelConfig('minimax', 'MiniMax-M2.7');
    expect(model).not.toBeNull();
    expect(model.id).toBe('MiniMax-M2.7');
    expect(model.pricing.input).toBe(0.3);
    expect(model.pricing.output).toBe(1.2);
    expect(model.availability.visible).toBe(true);
  });

  it('is case-insensitive on model ID', () => {
    expect(getModelConfig('minimax', 'minimax-m2.7')).not.toBeNull();
    expect(getModelConfig('minimax', 'MINIMAX-M2.7')).not.toBeNull();
  });

  it('falls back via date-suffix stripping', () => {
    const model = getModelConfig('minimax', 'MiniMax-M2.7-20251101');
    expect(model).not.toBeNull();
    expect(model.id).toBe('MiniMax-M2.7');
  });

  it('returns null for an unknown model', () => {
    expect(getModelConfig('minimax', 'nonexistent-model')).toBeNull();
  });

  it('returns null for an unknown provider', () => {
    expect(getModelConfig('nonexistent', 'any-model')).toBeNull();
  });

  it('returns null for falsy / non-string modelId', () => {
    expect(getModelConfig('minimax', '')).toBeNull();
    expect(getModelConfig('minimax', null)).toBeNull();
    expect(getModelConfig('minimax', undefined)).toBeNull();
  });

  it('resolves OpenRouter namespaced model IDs', () => {
    const model = getModelConfig('openrouter', 'moonshotai/kimi-k2.6');
    expect(model).not.toBeNull();
    expect(model.id).toBe('moonshotai/kimi-k2.6');
  });
});

describe('getCapabilities', () => {
  it('returns the provider capability flags', () => {
    expect(getCapabilities('minimax')).toEqual({ webSearch: false, thinking: false });
    expect(getCapabilities('moonshot')).toEqual({ webSearch: false, thinking: false });
    expect(getCapabilities('openrouter')).toEqual({ webSearch: false, thinking: false });
  });

  it('returns a conservative default {false,false} for unknown providers', () => {
    expect(getCapabilities('nonexistent')).toEqual({ webSearch: false, thinking: false });
  });

  it('returns a fresh object so callers cannot mutate registry state', () => {
    const a = getCapabilities('minimax');
    a.webSearch = true;
    const b = getCapabilities('minimax');
    expect(b.webSearch).toBe(false);
  });
});

describe('supportsShape', () => {
  it('returns true when a provider declares the shape', () => {
    expect(supportsShape('minimax', 'anthropic')).toBe(true);
    expect(supportsShape('moonshot', 'anthropic')).toBe(true);
    expect(supportsShape('openrouter', 'anthropic')).toBe(true);
  });

  it('returns false when a provider does not declare the shape', () => {
    expect(supportsShape('minimax', 'openai')).toBe(false);
  });

  it('returns false for unknown providers', () => {
    expect(supportsShape('nonexistent', 'anthropic')).toBe(false);
  });

  it('returns false for non-string shape input', () => {
    expect(supportsShape('minimax', null)).toBe(false);
    expect(supportsShape('minimax', undefined)).toBe(false);
    expect(supportsShape('minimax', 123)).toBe(false);
  });
});

describe('normaliseModelId', () => {
  it('strips an 8-digit date suffix', () => {
    expect(normaliseModelId('MiniMax-M2.7-20251101')).toBe('MiniMax-M2.7');
    expect(normaliseModelId('claude-sonnet-4-5-20250929')).toBe('claude-sonnet-4-5');
  });

  it('leaves IDs without a date suffix unchanged', () => {
    expect(normaliseModelId('MiniMax-M2.7')).toBe('MiniMax-M2.7');
    expect(normaliseModelId('kimi-k2.6')).toBe('kimi-k2.6');
  });

  it('returns the input unchanged for non-string values', () => {
    expect(normaliseModelId(null)).toBe(null);
    expect(normaliseModelId(undefined)).toBe(undefined);
    expect(normaliseModelId(42)).toBe(42);
  });
});

describe('listProviders', () => {
  it('returns the canonical provider names in original casing', () => {
    const names = listProviders();
    expect(names).toEqual(expect.arrayContaining(['minimax', 'moonshot', 'openrouter']));
  });

  it('returns a fresh array per call', () => {
    const a = listProviders();
    a.push('hacked');
    const b = listProviders();
    expect(b).not.toContain('hacked');
  });
});
