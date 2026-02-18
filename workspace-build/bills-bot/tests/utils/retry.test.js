import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger before imports
vi.mock('../../src/logger.js', () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import { createRetryWrapper, withRetry } from '../../src/utils/retry.js';

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should return result on first successful call', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRetry(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on retryable errors', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }))
      .mockResolvedValue('success');

    const promise = withRetry(fn, { baseDelay: 100, maxRetries: 3 });

    // Advance time past the first retry delay
    await vi.advanceTimersByTimeAsync(200);

    const result = await promise;
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should throw after max retries for retryable errors', async () => {
    const err = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
    const fn = vi.fn().mockRejectedValue(err);

    const expectation = expect(withRetry(fn, { maxRetries: 2, baseDelay: 100 })).rejects.toThrow(
      'timeout',
    );

    // Advance timers for retry backoff delays
    await vi.advanceTimersByTimeAsync(1000);

    await expectation;
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('should throw immediately for non-retryable errors', async () => {
    const err = new Error('Missing Permissions');
    const fn = vi.fn().mockRejectedValue(err);

    await expect(withRetry(fn, { maxRetries: 3, baseDelay: 100 })).rejects.toThrow(
      'Missing Permissions',
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should use custom shouldRetry function', async () => {
    const err = new Error('custom error');
    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValue('ok');

    const shouldRetry = vi.fn().mockReturnValue(true);
    const promise = withRetry(fn, { shouldRetry, baseDelay: 100, maxRetries: 3 });

    await vi.advanceTimersByTimeAsync(200);

    const result = await promise;
    expect(result).toBe('ok');
    expect(shouldRetry).toHaveBeenCalledWith(err, {});
  });

  it('should respect maxDelay cap', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }))
      .mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }))
      .mockResolvedValue('ok');

    const promise = withRetry(fn, {
      baseDelay: 10000,
      maxDelay: 15000,
      maxRetries: 3,
    });

    // The delay should be capped at maxDelay (15000ms)
    await vi.advanceTimersByTimeAsync(16000);
    await vi.advanceTimersByTimeAsync(16000);

    const result = await promise;
    expect(result).toBe('ok');
  });

  it('should pass context to shouldRetry', async () => {
    const err = new Error('fail');
    const fn = vi.fn().mockRejectedValue(err);
    const shouldRetry = vi.fn().mockReturnValue(false);
    const context = { operation: 'test' };

    await expect(withRetry(fn, { shouldRetry, context })).rejects.toThrow('fail');
    expect(shouldRetry).toHaveBeenCalledWith(err, context);
  });
});

describe('createRetryWrapper', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create a wrapper with default options', async () => {
    const wrapper = createRetryWrapper({ maxRetries: 0 });
    const fn = vi.fn().mockResolvedValue('result');
    const result = await wrapper(fn);
    expect(result).toBe('result');
  });

  it('should merge default and per-call options', async () => {
    const wrapper = createRetryWrapper({ maxRetries: 0 });
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await wrapper(fn, { context: { test: true } });
    expect(result).toBe('ok');
  });
});
