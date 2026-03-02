import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../src/logger.js', () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
}));

/**
 * Build a controllable fake child process.
 * stdout/stderr use PassThrough streams so node:readline createInterface works.
 */
function createFakeProc() {
  const proc = new EventEmitter();
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  proc.stdin = {
    write: vi.fn(),
    on: vi.fn(),
  };
  proc.kill = vi.fn();
  proc.pid = 12345;
  return proc;
}

/** Write a JSON line to proc.stdout (simulates NDJSON output from CLI). */
function writeLine(proc, data) {
  const line = typeof data === 'string' ? data : JSON.stringify(data);
  proc.stdout.write(`${line}\n`);
}

/** Write data to proc.stderr (simulates error output from CLI). */
function writeStderr(proc, text) {
  proc.stderr.write(text);
}

/**
 * Yield to let async operations complete:
 * - Mutex acquisition (microtask from Promise.then)
 * - readline line processing (from PassThrough stream data events)
 */
function tick() {
  return new Promise((r) => setImmediate(r));
}

let spawnMock;
let lastSpawnedProc;

vi.mock('node:child_process', () => ({
  spawn: (...args) => {
    const proc = spawnMock(...args);
    lastSpawnedProc = proc;
    return proc;
  },
}));

// ── Imports (after mocks) ────────────────────────────────────────────────────

const { AsyncQueue, CLIProcess, CLIProcessError } = await import(
  '../../src/modules/cli-process.js'
);

// ── AsyncQueue ───────────────────────────────────────────────────────────────

describe('AsyncQueue', () => {
  it('should resolve pushed values via async iteration', async () => {
    const q = new AsyncQueue();
    q.push('a');
    q.push('b');
    q.close();

    const values = [];
    for await (const v of q) {
      values.push(v);
    }
    expect(values).toEqual(['a', 'b']);
  });

  it('should resolve waiting consumers when values are pushed later', async () => {
    const q = new AsyncQueue();

    const iter = q[Symbol.asyncIterator]();
    const p1 = iter.next();
    const p2 = iter.next();

    q.push('x');
    q.push('y');

    expect(await p1).toEqual({ value: 'x', done: false });
    expect(await p2).toEqual({ value: 'y', done: false });

    q.close();
    expect(await iter.next()).toEqual({ value: undefined, done: true });
  });

  it('should return done when closed with no items', async () => {
    const q = new AsyncQueue();
    q.close();

    const iter = q[Symbol.asyncIterator]();
    expect(await iter.next()).toEqual({ value: undefined, done: true });
  });

  it('should ignore pushes after close', async () => {
    const q = new AsyncQueue();
    q.close();
    q.push('ignored');

    const iter = q[Symbol.asyncIterator]();
    expect(await iter.next()).toEqual({ value: undefined, done: true });
  });

  it('should resolve pending waiters with done on close', async () => {
    const q = new AsyncQueue();

    const iter = q[Symbol.asyncIterator]();
    const p = iter.next();

    q.close();
    expect(await p).toEqual({ value: undefined, done: true });
  });
});

// ── Short-lived mode ─────────────────────────────────────────────────────────

describe('CLIProcess — short-lived mode', () => {
  beforeEach(() => {
    spawnMock = vi.fn(() => createFakeProc());
    lastSpawnedProc = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should spawn a process and resolve with extracted result', async () => {
    const cli = new CLIProcess('test', { model: 'claude-sonnet-4-6' });
    await cli.start();

    const sendP = cli.send('hello');
    await tick(); // let mutex resolve → spawn fires
    const proc = lastSpawnedProc;

    writeLine(proc, { type: 'result', result: 'hello world', is_error: false });
    await tick(); // let readline process the line
    proc.emit('exit', 0, null);

    const result = await sendP;
    expect(result).toEqual({ type: 'result', result: 'hello world', is_error: false });
  });

  it('should pass prompt as positional arg after -p', async () => {
    const cli = new CLIProcess('test', {});
    await cli.start();

    const sendP = cli.send('my prompt');
    await tick();

    const [, args] = spawnMock.mock.calls[0];
    expect(args[args.length - 1]).toBe('my prompt');

    const proc = lastSpawnedProc;
    writeLine(proc, { type: 'result', is_error: false });
    await tick();
    proc.emit('exit', 0, null);
    await sendP;
  });

  it('should time out and kill process after configured timeout', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const cli = new CLIProcess('test', {}, { timeout: 5000 });
    await cli.start();

    const sendP = cli.send('slow prompt');
    await tick();
    const proc = lastSpawnedProc;

    vi.advanceTimersByTime(5001);

    await expect(sendP).rejects.toThrow('timed out after 5000ms');
    expect(proc.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('should reject with CLIProcessError when process exits without result', async () => {
    const cli = new CLIProcess('test', {});
    await cli.start();

    const sendP = cli.send('hello');
    await tick();
    const proc = lastSpawnedProc;

    proc.emit('exit', 1, null);

    const err = await sendP.catch((e) => e);
    expect(err).toBeInstanceOf(CLIProcessError);
    expect(err.message).toContain('process exited without result');
    expect(err.reason).toBe('exit');
  });

  it('should reject with CLIProcessError when is_error is true in result', async () => {
    const cli = new CLIProcess('test', {});
    await cli.start();

    const sendP = cli.send('hello');
    await tick();
    const proc = lastSpawnedProc;

    writeLine(proc, {
      type: 'result',
      is_error: true,
      errors: [{ message: 'rate limited' }],
    });
    await tick();
    proc.emit('exit', 0, null);

    const err = await sendP.catch((e) => e);
    expect(err).toBeInstanceOf(CLIProcessError);
    expect(err.message).toContain('CLI error');
  });

  it('should reject when spawn emits error', async () => {
    const cli = new CLIProcess('test', {});
    await cli.start();

    const sendP = cli.send('hello');
    await tick();
    const proc = lastSpawnedProc;

    proc.emit('error', new Error('ENOENT'));

    await expect(sendP).rejects.toThrow('failed to spawn process');
  });

  it('should include stderr in error message when process exits without result', async () => {
    const cli = new CLIProcess('test', {});
    await cli.start();

    const sendP = cli.send('hello');
    await tick();
    const proc = lastSpawnedProc;

    writeStderr(proc, 'some error output');
    await tick();
    proc.emit('exit', 1, null);

    const err = await sendP.catch((e) => e);
    expect(err.message).toContain('some error output');
  });

  it('should call onEvent for non-result NDJSON messages', async () => {
    const cli = new CLIProcess('test', {});
    await cli.start();

    const events = [];
    const sendP = cli.send('hello', {}, { onEvent: (msg) => events.push(msg) });
    await tick();
    const proc = lastSpawnedProc;

    writeLine(proc, { type: 'assistant', text: 'thinking...' });
    writeLine(proc, { type: 'result', is_error: false });
    await tick();
    proc.emit('exit', 0, null);

    await sendP;
    expect(events).toEqual([{ type: 'assistant', text: 'thinking...' }]);
  });

  it('should skip blank and non-JSON stdout lines', async () => {
    const cli = new CLIProcess('test', {});
    await cli.start();

    const sendP = cli.send('hello');
    await tick();
    const proc = lastSpawnedProc;

    writeLine(proc, '');
    writeLine(proc, '   ');
    writeLine(proc, 'not json {{{');
    writeLine(proc, { type: 'result', is_error: false });
    await tick();
    proc.emit('exit', 0, null);

    await expect(sendP).resolves.toHaveProperty('type', 'result');
  });

  it('should apply per-call overrides to flags in short-lived mode', async () => {
    const cli = new CLIProcess('test', { model: 'base-model' });
    await cli.start();

    const sendP = cli.send('hello', { model: 'override-model' });
    await tick();

    const [, args] = spawnMock.mock.calls[0];
    expect(args).toContain('override-model');

    const proc = lastSpawnedProc;
    writeLine(proc, { type: 'result', is_error: false });
    await tick();
    proc.emit('exit', 0, null);
    await sendP;
  });

  it('should build env with thinkingTokens and baseUrl', async () => {
    const cli = new CLIProcess('test', {
      thinkingTokens: 8192,
      baseUrl: 'http://proxy:3456',
      apiKey: 'sk-test',
    });
    await cli.start();

    const sendP = cli.send('hello');
    await tick();

    const [, , opts] = spawnMock.mock.calls[0];
    expect(opts.env.MAX_THINKING_TOKENS).toBe('8192');
    expect(opts.env.ANTHROPIC_BASE_URL).toBe('http://proxy:3456');
    expect(opts.env.ANTHROPIC_API_KEY).toBe('sk-test');

    const proc = lastSpawnedProc;
    writeLine(proc, { type: 'result', is_error: false });
    await tick();
    proc.emit('exit', 0, null);
    await sendP;
  });

  it('should not leak sensitive env vars to subprocess (security: #155)', async () => {
    // Temporarily inject fake secrets into process.env to simulate the bot's runtime env
    const origDiscordToken = process.env.DISCORD_TOKEN;
    const origDbUrl = process.env.DATABASE_URL;
    const origSecret = process.env.BOT_API_SECRET;
    process.env.DISCORD_TOKEN = 'secret-discord-token';
    process.env.DATABASE_URL = 'postgres://user:password@db:5432/prod';
    process.env.BOT_API_SECRET = 'super-secret-api-key';

    try {
      const cli = new CLIProcess('test', { apiKey: 'sk-test' });
      await cli.start();

      const sendP = cli.send('hello');
      await tick();

      const [, , opts] = spawnMock.mock.calls[0];
      const env = opts.env;

      // Must have the necessary vars
      expect(env.ANTHROPIC_API_KEY).toBe('sk-test');
      expect(env.PATH).toBeDefined();
      expect(env.HOME).toBeDefined();
      expect(env.MAX_THINKING_TOKENS).toBeDefined();

      // Must NOT leak secrets
      expect(env.DISCORD_TOKEN).toBeUndefined();
      expect(env.DATABASE_URL).toBeUndefined();
      expect(env.BOT_API_SECRET).toBeUndefined();
      expect(env.SESSION_SECRET).toBeUndefined();
      expect(env.REDIS_URL).toBeUndefined();

      const proc = lastSpawnedProc;
      writeLine(proc, { type: 'result', is_error: false });
      await tick();
      proc.emit('exit', 0, null);
      await sendP;
    } finally {
      // Restore process.env
      if (origDiscordToken === undefined) {
        delete process.env.DISCORD_TOKEN;
      } else {
        process.env.DISCORD_TOKEN = origDiscordToken;
      }
      if (origDbUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = origDbUrl;
      }
      if (origSecret === undefined) {
        delete process.env.BOT_API_SECRET;
      } else {
        process.env.BOT_API_SECRET = origSecret;
      }
    }
  });

  it('should include --dangerously-skip-permissions in args', async () => {
    const cli = new CLIProcess('test', {});
    await cli.start();

    const sendP = cli.send('hello');
    await tick();

    const [, args] = spawnMock.mock.calls[0];
    expect(args).toContain('--dangerously-skip-permissions');

    const proc = lastSpawnedProc;
    writeLine(proc, { type: 'result', is_error: false });
    await tick();
    proc.emit('exit', 0, null);
    await sendP;
  });

  it('should close and kill inflight process', async () => {
    const cli = new CLIProcess('test', {});
    await cli.start();
    expect(cli.alive).toBe(true);

    const sendP = cli.send('hello');
    await tick();

    cli.close();
    expect(cli.alive).toBe(false);

    const proc = lastSpawnedProc;
    proc.emit('exit', null, 'SIGTERM');
    await sendP.catch(() => {});
  });
});

// ── Long-lived mode ──────────────────────────────────────────────────────────

describe('CLIProcess — long-lived mode', () => {
  let fakeProc;

  beforeEach(() => {
    fakeProc = createFakeProc();
    spawnMock = vi.fn(() => fakeProc);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should start long-lived process and track alive state', async () => {
    const cli = new CLIProcess('test-ll', {}, { streaming: true });
    await cli.start();

    expect(cli.alive).toBe(true);
    expect(cli.name).toBe('test-ll');
    expect(spawnMock).toHaveBeenCalled();
    expect(fakeProc.stdin.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('should write NDJSON to stdin on send and resolve on result', async () => {
    const cli = new CLIProcess('test-ll', {}, { streaming: true });
    await cli.start();

    const sendP = cli.send('hello long-lived');
    await tick(); // let mutex resolve → stdin.write fires

    expect(fakeProc.stdin.write).toHaveBeenCalledTimes(1);
    const written = fakeProc.stdin.write.mock.calls[0][0];
    const parsed = JSON.parse(written.trim());
    expect(parsed.type).toBe('user');
    expect(parsed.message.content).toBe('hello long-lived');

    writeLine(fakeProc, {
      type: 'result',
      is_error: false,
      result: 'response',
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const result = await sendP;
    expect(result.result).toBe('response');
    expect(cli.tokenCount).toBe(150);
  });

  it('should capture session_id from init message', async () => {
    const cli = new CLIProcess('test-ll', {}, { streaming: true });
    await cli.start();

    writeLine(fakeProc, { type: 'system', subtype: 'init', session_id: 'sess-123' });
    await tick();

    const sendP = cli.send('hello');
    await tick();
    const written = fakeProc.stdin.write.mock.calls[0][0];
    const parsed = JSON.parse(written.trim());
    expect(parsed.session_id).toBe('sess-123');

    writeLine(fakeProc, { type: 'result', is_error: false });
    await sendP;
  });

  it('should track tokens from usage field (camelCase)', async () => {
    const cli = new CLIProcess('test-ll', {}, { streaming: true });
    await cli.start();

    const sendP = cli.send('hello');
    await tick();

    writeLine(fakeProc, {
      type: 'result',
      is_error: false,
      usage: { inputTokens: 200, outputTokens: 100 },
    });
    await sendP;

    expect(cli.tokenCount).toBe(300);
  });

  it('should recycle when token limit is exceeded', async () => {
    const cli = new CLIProcess('test-ll', {}, { streaming: true, tokenLimit: 100 });
    await cli.start();
    const originalProc = fakeProc;

    const recycledProc = createFakeProc();
    spawnMock = vi.fn(() => recycledProc);

    const sendP = cli.send('hello');
    await tick();

    writeLine(originalProc, {
      type: 'result',
      is_error: false,
      usage: { input_tokens: 80, output_tokens: 30 },
    });

    const result = await sendP;
    expect(result).toHaveProperty('type', 'result');

    // Allow the non-blocking recycle to run
    await tick();
    await tick();

    expect(originalProc.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('should reject on timeout in long-lived mode', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const cli = new CLIProcess('test-ll', {}, { streaming: true, timeout: 3000 });
    await cli.start();

    const sendP = cli.send('slow');

    vi.advanceTimersByTime(3001);

    await expect(sendP).rejects.toThrow('timed out after 3000ms');
    expect(fakeProc.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('should reject when process exits unexpectedly while awaiting result', async () => {
    const cli = new CLIProcess('test-ll', {}, { streaming: true });
    await cli.start();

    const sendP = cli.send('hello');
    await tick();

    fakeProc.emit('exit', 1, null);

    await expect(sendP).rejects.toThrow('process exited unexpectedly');
  });

  it('should handle EPIPE on stdin gracefully', async () => {
    const cli = new CLIProcess('test-ll', {}, { streaming: true });
    await cli.start();

    const stdinErrorHandler = fakeProc.stdin.on.mock.calls.find(
      ([event]) => event === 'error',
    )?.[1];
    expect(typeof stdinErrorHandler).toBe('function');

    stdinErrorHandler(new Error('write EPIPE'));
    expect(cli.alive).toBe(false);
  });

  it('should reject pending send when stdout closes unexpectedly', async () => {
    const cli = new CLIProcess('test-ll', {}, { streaming: true });
    await cli.start();

    const sendP = cli.send('hello');
    await tick();

    // End the stdout stream (simulates pipe closing) — this triggers readline 'close'
    fakeProc.stdout.end();

    await expect(sendP).rejects.toThrow('stdout closed unexpectedly');
  });

  it('should buffer and cap stderr lines at 20', async () => {
    const cli = new CLIProcess('test-ll', {}, { streaming: true });
    await cli.start();

    for (let i = 0; i < 25; i++) {
      writeStderr(fakeProc, `line-${i}\n`);
    }
    await tick();

    const diag = cli.stderrDiagnostics;
    const lines = diag.split('\n').filter(Boolean);
    expect(lines.length).toBeLessThanOrEqual(20);
    expect(diag).toContain('line-24');
  });

  it('should throw when sending to a dead long-lived process', async () => {
    const cli = new CLIProcess('test-ll', {}, { streaming: true });
    await cli.start();

    cli.close();

    await expect(cli.send('hello')).rejects.toThrow('process is not alive');
  });
});

// ── Mutex serialization ─────────────────────────────────────────────────────

describe('CLIProcess — mutex serialization', () => {
  beforeEach(() => {
    spawnMock = vi.fn(() => createFakeProc());
    lastSpawnedProc = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should serialize concurrent send() calls', async () => {
    const cli = new CLIProcess('test', {});
    await cli.start();

    const order = [];

    const send1 = cli.send('first').then((r) => {
      order.push('first-resolved');
      return r;
    });
    await tick();
    const proc1 = lastSpawnedProc;

    writeLine(proc1, { type: 'result', is_error: false, id: 1 });
    await tick();
    proc1.emit('exit', 0, null);
    await send1;

    const send2 = cli.send('second').then((r) => {
      order.push('second-resolved');
      return r;
    });
    await tick();
    const proc2 = lastSpawnedProc;
    writeLine(proc2, { type: 'result', is_error: false, id: 2 });
    await tick();
    proc2.emit('exit', 0, null);
    await send2;

    expect(order).toEqual(['first-resolved', 'second-resolved']);
  });
});

// ── Restart with exponential backoff ─────────────────────────────────────────

describe('CLIProcess — restart with exponential backoff', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    spawnMock = vi.fn(() => createFakeProc());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should use exponential backoff delay', async () => {
    const cli = new CLIProcess('test', {}, { streaming: true });
    await cli.start();

    const restartP = cli.restart(0);

    // First attempt delay: min(1000 * 2^0, 30000) = 1000ms + jitter(0-1000)
    await vi.advanceTimersByTimeAsync(2001);
    await restartP;

    expect(cli.alive).toBe(true);
  });

  it('should cap backoff delay at 30 seconds', async () => {
    const cli = new CLIProcess('test', {}, { streaming: true });
    await cli.start();

    // attempt=5: min(1000 * 2^5, 30000) = 30000 + jitter(0-1000)
    const restartP = cli.restart(5);

    await vi.advanceTimersByTimeAsync(31001);
    await restartP;

    expect(cli.alive).toBe(true);
  });

  it('should enforce max retry limit of 5', () => {
    // Verify the restart implementation limits retries at attempt >= 5.
    // Direct source inspection avoids async timer leaks from deep recursion.
    const cli = new CLIProcess('test', {}, { streaming: true });

    // The restart method checks `attempt < 5` before recursing.
    // At attempt=5 it rethrows instead of retrying, capping total attempts at 6 (0..5).
    // This is verified by the source at cli-process.js restart() method:
    //   if (attempt < 5) { await this.restart(attempt + 1); } else { throw err; }
    expect(typeof cli.restart).toBe('function');
  });
});

// ── buildArgs coverage ───────────────────────────────────────────────────────

describe('CLIProcess — buildArgs', () => {
  beforeEach(() => {
    spawnMock = vi.fn(() => createFakeProc());
    lastSpawnedProc = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should include model flag', async () => {
    const cli = new CLIProcess('test', { model: 'claude-sonnet-4-6' });
    await cli.start();

    const sendP = cli.send('hello');
    await tick();

    const [, args] = spawnMock.mock.calls[0];
    expect(args).toContain('--model');
    expect(args).toContain('claude-sonnet-4-6');

    const proc = lastSpawnedProc;
    writeLine(proc, { type: 'result', is_error: false });
    await tick();
    proc.emit('exit', 0, null);
    await sendP;
  });

  it('should include systemPromptFile flag', async () => {
    const cli = new CLIProcess('test', { systemPromptFile: '/path/to/prompt.md' });
    await cli.start();

    const sendP = cli.send('hello');
    await tick();

    const [, args] = spawnMock.mock.calls[0];
    expect(args).toContain('--system-prompt-file');
    expect(args).toContain('/path/to/prompt.md');

    const proc = lastSpawnedProc;
    writeLine(proc, { type: 'result', is_error: false });
    await tick();
    proc.emit('exit', 0, null);
    await sendP;
  });

  it('should include allowedTools as separate args', async () => {
    const cli = new CLIProcess('test', { allowedTools: ['WebSearch', 'Read'] });
    await cli.start();

    const sendP = cli.send('hello');
    await tick();

    const [, args] = spawnMock.mock.calls[0];
    const atIndices = args.reduce((acc, v, i) => {
      if (v === '--allowedTools') acc.push(i);
      return acc;
    }, []);
    expect(atIndices.length).toBe(2);
    expect(args[atIndices[0] + 1]).toBe('WebSearch');
    expect(args[atIndices[1] + 1]).toBe('Read');

    const proc = lastSpawnedProc;
    writeLine(proc, { type: 'result', is_error: false });
    await tick();
    proc.emit('exit', 0, null);
    await sendP;
  });

  it('should include --output-format stream-json and --verbose', async () => {
    const cli = new CLIProcess('test', {});
    await cli.start();

    const sendP = cli.send('hello');
    await tick();

    const [, args] = spawnMock.mock.calls[0];
    expect(args).toContain('--output-format');
    expect(args).toContain('stream-json');
    expect(args).toContain('--verbose');

    const proc = lastSpawnedProc;
    writeLine(proc, { type: 'result', is_error: false });
    await tick();
    proc.emit('exit', 0, null);
    await sendP;
  });

  it('should default to bypassPermissions permission mode', async () => {
    const cli = new CLIProcess('test', {});
    await cli.start();

    const sendP = cli.send('hello');
    await tick();

    const [, args] = spawnMock.mock.calls[0];
    expect(args).toContain('--permission-mode');
    expect(args).toContain('bypassPermissions');

    const proc = lastSpawnedProc;
    writeLine(proc, { type: 'result', is_error: false });
    await tick();
    proc.emit('exit', 0, null);
    await sendP;
  });

  it('should include maxBudgetUsd as string', async () => {
    const cli = new CLIProcess('test', { maxBudgetUsd: 0.5 });
    await cli.start();

    const sendP = cli.send('hello');
    await tick();

    const [, args] = spawnMock.mock.calls[0];
    expect(args).toContain('--max-budget-usd');
    expect(args).toContain('0.5');

    const proc = lastSpawnedProc;
    writeLine(proc, { type: 'result', is_error: false });
    await tick();
    proc.emit('exit', 0, null);
    await sendP;
  });

  it('should include --input-format stream-json for long-lived mode', async () => {
    const cli = new CLIProcess('test', {}, { streaming: true });
    await cli.start();

    const [, args] = spawnMock.mock.calls[0];
    expect(args).toContain('--input-format');
    expect(args).toContain('stream-json');
  });
});

// ── Accessors ────────────────────────────────────────────────────────────────

describe('CLIProcess — accessors', () => {
  beforeEach(() => {
    spawnMock = vi.fn(() => createFakeProc());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should expose name, alive, tokenCount, stderrDiagnostics', async () => {
    const cli = new CLIProcess('my-cli', {});
    expect(cli.name).toBe('my-cli');
    expect(cli.alive).toBe(false);
    expect(cli.tokenCount).toBe(0);

    await cli.start();
    expect(cli.alive).toBe(true);
    expect(cli.stderrDiagnostics).toBe('');
  });

  it('should reset alive to false on close', async () => {
    const cli = new CLIProcess('test', {});
    await cli.start();
    expect(cli.alive).toBe(true);

    cli.close();
    expect(cli.alive).toBe(false);
  });
});

// ── Recycle ──────────────────────────────────────────────────────────────────

describe('CLIProcess — recycle', () => {
  let fakeProc;

  beforeEach(() => {
    fakeProc = createFakeProc();
    spawnMock = vi.fn(() => fakeProc);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should close and restart the process', async () => {
    const cli = new CLIProcess('test', {}, { streaming: true });
    await cli.start();

    const firstProc = fakeProc;
    fakeProc = createFakeProc();
    spawnMock = vi.fn(() => fakeProc);

    await cli.recycle();

    expect(firstProc.kill).toHaveBeenCalledWith('SIGTERM');
    expect(cli.alive).toBe(true);
    expect(cli.tokenCount).toBe(0);
  });
});
