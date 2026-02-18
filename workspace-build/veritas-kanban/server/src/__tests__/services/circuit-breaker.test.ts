import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CircuitBreaker, CircuitOpenError } from '../../services/circuit-breaker.js';

// Silence the pino logger during tests
vi.mock('../../lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    vi.useFakeTimers();
    breaker = new CircuitBreaker({
      name: 'test',
      failureThreshold: 3,
      resetTimeout: 10_000,
      monitorWindow: 30_000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -----------------------------------------------
  // Basic behavior
  // -----------------------------------------------

  it('starts in closed state', () => {
    expect(breaker.state).toBe('closed');
  });

  it('passes through successful calls in closed state', async () => {
    const result = await breaker.execute(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
    expect(breaker.state).toBe('closed');
  });

  it('passes through failures in closed state (below threshold)', async () => {
    await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
    await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
    // 2 failures, threshold is 3 → still closed
    expect(breaker.state).toBe('closed');
  });

  // -----------------------------------------------
  // Closed → Open transition
  // -----------------------------------------------

  it('transitions to open after reaching failure threshold', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow(
        'fail'
      );
    }
    expect(breaker.state).toBe('open');
  });

  // -----------------------------------------------
  // Open state behavior
  // -----------------------------------------------

  it('rejects immediately when open', async () => {
    // Trip the circuit
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }
    expect(breaker.state).toBe('open');

    // Subsequent calls should be rejected without executing the function
    const fn = vi.fn(() => Promise.resolve('should not run'));
    await expect(breaker.execute(fn)).rejects.toThrow(CircuitOpenError);
    expect(fn).not.toHaveBeenCalled();
  });

  it('CircuitOpenError has correct properties', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }

    try {
      await breaker.execute(() => Promise.resolve('nope'));
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(CircuitOpenError);
      const coe = err as CircuitOpenError;
      expect(coe.circuitName).toBe('test');
      expect(coe.nextAttempt).toBeInstanceOf(Date);
    }
  });

  // -----------------------------------------------
  // Open → Half-open transition
  // -----------------------------------------------

  it('transitions to half-open after reset timeout', async () => {
    // Trip the circuit
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }
    expect(breaker.state).toBe('open');

    // Advance past the reset timeout
    vi.advanceTimersByTime(10_001);
    expect(breaker.state).toBe('half-open');
  });

  // -----------------------------------------------
  // Half-open: allows one request
  // -----------------------------------------------

  it('allows one request through in half-open state', async () => {
    // Trip and wait for half-open
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }
    vi.advanceTimersByTime(10_001);
    expect(breaker.state).toBe('half-open');

    const result = await breaker.execute(() => Promise.resolve('recovered'));
    expect(result).toBe('recovered');
  });

  // -----------------------------------------------
  // Half-open → Closed (success)
  // -----------------------------------------------

  it('closes the circuit when half-open request succeeds', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }
    vi.advanceTimersByTime(10_001);
    expect(breaker.state).toBe('half-open');

    await breaker.execute(() => Promise.resolve('ok'));
    expect(breaker.state).toBe('closed');

    // Should now allow normal traffic again
    const result = await breaker.execute(() => Promise.resolve('normal'));
    expect(result).toBe('normal');
  });

  // -----------------------------------------------
  // Half-open → Open (failure)
  // -----------------------------------------------

  it('reopens the circuit when half-open request fails', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }
    vi.advanceTimersByTime(10_001);
    expect(breaker.state).toBe('half-open');

    await expect(breaker.execute(() => Promise.reject(new Error('still failing')))).rejects.toThrow(
      'still failing'
    );
    expect(breaker.state).toBe('open');
  });

  // -----------------------------------------------
  // Sliding window — old failures expire
  // -----------------------------------------------

  it('resets old failures outside the monitor window', async () => {
    // 2 failures
    await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    expect(breaker.state).toBe('closed');

    // Advance past the monitor window so those 2 failures expire
    vi.advanceTimersByTime(31_000);

    // One more failure — total recent = 1, not 3
    await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    expect(breaker.state).toBe('closed');
  });

  // -----------------------------------------------
  // Concurrent half-open — only one passes
  // -----------------------------------------------

  it('only allows one concurrent request in half-open state', async () => {
    // Trip the circuit
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }
    vi.advanceTimersByTime(10_001);
    expect(breaker.state).toBe('half-open');

    // Create a slow promise that we control
    let resolveFirst!: (value: string) => void;
    const slowPromise = new Promise<string>((resolve) => {
      resolveFirst = resolve;
    });

    // Start first request (this one should get through)
    const firstCall = breaker.execute(() => slowPromise);

    // Second concurrent request should be rejected
    await expect(breaker.execute(() => Promise.resolve('second'))).rejects.toThrow(
      CircuitOpenError
    );

    // Resolve the first request
    resolveFirst('first');
    const result = await firstCall;
    expect(result).toBe('first');
    expect(breaker.state).toBe('closed');
  });

  // -----------------------------------------------
  // Status reporting
  // -----------------------------------------------

  it('reports correct status in closed state', () => {
    const status = breaker.getStatus();
    expect(status.state).toBe('closed');
    expect(status.failures).toBe(0);
    expect(status.lastFailure).toBeNull();
    expect(status.nextAttempt).toBeNull();
  });

  it('reports correct status in open state', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }

    const status = breaker.getStatus();
    expect(status.state).toBe('open');
    expect(status.failures).toBe(3);
    expect(status.lastFailure).not.toBeNull();
    expect(status.nextAttempt).not.toBeNull();
  });

  // -----------------------------------------------
  // Manual reset
  // -----------------------------------------------

  it('can be manually reset to closed', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }
    expect(breaker.state).toBe('open');

    breaker.reset();
    expect(breaker.state).toBe('closed');

    const result = await breaker.execute(() => Promise.resolve('after reset'));
    expect(result).toBe('after reset');
  });
});
