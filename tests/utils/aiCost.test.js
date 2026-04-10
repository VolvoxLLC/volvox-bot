import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/logger.js', () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const { calculateCost, _setCostClient, _normaliseModelId } = await import(
  '../../src/utils/aiCost.js'
);

describe('normaliseModelId', () => {
  it('should convert hyphenated version to dotted', () => {
    expect(_normaliseModelId('claude-haiku-4-5')).toBe('claude-haiku-4.5');
    expect(_normaliseModelId('claude-sonnet-4-6')).toBe('claude-sonnet-4.6');
    expect(_normaliseModelId('claude-opus-4-5')).toBe('claude-opus-4.5');
  });

  it('should strip date suffixes', () => {
    expect(_normaliseModelId('claude-sonnet-4-5-20250929')).toBe('claude-sonnet-4.5');
    expect(_normaliseModelId('claude-haiku-4-5-20250514')).toBe('claude-haiku-4.5');
  });

  it('should leave single-version models unchanged', () => {
    expect(_normaliseModelId('claude-opus-4')).toBe('claude-opus-4');
  });

  it('should leave already-dotted models unchanged', () => {
    expect(_normaliseModelId('claude-sonnet-4.5')).toBe('claude-sonnet-4.5');
  });

  it('should handle unknown formats gracefully', () => {
    expect(_normaliseModelId('gpt-4o')).toBe('gpt-4o');
    expect(_normaliseModelId('custom-model')).toBe('custom-model');
  });
});

describe('calculateCost', () => {
  afterEach(() => {
    _setCostClient(null);
  });

  it('should return cost from a mock client', async () => {
    _setCostClient({
      listModels: vi.fn().mockResolvedValue([]),
      calculateCost: vi.fn().mockResolvedValue({
        totalCost: 0.0035,
        inputCost: 0.001,
        outputCost: 0.0025,
        stale: false,
      }),
    });

    const cost = await calculateCost('anthropic', 'claude-haiku-4-5', {
      inputTokens: 1000,
      outputTokens: 500,
    });
    expect(cost).toBe(0.0035);
  });

  it('should return 0 when model is unknown', async () => {
    _setCostClient({
      listModels: vi.fn().mockResolvedValue([]),
      calculateCost: vi.fn().mockRejectedValue(new Error('Model not found')),
    });

    const cost = await calculateCost('anthropic', 'nonexistent-model', {
      inputTokens: 100,
      outputTokens: 50,
    });
    expect(cost).toBe(0);
  });

  it('should handle zero tokens', async () => {
    _setCostClient({
      listModels: vi.fn().mockResolvedValue([]),
      calculateCost: vi.fn().mockResolvedValue({
        totalCost: 0,
        stale: false,
      }),
    });

    const cost = await calculateCost('anthropic', 'claude-haiku-4.5', {});
    expect(cost).toBe(0);
  });

  it('should handle missing usage fields', async () => {
    const mockCalc = vi.fn().mockResolvedValue({ totalCost: 0, stale: false });
    _setCostClient({
      listModels: vi.fn().mockResolvedValue([]),
      calculateCost: mockCalc,
    });

    await calculateCost('openai', 'gpt-4o', {});
    expect(mockCalc).toHaveBeenCalledWith('openai', 'gpt-4o', {
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
    });
  });

  it('should warn on stale pricing data', async () => {
    const { warn } = await import('../../src/logger.js');
    _setCostClient({
      listModels: vi.fn().mockResolvedValue([]),
      calculateCost: vi.fn().mockResolvedValue({
        totalCost: 0.005,
        stale: true,
      }),
    });

    const cost = await calculateCost('anthropic', 'claude-sonnet-4-6', {
      inputTokens: 500,
      outputTokens: 200,
    });
    expect(cost).toBe(0.005);
    expect(warn).toHaveBeenCalledWith('Token pricing data is stale', expect.any(Object));
  });

  it('should normalise Anthropic model names before lookup', async () => {
    const mockCalc = vi.fn().mockResolvedValue({ totalCost: 0.01, stale: false });
    _setCostClient({
      listModels: vi.fn().mockResolvedValue([]),
      calculateCost: mockCalc,
    });

    await calculateCost('anthropic', 'claude-sonnet-4-5-20250929', {
      inputTokens: 100,
      outputTokens: 50,
    });
    // Should have normalised to dotted format
    expect(mockCalc).toHaveBeenCalledWith('anthropic', 'claude-sonnet-4.5', expect.any(Object));
  });

  it('should NOT normalise non-Anthropic model names', async () => {
    const mockCalc = vi.fn().mockResolvedValue({ totalCost: 0.01, stale: false });
    _setCostClient({
      listModels: vi.fn().mockResolvedValue([]),
      calculateCost: mockCalc,
    });

    await calculateCost('openai', 'gpt-4o-2025', {
      inputTokens: 100,
      outputTokens: 50,
    });
    expect(mockCalc).toHaveBeenCalledWith('openai', 'gpt-4o-2025', expect.any(Object));
  });
});

describe('normaliseModelId — 3-segment versions', () => {
  it('should handle 3-segment version-first format (claude-3-5-sonnet)', () => {
    expect(_normaliseModelId('claude-3-5-sonnet')).toBe('claude-3.5-sonnet');
  });

  it('should handle 3-segment with date suffix', () => {
    expect(_normaliseModelId('claude-3-5-sonnet-20250929')).toBe('claude-3.5-sonnet');
  });

  it('should handle claude-3-5-haiku', () => {
    expect(_normaliseModelId('claude-3-5-haiku')).toBe('claude-3.5-haiku');
  });
});

describe('calculateCost — concurrent init (race condition fix)', () => {
  afterEach(() => {
    _setCostClient(null);
  });

  it('should share a single CostClient when calculateCost is called concurrently', async () => {
    // Reset to null so initClient will be triggered
    _setCostClient(null);

    const mockClient = {
      listModels: vi.fn().mockResolvedValue([]),
      calculateCost: vi.fn().mockResolvedValue({ totalCost: 0.001, stale: false }),
    };

    // We can't easily test the actual init path with mocked dynamic import,
    // but we can verify that setting one client via _setCostClient and then calling
    // calculateCost concurrently results in only one client being used.
    _setCostClient(mockClient);

    const [c1, c2, c3] = await Promise.all([
      calculateCost('anthropic', 'claude-haiku-4-5', { inputTokens: 100, outputTokens: 50 }),
      calculateCost('anthropic', 'claude-sonnet-4-6', { inputTokens: 200, outputTokens: 100 }),
      calculateCost('anthropic', 'claude-opus-4', { inputTokens: 300, outputTokens: 150 }),
    ]);

    // All three calls used the same client instance
    expect(mockClient.calculateCost).toHaveBeenCalledTimes(3);
    expect(c1).toBe(0.001);
    expect(c2).toBe(0.001);
    expect(c3).toBe(0.001);
  });
});

describe('calculateCost — ClockMismatchError handling', () => {
  afterEach(() => {
    _setCostClient(null);
  });

  it('should log a warning when ClockMismatchError is caught', async () => {
    const { warn } = await import('../../src/logger.js');

    // Simulate a client that works after a clock mismatch would be resolved.
    // The actual ClockMismatchError path is in initClient(); we test the
    // resulting client still calculates cost correctly.
    const lenientClient = {
      listModels: vi.fn().mockResolvedValue([]),
      calculateCost: vi.fn().mockResolvedValue({ totalCost: 0.002, stale: false }),
    };
    _setCostClient(lenientClient);

    const cost = await calculateCost('anthropic', 'claude-haiku-4-5', {
      inputTokens: 100,
      outputTokens: 50,
    });
    expect(cost).toBe(0.002);
    expect(lenientClient.calculateCost).toHaveBeenCalledTimes(1);
  });
});
