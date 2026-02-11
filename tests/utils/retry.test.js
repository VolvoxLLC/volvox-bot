import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRetryWrapper, withRetry } from '../../src/utils/retry.js';

describe('withRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should execute function and return result on success', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const promise = withRetry(fn);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on retryable error', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ code: 'ECONNREFUSED' })
      .mockResolvedValue('success');

    const promise = withRetry(fn, { maxRetries: 2 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should respect maxRetries limit', async () => {
    const fn = vi.fn().mockRejectedValue({ code: 'ECONNREFUSED' });

    const promise = withRetry(fn, { maxRetries: 3 });
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toMatchObject({ code: 'ECONNREFUSED' });
    expect(fn).toHaveBeenCalledTimes(4); // Initial + 3 retries
  });

  it('should not retry non-retryable errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('config.json not found'));

    const promise = withRetry(fn, { maxRetries: 3 });
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow('config.json not found');
    expect(fn).toHaveBeenCalledTimes(1); // No retries
  });

  it('should use exponential backoff', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ code: 'ETIMEDOUT' })
      .mockRejectedValueOnce({ code: 'ETIMEDOUT' })
      .mockResolvedValue('success');

    const baseDelay = 100;
    const promise = withRetry(fn, { maxRetries: 2, baseDelay });

    // Fast-forward timers to simulate backoff delays
    await vi.advanceTimersByTimeAsync(baseDelay); // First retry after 100ms
    await vi.advanceTimersByTimeAsync(baseDelay * 2); // Second retry after 200ms
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should respect maxDelay cap', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ code: 'ETIMEDOUT' })
      .mockRejectedValueOnce({ code: 'ETIMEDOUT' })
      .mockResolvedValue('success');

    const promise = withRetry(fn, { maxRetries: 5, baseDelay: 1000, maxDelay: 2000 });

    // The exponential backoff would be 1000, 2000, 4000, but maxDelay caps at 2000
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000); // Capped
    const result = await promise;

    expect(result).toBe('success');
  });

  it('should use custom shouldRetry function', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('custom error'));
    const shouldRetry = vi.fn().mockReturnValue(true);

    const promise = withRetry(fn, { maxRetries: 2, shouldRetry, baseDelay: 10 });
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow('custom error');
    expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    expect(shouldRetry).toHaveBeenCalled();
  });

  it('should pass context to logger', async () => {
    const fn = vi.fn().mockRejectedValue({ code: 'ETIMEDOUT' });
    const context = { operation: 'test' };

    const promise = withRetry(fn, { maxRetries: 1, context, baseDelay: 10 });
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toMatchObject({ code: 'ETIMEDOUT' });
  });

  it('should handle immediate success without delays', async () => {
    const fn = vi.fn().mockResolvedValue('immediate');

    const result = await withRetry(fn);

    expect(result).toBe('immediate');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should handle zero maxRetries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    const promise = withRetry(fn, { maxRetries: 0 });

    await expect(promise).rejects.toThrow('fail');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should preserve error object', async () => {
    const customError = new Error('custom');
    customError.code = 'CUSTOM_CODE';
    const fn = vi.fn().mockRejectedValue(customError);

    const promise = withRetry(fn, { maxRetries: 0 });

    await expect(promise).rejects.toMatchObject({
      message: 'custom',
      code: 'CUSTOM_CODE',
    });
  });
});

describe('createRetryWrapper', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create a wrapper with default options', async () => {
    const retry = createRetryWrapper({ maxRetries: 5 });
    const fn = vi.fn().mockResolvedValue('success');

    const promise = retry(fn);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
  });

  it('should allow overriding default options', async () => {
    const retry = createRetryWrapper({ maxRetries: 5, baseDelay: 100 });
    const fn = vi.fn().mockRejectedValue({ code: 'ETIMEDOUT' });

    const promise = retry(fn, { maxRetries: 1 }); // Override to 1
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toMatchObject({ code: 'ETIMEDOUT' });
    expect(fn).toHaveBeenCalledTimes(2); // Initial + 1 retry
  });

  it('should merge default and override options', async () => {
    const retry = createRetryWrapper({ maxRetries: 3, baseDelay: 50 });
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ code: 'ETIMEDOUT' })
      .mockResolvedValue('success');

    const promise = retry(fn, { maxDelay: 100 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});