import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/logger.js', () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const { calculateCost, _normaliseModelId, _pricingMap } = await import('../../src/utils/aiCost.js');

describe('pricingMap', () => {
  it('should load models from the pricing JSON', () => {
    expect(_pricingMap.size).toBeGreaterThanOrEqual(23);
  });

  it('should have all keys lowercase', () => {
    for (const key of _pricingMap.keys()) {
      expect(key).toBe(key.toLowerCase());
    }
  });

  it('should have all four price fields per model', () => {
    for (const entry of _pricingMap.values()) {
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
});

describe('normaliseModelId', () => {
  it('should strip date suffixes', () => {
    expect(_normaliseModelId('claude-sonnet-4-5-20250929')).toBe('claude-sonnet-4-5');
    expect(_normaliseModelId('claude-haiku-4-5-20250514')).toBe('claude-haiku-4-5');
  });

  it('should leave models without date suffix unchanged', () => {
    expect(_normaliseModelId('claude-opus-4-6')).toBe('claude-opus-4-6');
    expect(_normaliseModelId('claude-sonnet-4')).toBe('claude-sonnet-4');
  });

  it('should handle unknown formats gracefully', () => {
    expect(_normaliseModelId('gpt-4o')).toBe('gpt-4o');
    expect(_normaliseModelId('custom-model')).toBe('custom-model');
  });
});

describe('calculateCost', () => {
  it('should calculate cost for an Anthropic model', () => {
    const cost = calculateCost('anthropic', 'claude-sonnet-4-6', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    // 1M input * $3/M + 1M output * $15/M = $18
    expect(cost).toBe(18);
  });

  it('should calculate cost for an OpenAI model', () => {
    const cost = calculateCost('openai', 'gpt-4.1', {
      inputTokens: 500_000,
      outputTokens: 100_000,
    });
    // 500k input * $2/M + 100k output * $8/M = $1 + $0.8 = $1.8
    expect(cost).toBeCloseTo(1.8);
  });

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

  it('should handle OpenAI models with zero cacheWrite correctly', () => {
    const cost = calculateCost('openai', 'gpt-4.1-mini', {
      inputTokens: 100_000,
      outputTokens: 50_000,
      cachedInputTokens: 20_000,
      cacheCreationInputTokens: 0,
    });
    // regularInput = 100000 - 20000 = 80000
    // 80000/1M * 0.4 + 20000/1M * 0.1 + 0 + 50000/1M * 1.6
    // = 0.032 + 0.002 + 0 + 0.08 = 0.114
    expect(cost).toBeCloseTo(0.114);
  });

  it('should resolve date-suffixed Anthropic models', () => {
    const cost = calculateCost('anthropic', 'claude-sonnet-4-5-20250929', {
      inputTokens: 1_000_000,
      outputTokens: 0,
    });
    // Should resolve to claude-sonnet-4-5: 1M * $3/M = $3
    expect(cost).toBe(3);
  });

  it('should be case-insensitive for model lookup', () => {
    const cost = calculateCost('ANTHROPIC', 'Claude-Sonnet-4-6', {
      inputTokens: 1_000_000,
      outputTokens: 0,
    });
    expect(cost).toBe(3);
  });

  it('should return 0 for unknown models', async () => {
    const { warn } = await import('../../src/logger.js');
    const cost = calculateCost('anthropic', 'nonexistent-model', {
      inputTokens: 100,
      outputTokens: 50,
    });
    expect(cost).toBe(0);
    expect(warn).toHaveBeenCalledWith(
      'Unknown model for cost calculation, returning 0',
      expect.objectContaining({ provider: 'anthropic', modelId: 'nonexistent-model' }),
    );
  });

  it('should default missing usage fields to 0', () => {
    const cost = calculateCost('anthropic', 'claude-haiku-4-5', {});
    expect(cost).toBe(0);
  });

  it('should handle missing usage object', () => {
    const cost = calculateCost('anthropic', 'claude-haiku-4-5');
    expect(cost).toBe(0);
  });

  it('should handle inputTokens that exclude cache tokens (no negative)', () => {
    const cost = calculateCost('minimax', 'MiniMax-M2.7', {
      inputTokens: 10,
      outputTokens: 0,
      cachedInputTokens: 500,
      cacheCreationInputTokens: 1_000,
    });
    // inputTokens (10) < cacheTotal (1500), so regularInput = 10 (not subtracted)
    // 10/1M * 0.3 + 500/1M * 0.06 + 1000/1M * 0.375 + 0
    // = 0.000003 + 0.00003 + 0.000375 + 0 = 0.000408
    expect(cost).toBeCloseTo(0.000408);
  });

  it('should include cache read and write costs for Anthropic models', () => {
    const cost = calculateCost('anthropic', 'claude-opus-4-6', {
      inputTokens: 100_000,
      outputTokens: 10_000,
      cachedInputTokens: 50_000,
      cacheCreationInputTokens: 20_000,
    });
    // regularInput = 100000 - 50000 - 20000 = 30000
    // 30000/1M * 5.0 + 50000/1M * 0.5 + 20000/1M * 6.25 + 10000/1M * 25.0
    // = 0.15 + 0.025 + 0.125 + 0.25 = 0.55
    expect(cost).toBeCloseTo(0.55);
  });
});

describe('calculateCost — concurrent calls', () => {
  it('should handle concurrent calls correctly (no shared mutable state)', () => {
    const results = [
      calculateCost('anthropic', 'claude-haiku-4-5', { inputTokens: 100, outputTokens: 50 }),
      calculateCost('openai', 'gpt-4.1', { inputTokens: 200, outputTokens: 100 }),
      calculateCost('minimax', 'minimax-m2.7', { inputTokens: 300, outputTokens: 150 }),
    ];

    for (const cost of results) {
      expect(typeof cost).toBe('number');
      expect(cost).toBeGreaterThan(0);
    }
  });
});
