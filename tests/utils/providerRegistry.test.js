import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock the logger so the rebuildSubscribers-error test can assert on warn().
// Placed BEFORE the providerRegistry import because vi.mock hoists — the
// registry's `import { warn } from '../logger.js'` will see the mock.
vi.mock('../../src/logger.js', () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  addWebSocketTransport: vi.fn(),
  removeWebSocketTransport: vi.fn(),
}));

import { warn } from '../../src/logger.js';
import {
  _ALLOWED_API_SHAPES,
  _resetRegistry,
  _validateProvider,
  _validateRegistryPayload,
  getCapabilities,
  getModelConfig,
  getProviderConfig,
  listProviderModelTypes,
  listProviders,
  normaliseModelId,
  onRegistryRebuild,
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

  it('resolves OpenRouter free variant IDs with colons', () => {
    const model = getModelConfig('openrouter', 'minimax/minimax-m2.5:free');
    expect(model).not.toBeNull();
    expect(model.id).toBe('minimax/minimax-m2.5:free');
    expect(model.pricing.input).toBe(0);
    expect(model.pricing.output).toBe(0);
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

describe('listProviderModelTypes', () => {
  it('returns provider:model identifiers for every catalog model in order', () => {
    expect(listProviderModelTypes()).toEqual([
      'minimax:MiniMax-M2.7',
      'minimax:MiniMax-M2.7-highspeed',
      'minimax:MiniMax-M2.5',
      'minimax:MiniMax-M2.5-highspeed',
      'minimax:MiniMax-M2.1',
      'minimax:MiniMax-M2.1-highspeed',
      'minimax:MiniMax-M2',
      'minimax:MiniMax-M2-stable',
      'moonshot:kimi-k2.6',
      'moonshot:kimi-k2.5',
      'moonshot:kimi-k2-thinking',
      'openrouter:minimax/minimax-m2.5',
      'openrouter:minimax/minimax-m2.5:free',
      'openrouter:moonshotai/kimi-k2.6',
      'openrouter:moonshotai/kimi-k2.5',
      'openrouter:moonshotai/kimi-k2-thinking',
      'openrouter:moonshotai/kimi-k2-0905',
      'openrouter:moonshotai/kimi-k2',
    ]);
  });

  it('can limit results to visible models', () => {
    const allModels = listProviderModelTypes();
    const visibleModels = listProviderModelTypes({ visibleOnly: true });
    const allModelSet = new Set(allModels);

    expect(visibleModels.length).toBeLessThanOrEqual(allModels.length);
    expect(visibleModels.every((modelType) => allModelSet.has(modelType))).toBe(true);
  });

  it('returns a fresh array per call', () => {
    const a = listProviderModelTypes();
    a.push('hacked');
    expect(listProviderModelTypes()).not.toContain('hacked');
  });
});

// ── Regression coverage for PR #584 round-3 comments ────────────────────────

// Build a structurally-valid provider config. Individual tests override the
// specific field under test (baseUrl, models, etc.).
const validBaseConfig = () => ({
  displayName: 'Test Provider',
  apiShape: 'anthropic',
  envKey: 'TEST_API_KEY',
  capabilities: { webSearch: false, thinking: false },
  models: {
    'test-model': {
      pricing: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
    },
  },
});

describe('validateProvider — baseUrl variants (regression for macroscope 3120523566)', () => {
  it('accepts an omitted baseUrl and normalises to null', () => {
    const cfg = validBaseConfig();
    // Simulate provider config that simply doesn't declare baseUrl.
    expect('baseUrl' in cfg).toBe(false);
    const result = _validateProvider('omitted', cfg);
    expect(result.baseUrl).toBeNull();
  });

  it('accepts an explicit baseUrl: null and normalises to null', () => {
    const cfg = { ...validBaseConfig(), baseUrl: null };
    const result = _validateProvider('explicitnull', cfg);
    expect(result.baseUrl).toBeNull();
  });

  it('accepts a non-empty string baseUrl verbatim', () => {
    const cfg = { ...validBaseConfig(), baseUrl: 'https://example.test/v1' };
    const result = _validateProvider('withurl', cfg);
    expect(result.baseUrl).toBe('https://example.test/v1');
  });

  it('rejects an empty-string baseUrl', () => {
    const cfg = { ...validBaseConfig(), baseUrl: '' };
    expect(() => _validateProvider('emptyurl', cfg)).toThrow(/baseUrl must be/);
  });

  it('rejects a non-string / non-null baseUrl', () => {
    const cfg = { ...validBaseConfig(), baseUrl: 42 };
    expect(() => _validateProvider('numericurl', cfg)).toThrow(/baseUrl must be/);
  });
});

describe('validateProvider — models guards (regression for coderabbit 3120534468)', () => {
  it('rejects models: [] (empty array)', () => {
    const cfg = { ...validBaseConfig(), models: [] };
    expect(() => _validateProvider('arrmodelsEmpty', cfg)).toThrow(
      /must declare a non-empty "models" object/,
    );
  });

  it('rejects models: [{…}] (non-empty array)', () => {
    const cfg = {
      ...validBaseConfig(),
      models: [{ pricing: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 } }],
    };
    expect(() => _validateProvider('arrmodelsFull', cfg)).toThrow(
      /must declare a non-empty "models" object/,
    );
  });

  it('still rejects missing models object', () => {
    const cfg = validBaseConfig();
    delete cfg.models;
    expect(() => _validateProvider('nomodels', cfg)).toThrow(
      /must declare a non-empty "models" object/,
    );
  });

  it('still rejects an empty models object', () => {
    const cfg = { ...validBaseConfig(), models: {} };
    expect(() => _validateProvider('emptymodels', cfg)).toThrow(
      /must declare a non-empty "models" object/,
    );
  });
});

describe('validateProvider — duplicate model IDs (regression for coderabbit 3120731422)', () => {
  it('rejects two model IDs that differ only in letter casing', () => {
    const cfg = {
      ...validBaseConfig(),
      models: {
        'Test-Model': {
          pricing: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
        },
        'test-model': {
          pricing: { input: 2, output: 2, cacheRead: 0, cacheWrite: 0 },
        },
      },
    };
    expect(() => _validateProvider('dupmodel', cfg)).toThrow(/duplicate model IDs/);
    expect(() => _validateProvider('dupmodel', cfg)).toThrow(/"Test-Model"/);
    expect(() => _validateProvider('dupmodel', cfg)).toThrow(/"test-model"/);
    expect(() => _validateProvider('dupmodel', cfg)).toThrow(/case-insensitive collision/);
  });

  it('accepts two model IDs that differ in meaningful characters', () => {
    const cfg = {
      ...validBaseConfig(),
      models: {
        'model-a': { pricing: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 } },
        'model-b': { pricing: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 } },
      },
    };
    const result = _validateProvider('twomodels', cfg);
    expect(result.models.size).toBe(2);
  });
});

describe('_validateRegistryPayload — top-level guards (regression for macroscope 3120729752)', () => {
  const buildPayload = (providers) => ({ providers });

  const validProviderEntry = () => ({
    displayName: 'Test Provider',
    apiShape: 'anthropic',
    envKey: 'TEST_API_KEY',
    capabilities: { webSearch: false, thinking: false },
    models: {
      'test-model': { pricing: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 } },
    },
  });

  it('rejects providers declared as an array', () => {
    const payload = buildPayload([validProviderEntry()]);
    expect(() => _validateRegistryPayload(payload)).toThrow(/missing required `providers` object/);
  });

  it('rejects an empty-array providers block the same way', () => {
    const payload = buildPayload([]);
    expect(() => _validateRegistryPayload(payload)).toThrow(/missing required `providers` object/);
  });

  it('rejects duplicate provider names that differ only in casing', () => {
    const payload = buildPayload({
      Foo: validProviderEntry(),
      foo: validProviderEntry(),
    });
    expect(() => _validateRegistryPayload(payload)).toThrow(/duplicate provider names/);
    expect(() => _validateRegistryPayload(payload)).toThrow(/case-insensitive collision/);
  });

  it('accepts a well-formed payload and returns a populated Map', () => {
    const payload = buildPayload({ acme: validProviderEntry() });
    const result = _validateRegistryPayload(payload);
    expect(result.size).toBe(1);
    expect(result.get('acme').name).toBe('acme');
  });

  it('rejects non-boolean model availability.visible values', () => {
    const payload = buildPayload({
      acme: {
        ...validProviderEntry(),
        models: {
          'test-model': {
            availability: { visible: 'yes' },
            pricing: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
          },
        },
      },
    });

    expect(() => _validateRegistryPayload(payload)).toThrow(
      /availability\.visible must be boolean/,
    );
  });

  it('rejects a missing top-level providers key', () => {
    expect(() => _validateRegistryPayload({})).toThrow(/missing required `providers` object/);
  });

  it('rejects a null payload', () => {
    expect(() => _validateRegistryPayload(null)).toThrow(/top-level must be an object/);
  });
});

describe('rebuildSubscribers — error logging (regression for coderabbit 3120534472)', () => {
  afterEach(() => {
    warn.mockClear();
  });

  it('logs a warning when a rebuild subscriber throws and does NOT break the registry', () => {
    const unsubscribe = onRegistryRebuild(() => {
      throw new Error('subscriber blew up');
    });
    try {
      expect(() => _resetRegistry()).not.toThrow();
      expect(warn).toHaveBeenCalledWith(
        'providerRegistry: rebuild subscriber threw',
        expect.objectContaining({
          error: expect.objectContaining({ message: 'subscriber blew up' }),
        }),
      );
    } finally {
      unsubscribe();
    }
  });

  it('continues invoking remaining subscribers after one throws', () => {
    const order = [];
    const unsubA = onRegistryRebuild(() => {
      order.push('A');
      throw new Error('A failed');
    });
    const unsubB = onRegistryRebuild(() => {
      order.push('B');
    });
    try {
      _resetRegistry();
      expect(order).toEqual(['A', 'B']);
      expect(warn).toHaveBeenCalledTimes(1); // A's throw logs once; B is clean
    } finally {
      unsubA();
      unsubB();
    }
  });

  it('captures the subscriber name (or "anonymous") in the warn payload', () => {
    function mySubscriberFn() {
      throw new Error('named throw');
    }
    const unsub = onRegistryRebuild(mySubscriberFn);
    try {
      _resetRegistry();
      expect(warn).toHaveBeenCalledWith(
        'providerRegistry: rebuild subscriber threw',
        expect.objectContaining({
          subscriber: 'mySubscriberFn',
          error: expect.objectContaining({ message: 'named throw' }),
        }),
      );
    } finally {
      unsub();
    }
  });
});
