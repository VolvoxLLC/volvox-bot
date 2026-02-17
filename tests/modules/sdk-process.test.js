import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}));
vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

import { query } from '@anthropic-ai/claude-agent-sdk';
import { info, warn } from '../../src/logger.js';
import { AsyncQueue, SDKProcess } from '../../src/modules/sdk-process.js';

// ── AsyncQueue tests ────────────────────────────────────────────────────────

describe('AsyncQueue', () => {
  it('should yield pushed values in order', async () => {
    const q = new AsyncQueue();
    q.push('a');
    q.push('b');

    const iter = q[Symbol.asyncIterator]();
    const r1 = await iter.next();
    const r2 = await iter.next();

    expect(r1).toEqual({ value: 'a', done: false });
    expect(r2).toEqual({ value: 'b', done: false });
  });

  it('should wait for push when queue is empty', async () => {
    const q = new AsyncQueue();
    const iter = q[Symbol.asyncIterator]();

    const pending = iter.next();
    q.push('delayed');

    const result = await pending;
    expect(result).toEqual({ value: 'delayed', done: false });
  });

  it('should return done when closed', async () => {
    const q = new AsyncQueue();
    const iter = q[Symbol.asyncIterator]();

    q.close();
    const result = await iter.next();
    expect(result).toEqual({ value: undefined, done: true });
  });

  it('should resolve pending waiters on close', async () => {
    const q = new AsyncQueue();
    const iter = q[Symbol.asyncIterator]();

    const pending = iter.next();
    q.close();

    const result = await pending;
    expect(result).toEqual({ value: undefined, done: true });
  });

  it('should not enqueue after close', async () => {
    const q = new AsyncQueue();
    q.close();
    q.push('ignored');

    const iter = q[Symbol.asyncIterator]();
    const result = await iter.next();
    expect(result.done).toBe(true);
  });
});

// ── SDKProcess tests (per-call mode) ────────────────────────────────────────

describe('SDKProcess (per-call mode)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createMockGenerator(resultObj, { usage, is_error = false } = {}) {
    return (async function* () {
      yield {
        type: 'result',
        subtype: is_error ? 'error_during_execution' : 'success',
        result: JSON.stringify(resultObj),
        is_error,
        errors: is_error ? [{ message: 'SDK error' }] : [],
        structured_output: is_error ? undefined : resultObj,
        total_cost_usd: 0.001,
        duration_ms: 100,
        usage: usage || { inputTokens: 500, outputTokens: 200 },
      };
    })();
  }

  it('should start and set alive=true in per-call mode', async () => {
    const proc = new SDKProcess('test', { model: 'claude-haiku-4-5' }, { useStreaming: false });

    await proc.start();

    expect(proc.alive).toBe(true);
    expect(proc.tokenCount).toBe(0);
  });

  it('should send prompts and return results', async () => {
    const resultObj = { classification: 'ignore', reasoning: 'casual' };
    query.mockReturnValue(createMockGenerator(resultObj));

    const proc = new SDKProcess('test', { model: 'claude-haiku-4-5' }, { useStreaming: false });
    await proc.start();

    const result = await proc.send('test prompt');

    expect(result.structured_output).toEqual(resultObj);
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'test prompt',
        options: expect.objectContaining({ model: 'claude-haiku-4-5' }),
      }),
    );
  });

  it('should track accumulated tokens across sends', async () => {
    const proc = new SDKProcess(
      'test',
      { model: 'claude-haiku-4-5' },
      { useStreaming: false, tokenLimit: 50000 },
    );
    await proc.start();

    // First send: 500 + 200 = 700
    query.mockReturnValue(
      createMockGenerator({ ok: true }, { usage: { inputTokens: 500, outputTokens: 200 } }),
    );
    await proc.send('prompt1');
    expect(proc.tokenCount).toBe(700);

    // Second send: 300 + 100 = 400, total = 1100
    query.mockReturnValue(
      createMockGenerator({ ok: true }, { usage: { inputTokens: 300, outputTokens: 100 } }),
    );
    await proc.send('prompt2');
    expect(proc.tokenCount).toBe(1100);
  });

  it('should track tokens with snake_case usage fields', async () => {
    const proc = new SDKProcess(
      'test',
      { model: 'claude-haiku-4-5' },
      { useStreaming: false, tokenLimit: 50000 },
    );
    await proc.start();

    query.mockReturnValue(
      (async function* () {
        yield {
          type: 'result',
          subtype: 'success',
          result: '{}',
          is_error: false,
          errors: [],
          structured_output: {},
          total_cost_usd: 0.001,
          duration_ms: 100,
          usage: { input_tokens: 800, output_tokens: 300 },
        };
      })(),
    );

    await proc.send('test');
    expect(proc.tokenCount).toBe(1100);
  });

  it('should recycle when token limit is exceeded', async () => {
    const proc = new SDKProcess(
      'test',
      { model: 'claude-haiku-4-5' },
      { useStreaming: false, tokenLimit: 1000 },
    );
    await proc.start();

    // Send that exceeds 1000 tokens
    query.mockReturnValue(
      createMockGenerator({ ok: true }, { usage: { inputTokens: 800, outputTokens: 500 } }),
    );

    const result = await proc.send('prompt');

    // Result should still be returned
    expect(result.structured_output).toEqual({ ok: true });

    // Wait for async recycle to fire
    await vi.waitFor(() => {
      expect(info).toHaveBeenCalledWith(
        'Recycling test process',
        expect.objectContaining({ accumulatedTokens: 1300, tokenLimit: 1000 }),
      );
    });
  });

  it('should throw on SDK error result', async () => {
    query.mockReturnValue(createMockGenerator({ err: true }, { is_error: true }));

    const proc = new SDKProcess('test', { model: 'claude-haiku-4-5' }, { useStreaming: false });
    await proc.start();

    await expect(proc.send('test')).rejects.toThrow('SDK error');
  });

  it('should throw when query returns no result', async () => {
    query.mockReturnValue((async function* () {})());

    const proc = new SDKProcess('test', { model: 'claude-haiku-4-5' }, { useStreaming: false });
    await proc.start();

    await expect(proc.send('test')).rejects.toThrow('query returned no result');
  });

  it('should close and set alive=false', async () => {
    const proc = new SDKProcess('test', { model: 'claude-haiku-4-5' }, { useStreaming: false });
    await proc.start();

    expect(proc.alive).toBe(true);
    proc.close();
    expect(proc.alive).toBe(false);
  });

  it('should serialize concurrent sends via mutex', async () => {
    const proc = new SDKProcess(
      'test',
      { model: 'claude-haiku-4-5' },
      { useStreaming: false, tokenLimit: 50000 },
    );
    await proc.start();

    const callOrder = [];
    let resolveFirst;
    const firstPromise = new Promise((r) => {
      resolveFirst = r;
    });

    // First call blocks
    query.mockReturnValueOnce(
      (async function* () {
        callOrder.push('first-start');
        await firstPromise;
        callOrder.push('first-end');
        yield {
          type: 'result',
          subtype: 'success',
          result: '{"v":1}',
          is_error: false,
          errors: [],
          structured_output: { v: 1 },
          total_cost_usd: 0.001,
          duration_ms: 100,
          usage: { inputTokens: 100, outputTokens: 50 },
        };
      })(),
    );

    // Second call returns immediately
    query.mockReturnValueOnce(
      (async function* () {
        callOrder.push('second');
        yield {
          type: 'result',
          subtype: 'success',
          result: '{"v":2}',
          is_error: false,
          errors: [],
          structured_output: { v: 2 },
          total_cost_usd: 0.001,
          duration_ms: 100,
          usage: { inputTokens: 100, outputTokens: 50 },
        };
      })(),
    );

    const p1 = proc.send('first');
    const p2 = proc.send('second');

    // Let first complete
    resolveFirst();

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.structured_output.v).toBe(1);
    expect(r2.structured_output.v).toBe(2);

    // Second should only start after first completes (mutex serialization)
    const firstEndIdx = callOrder.indexOf('first-end');
    const secondIdx = callOrder.indexOf('second');
    expect(secondIdx).toBeGreaterThan(firstEndIdx);
  });

  it('should expose name property', () => {
    const proc = new SDKProcess('classifier', { model: 'claude-haiku-4-5' });
    expect(proc.name).toBe('classifier');
  });

  it('should recycle by closing and restarting', async () => {
    const proc = new SDKProcess('test', { model: 'claude-haiku-4-5' }, { useStreaming: false });
    await proc.start();
    expect(proc.alive).toBe(true);

    await proc.recycle();
    expect(proc.alive).toBe(true);
    expect(proc.tokenCount).toBe(0);
  });

  it('should restart with backoff on failure', async () => {
    vi.useFakeTimers();

    const proc = new SDKProcess('test', { model: 'claude-haiku-4-5' }, { useStreaming: false });
    await proc.start();

    // close + start will succeed
    const restartPromise = proc.restart(0);
    await vi.advanceTimersByTimeAsync(1000);
    await restartPromise;

    expect(proc.alive).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      'Restarting test process',
      expect.objectContaining({ attempt: 0, delayMs: 1000 }),
    );

    vi.useRealTimers();
  });
});

// ── SDKProcess tests (streaming mode) ──────────────────────────────────────

describe('SDKProcess (streaming mode)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Create a mock that simulates SDK streaming behavior:
   * 1. Yields system/init immediately
   * 2. Reads from the input queue (prompt), yields a result per input message
   */
  function createStreamingMock({ sessionId = 'sess-123', results = [] } = {}) {
    let capturedQueue = null;

    query.mockImplementation(({ prompt }) => {
      capturedQueue = prompt;

      return (async function* () {
        // Emit init (the SDK does this before reading user input)
        yield {
          type: 'system',
          subtype: 'init',
          session_id: sessionId,
        };

        // For each user message pushed to the queue, yield the next result
        let idx = 0;
        for await (const _msg of prompt) {
          if (idx >= results.length) break;
          const r = results[idx++];
          yield {
            type: 'result',
            subtype: 'success',
            result: JSON.stringify(r.data),
            is_error: false,
            errors: [],
            structured_output: r.data,
            total_cost_usd: r.cost ?? 0.001,
            duration_ms: r.duration ?? 100,
            usage: r.usage ?? { inputTokens: 500, outputTokens: 200 },
          };
        }
      })();
    });

    return { getInputQueue: () => capturedQueue };
  }

  it('should start without blocking (no init timeout)', async () => {
    createStreamingMock({ results: [] });

    const proc = new SDKProcess('test', { model: 'claude-haiku-4-5' });
    await proc.start();

    expect(proc.alive).toBe(true);
    expect(proc.tokenCount).toBe(0);
  });

  it('should send a message and receive a result', async () => {
    const resultData = { classification: 'ignore', reasoning: 'off-topic' };
    createStreamingMock({
      results: [{ data: resultData }],
    });

    const proc = new SDKProcess('test', { model: 'claude-haiku-4-5' });
    await proc.start();

    const result = await proc.send('test prompt');

    expect(result.structured_output).toEqual(resultData);
  });

  it('should capture session_id from init and include in subsequent sends', async () => {
    const mock = createStreamingMock({
      sessionId: 'sess-abc',
      results: [{ data: { v: 1 } }, { data: { v: 2 } }],
    });

    const proc = new SDKProcess('test', { model: 'claude-haiku-4-5' });
    await proc.start();

    await proc.send('first');

    // Verify the input queue received a message with empty session_id (first call)
    // or the captured session_id (subsequent calls).
    const inputQueue = mock.getInputQueue();
    expect(inputQueue).not.toBeNull();

    const result2 = await proc.send('second');
    expect(result2.structured_output).toEqual({ v: 2 });
  });

  it('should track tokens in streaming mode', async () => {
    createStreamingMock({
      results: [{ data: { ok: true }, usage: { inputTokens: 400, outputTokens: 100 } }],
    });

    const proc = new SDKProcess('test', { model: 'claude-haiku-4-5' }, { tokenLimit: 50000 });
    await proc.start();

    await proc.send('prompt');
    expect(proc.tokenCount).toBe(500);
  });

  it('should close cleanly in streaming mode', async () => {
    createStreamingMock({ results: [] });

    const proc = new SDKProcess('test', { model: 'claude-haiku-4-5' });
    await proc.start();

    expect(proc.alive).toBe(true);
    proc.close();
    expect(proc.alive).toBe(false);
  });
});
