import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/logger.js', () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const { calculateCost, _normaliseModelId, _getPricingMap } = await import(
  '../../src/utils/aiCost.js'
);

describe('pricingMap', () => {
  it('should load models from the provider registry', () => {
    // minimax (8 — including M2-stable) + moonshot (3) + openrouter (6) = 17 minimum
    expect(_getPricingMap().size).toBeGreaterThanOrEqual(17);
  });

  it('should have all keys lowercase', () => {
    for (const key of _getPricingMap().keys()) {
      expect(key).toBe(key.toLowerCase());
    }
  });

  it('should have all four price fields per model', () => {
    for (const entry of _getPricingMap().values()) {
      expect(entry).toHaveProperty('input');
      expect(entry).toHaveProperty('output');
      expect(entry).toHaveProperty('cacheRead');
      expect(entry).toHaveProperty('cacheWrite');
      expect(typeof entry.input).toBe('number');
      expect(typeof entry.output).toBe('number');
      expect(typeof entry.cacheRead).toBe('number');
      expect(typeof entry.cacheWrite).toBe('number');
    }
  });

  it('should include the three supported providers', () => {
    const providers = new Set(Array.from(_getPricingMap().keys(), (k) => k.split(':')[0]));
    expect(providers.has('minimax')).toBe(true);
    expect(providers.has('moonshot')).toBe(true);
    expect(providers.has('openrouter')).toBe(true);
  });
});

describe('normaliseModelId', () => {
  it('should strip date suffixes', () => {
    expect(_normaliseModelId('claude-sonnet-4-5-20250929')).toBe('claude-sonnet-4-5');
    expect(_normaliseModelId('MiniMax-M2.7-20251101')).toBe('MiniMax-M2.7');
  });

  it('should leave models without date suffix unchanged', () => {
    expect(_normaliseModelId('MiniMax-M2.7')).toBe('MiniMax-M2.7');
    expect(_normaliseModelId('kimi-k2.6')).toBe('kimi-k2.6');
  });

  it('should handle unknown formats gracefully', () => {
    expect(_normaliseModelId('custom-model')).toBe('custom-model');
    expect(_normaliseModelId('moonshotai/kimi-k2.6')).toBe('moonshotai/kimi-k2.6');
  });
});

describe('calculateCost', () => {
  it('should calculate cost for a MiniMax model', () => {
    const cost = calculateCost('minimax', 'MiniMax-M2.7', {
      inputTokens: 10_000,
      outputTokens: 5_000,
      cachedInputTokens: 2_000,
      cacheCreationInputTokens: 1_000,
    });
    // regularInput = 10000 - 2000 - 1000 = 7000
    // 7000/1M * 0.3 + 2000/1M * 0.06 + 1000/1M * 0.375 + 5000/1M * 1.2
    // = 0.0021 + 0.00012 + 0.000375 + 0.006 = 0.008595
    expect(cost).toBeCloseTo(0.008595);
  });

  it('should calculate cost for a Moonshot Kimi model', () => {
    const cost = calculateCost('moonshot', 'kimi-k2.6', {
      inputTokens: 1_000_000,
      outputTokens: 500_000,
    });
    // 1M * $0.95/M + 500k/1M * $4/M = 0.95 + 2.0 = 2.95
    expect(cost).toBeCloseTo(2.95);
  });

  it('should calculate cost for an OpenRouter model', () => {
    const cost = calculateCost('openrouter', 'minimax/minimax-m2.5', {
      inputTokens: 2_000_000,
      outputTokens: 100_000,
    });
    // 2M * $0.15/M + 100k/1M * $1.20/M = 0.3 + 0.12 = 0.42
    expect(cost).toBeCloseTo(0.42);
  });

  it('should handle zero cacheWrite correctly (Moonshot K2.5)', () => {
    const cost = calculateCost('moonshot', 'kimi-k2.5', {
      inputTokens: 100_000,
      outputTokens: 50_000,
      cachedInputTokens: 20_000,
      cacheCreationInputTokens: 0,
    });
    // Moonshot K2.5 official rates: input $0.60, output $3.00, cacheRead $0.10,
    // cacheWrite $0 (see providers.json).
    // regularInput = 100000 - 20000 = 80000
    // 80000/1M * 0.60 + 20000/1M * 0.10 + 0 + 50000/1M * 3.00
    // = 0.048 + 0.002 + 0 + 0.15 = 0.200
    expect(cost).toBeCloseTo(0.2);
  });

  it('should resolve date-suffixed model IDs via the registry', () => {
    const cost = calculateCost('minimax', 'MiniMax-M2.7-20251101', {
      inputTokens: 1_000_000,
      outputTokens: 0,
    });
    // Should resolve to MiniMax-M2.7: 1M * $0.30/M = $0.30
    expect(cost).toBeCloseTo(0.3);
  });

  it('should be case-insensitive for provider and model lookup', () => {
    const cost = calculateCost('MINIMAX', 'minimax-m2.7', {
      inputTokens: 1_000_000,
      outputTokens: 0,
    });
    expect(cost).toBeCloseTo(0.3);
  });

  it('should return 0 for unknown models', async () => {
    const { warn } = await import('../../src/logger.js');
    const cost = calculateCost('minimax', 'nonexistent-model', {
      inputTokens: 100,
      outputTokens: 50,
    });
    expect(cost).toBe(0);
    expect(warn).toHaveBeenCalledWith(
      'Unknown model for cost calculation, returning 0',
      expect.objectContaining({ provider: 'minimax', modelId: 'nonexistent-model' }),
    );
  });

  it('should return 0 for unknown providers', () => {
    const cost = calculateCost('nonexistent-provider', 'any-model', {
      inputTokens: 100,
      outputTokens: 50,
    });
    expect(cost).toBe(0);
  });

  it('should default missing usage fields to 0', () => {
    const cost = calculateCost('minimax', 'MiniMax-M2.7', {});
    expect(cost).toBe(0);
  });

  it('should handle missing usage object', () => {
    const cost = calculateCost('minimax', 'MiniMax-M2.7');
    expect(cost).toBe(0);
  });

  it('should handle inputTokens that exclude cache tokens (no negative)', () => {
    const cost = calculateCost('minimax', 'MiniMax-M2.7', {
      inputTokens: 10,
      outputTokens: 0,
      cachedInputTokens: 500,
      cacheCreationInputTokens: 1_000,
    });
    // inputTokens (10) < cacheTotal (1500), so regularInput clamps to 0
    // 0 + 500/1M * 0.06 + 1000/1M * 0.375 + 0
    // = 0 + 0.00003 + 0.000375 + 0 = 0.000405
    expect(cost).toBeCloseTo(0.000405);
  });

  it('should include cache read and write costs for MiniMax models', () => {
    const cost = calculateCost('minimax', 'MiniMax-M2.7', {
      inputTokens: 100_000,
      outputTokens: 10_000,
      cachedInputTokens: 50_000,
      cacheCreationInputTokens: 20_000,
    });
    // regularInput = 100000 - 50000 - 20000 = 30000
    // 30000/1M * 0.3 + 50000/1M * 0.06 + 20000/1M * 0.375 + 10000/1M * 1.2
    // = 0.009 + 0.003 + 0.0075 + 0.012 = 0.0315
    expect(cost).toBeCloseTo(0.0315);
  });
});

describe('calculateCost — concurrent calls', () => {
  it('should handle concurrent calls correctly (no shared mutable state)', () => {
    const results = [
      calculateCost('minimax', 'MiniMax-M2.7', { inputTokens: 100, outputTokens: 50 }),
      calculateCost('moonshot', 'kimi-k2.6', { inputTokens: 200, outputTokens: 100 }),
      calculateCost('openrouter', 'moonshotai/kimi-k2.6', { inputTokens: 300, outputTokens: 150 }),
    ];

    for (const cost of results) {
      expect(typeof cost).toBe('number');
      expect(cost).toBeGreaterThan(0);
    }
  });
});
