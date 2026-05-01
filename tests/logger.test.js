import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockAmplitudeFlush, mockAmplitudeInit, mockAmplitudeTrack } = vi.hoisted(() => ({
  mockAmplitudeFlush: vi.fn(),
  mockAmplitudeInit: vi.fn(),
  mockAmplitudeTrack: vi.fn(),
}));

/**
 * SHARED MOCK PATTERN for tests needing fresh logger imports:
 *
 * Tests that need a fresh logger with custom config should:
 * 1. Call vi.resetModules()
 * 2. Call vi.mock() for each module (node:fs, winston-daily-rotate-file, ../src/transports/postgres.js)
 * 3. Await import('../src/logger.js')
 *
 * Note: vi.mock() is hoisted, so these calls must be inline in the test body,
 * not wrapped in a helper function.
 */

vi.mock('@amplitude/analytics-node', () => ({
  flush: mockAmplitudeFlush,
  init: mockAmplitudeInit,
  track: mockAmplitudeTrack,
  Types: {
    LogLevel: {
      None: 'none',
    },
    ServerZone: {
      EU: 'EU',
      US: 'US',
    },
  },
}));

// We need to test the logger module, but it reads config.json at import time.
// Mock fs to control what it reads.
vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue('{}'),
  mkdirSync: vi.fn(),
}));

// Mock winston-daily-rotate-file — use `function` keyword so the mock is new-able.
// Must include `log` method as winston validates transports have one.
vi.mock('winston-daily-rotate-file', () => ({
  default: vi.fn().mockImplementation(function () {
    this.on = vi.fn();
    this.log = vi.fn();
  }),
}));

// Mock PostgresTransport (imported by logger.js but only used when explicitly added)
// Use `function` keyword so the mock is new-able (arrow functions cannot be constructors).
vi.mock('../src/transports/postgres.js', () => ({
  PostgresTransport: vi.fn().mockImplementation(function () {
    this.on = vi.fn();
    this.log = vi.fn();
    this.close = vi.fn();
  }),
}));

// NOTE: Logger module is cached after first import. Tests that need fresh
// module state use vi.resetModules() before re-importing. Tests sharing
// the same import get the same winston logger instance.
describe('logger module', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('should export debug, info, warn, error functions', async () => {
    const logger = await import('../src/logger.js');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  }, 30_000);

  it('should export default object with all log functions', async () => {
    const logger = await import('../src/logger.js');
    expect(typeof logger.default.debug).toBe('function');
    expect(typeof logger.default.info).toBe('function');
    expect(typeof logger.default.warn).toBe('function');
    expect(typeof logger.default.error).toBe('function');
    expect(logger.default).toHaveProperty('logger');
  });

  it('should call log functions without errors', async () => {
    const logger = await import('../src/logger.js');
    // These should not throw
    logger.debug('debug message', { key: 'value' });
    logger.info('info message', { key: 'value' });
    logger.warn('warn message', { key: 'value' });
    logger.error('error message', { key: 'value' });
  });

  it('should call with empty meta', async () => {
    const logger = await import('../src/logger.js');
    logger.debug('debug');
    logger.info('info');
    logger.warn('warn');
    logger.error('error');
  });

  it('should redact sensitive fields', async () => {
    const logger = await import('../src/logger.js');
    // Spy on console transport to capture actual output after redaction
    const transport = logger.default.logger.transports[0];
    const writeSpy = vi.spyOn(transport, 'log').mockImplementation((_info, cb) => cb?.());

    logger.info('test', {
      token: 'secret-token',
      DISCORD_TOKEN: 'secret',
      password: 'pass',
      apiKey: 'key',
      nested: {
        token: 'nested-secret',
        safe: 'visible',
      },
    });

    expect(writeSpy).toHaveBeenCalled();
    const loggedInfo = writeSpy.mock.calls[0][0];
    expect(loggedInfo.token).toBe('[REDACTED]');
    expect(loggedInfo.DISCORD_TOKEN).toBe('[REDACTED]');
    expect(loggedInfo.password).toBe('[REDACTED]');
    expect(loggedInfo.apiKey).toBe('[REDACTED]');
    expect(loggedInfo.nested.token).toBe('[REDACTED]');
    expect(loggedInfo.nested.safe).toBe('visible');
  });

  it('should handle array meta values in filter', async () => {
    const logger = await import('../src/logger.js');
    logger.info('test', {
      items: [{ token: 'secret', name: 'item1' }, { name: 'item2' }],
    });
  });

  it('keeps Amplitude log telemetry active when API key is loaded after logger import', async () => {
    vi.resetModules();
    vi.stubEnv('AMPLITUDE_API_KEY', '');

    const logger = await import('../src/logger.js');

    expect(
      logger.default.logger.transports.some(
        (transport) => transport.constructor?.name === 'AmplitudeTransport',
      ),
    ).toBe(true);

    logger.info('before dotenv', { module: 'startup' });
    expect(mockAmplitudeInit).not.toHaveBeenCalled();
    expect(mockAmplitudeTrack).not.toHaveBeenCalled();

    vi.stubEnv('AMPLITUDE_API_KEY', 'runtime-key');
    vi.stubEnv('AMPLITUDE_SERVER_ZONE', 'EU');

    logger.info('after dotenv', { module: 'startup' });

    expect(mockAmplitudeInit).toHaveBeenCalledWith('runtime-key', {
      logLevel: 'none',
      serverZone: 'EU',
    });
    expect(mockAmplitudeTrack).toHaveBeenCalledWith(
      'bot_log_recorded',
      expect.objectContaining({
        level: 'info',
        message: 'after dotenv',
        module: 'startup',
      }),
      { device_id: 'volvox-bot-server' },
    );
  });

  it('keeps the Amplitude transport no-op safe when Amplitude remains disabled', async () => {
    vi.resetModules();
    vi.stubEnv('AMPLITUDE_API_KEY', '');

    const logger = await import('../src/logger.js');

    expect(
      logger.default.logger.transports.some(
        (transport) => transport.constructor?.name === 'AmplitudeTransport',
      ),
    ).toBe(true);

    expect(() => logger.warn('amplitude disabled', { module: 'startup' })).not.toThrow();
    expect(mockAmplitudeInit).not.toHaveBeenCalled();
    expect(mockAmplitudeTrack).not.toHaveBeenCalled();
  });

  // ── filterSensitiveData: Error handling ──────────────────────────────────
  // Regression coverage for macroscope review comment 3120523562 — Error
  // instances must be cloned and scrubbed so a nested `{ cause: Error(...) }`
  // can't leak a credential past the top-level `info.message` / `info.stack`
  // scrubbers.
  describe('filterSensitiveData — Error handling', () => {
    it('scrubs Bearer tokens from Error.message when the error rides along as meta', async () => {
      const logger = await import('../src/logger.js');
      const transport = logger.default.logger.transports[0];
      const writeSpy = vi.spyOn(transport, 'log').mockImplementation((_info, cb) => cb?.());

      const err = new Error('request failed: Bearer sk-abcdefghijklmnopqrstuvwxyz123');
      logger.info('upstream error', { err });

      const loggedInfo = writeSpy.mock.calls[0][0];
      expect(loggedInfo.err).toBeInstanceOf(Error);
      expect(loggedInfo.err.message).toContain('[REDACTED]');
      expect(loggedInfo.err.message).not.toContain('sk-abcdefghij');
    });

    it('scrubs sk- secrets from a nested Error.cause', async () => {
      const logger = await import('../src/logger.js');
      const transport = logger.default.logger.transports[0];
      const writeSpy = vi.spyOn(transport, 'log').mockImplementation((_info, cb) => cb?.());

      const cause = new Error('auth header leaked: sk-anthabcdefghijklmnopqrstuvwxyz');
      logger.info('upstream error', { cause });

      const loggedInfo = writeSpy.mock.calls[0][0];
      expect(loggedInfo.cause).toBeInstanceOf(Error);
      expect(loggedInfo.cause.message).toContain('[REDACTED]');
      expect(loggedInfo.cause.message).not.toContain('sk-anthabcdefghij');
    });

    it('preserves the Error subclass after cloning', async () => {
      const logger = await import('../src/logger.js');
      const transport = logger.default.logger.transports[0];
      const writeSpy = vi.spyOn(transport, 'log').mockImplementation((_info, cb) => cb?.());

      const err = new TypeError('Bearer sk-subclasspreservetestabcdefghij');
      logger.info('type error', { err });

      const loggedInfo = writeSpy.mock.calls[0][0];
      expect(loggedInfo.err).toBeInstanceOf(TypeError);
      expect(loggedInfo.err).toBeInstanceOf(Error);
      expect(loggedInfo.err.name).toBe('TypeError');
      expect(loggedInfo.err.message).toContain('[REDACTED]');
    });

    it('scrubs Bearer tokens from Error.stack', async () => {
      const logger = await import('../src/logger.js');
      const transport = logger.default.logger.transports[0];
      const writeSpy = vi.spyOn(transport, 'log').mockImplementation((_info, cb) => cb?.());

      const err = new Error('outer');
      err.stack = 'Error: outer\n    at fn (Bearer sk-stacktokenleakedabcdefghijklmn)';
      logger.info('stack test', { err });

      const loggedInfo = writeSpy.mock.calls[0][0];
      expect(loggedInfo.err.stack).toContain('[REDACTED]');
      expect(loggedInfo.err.stack).not.toContain('sk-stacktoken');
    });

    it('redacts sensitive keys attached to an Error as enumerable own-properties', async () => {
      const logger = await import('../src/logger.js');
      const transport = logger.default.logger.transports[0];
      const writeSpy = vi.spyOn(transport, 'log').mockImplementation((_info, cb) => cb?.());

      const err = new Error('upstream');
      err.apiKey = 'should-not-appear-in-logs';
      err.code = 'ECONNREFUSED'; // non-sensitive — should pass through
      logger.info('attached fields', { err });

      const loggedInfo = writeSpy.mock.calls[0][0];
      expect(loggedInfo.err.apiKey).toBe('[REDACTED]');
      expect(loggedInfo.err.code).toBe('ECONNREFUSED');
    });

    // Regression coverage for coderabbit 3120731415 — the previous
    // implementation used `new Ctor(scrubbedMessage)`, which treats
    // `AggregateError`'s first constructor argument as an iterable of
    // sub-errors rather than a message string. That caused the message to
    // be silently dropped and threw on non-iterable strings.
    it('preserves AggregateError subclass, errors, and scrubs message', async () => {
      const logger = await import('../src/logger.js');
      const transport = logger.default.logger.transports[0];
      const writeSpy = vi.spyOn(transport, 'log').mockImplementation((_info, cb) => cb?.());

      const sub1 = new Error('first failure: Bearer sk-aggsubonetokenabcdefghijklmn');
      const sub2 = new Error('second failure: unrelated');
      const agg = new AggregateError([sub1, sub2], 'all upstreams failed');

      logger.info('aggregate failure', { err: agg });

      const loggedInfo = writeSpy.mock.calls[0][0];
      expect(loggedInfo.err).toBeInstanceOf(AggregateError);
      expect(loggedInfo.err).toBeInstanceOf(Error);
      // Message survives the clone (previously silently dropped by `new AggregateError(str)`).
      expect(loggedInfo.err.message).toBe('all upstreams failed');
      // Sub-errors carried through and scrubbed recursively.
      expect(Array.isArray(loggedInfo.err.errors)).toBe(true);
      expect(loggedInfo.err.errors).toHaveLength(2);
      expect(loggedInfo.err.errors[0]).toBeInstanceOf(Error);
      expect(loggedInfo.err.errors[0].message).toContain('[REDACTED]');
      expect(loggedInfo.err.errors[0].message).not.toContain('sk-aggsubone');
      expect(loggedInfo.err.errors[1].message).toBe('second failure: unrelated');
    });

    it('scrubs secrets inside AggregateError top-level message', async () => {
      const logger = await import('../src/logger.js');
      const transport = logger.default.logger.transports[0];
      const writeSpy = vi.spyOn(transport, 'log').mockImplementation((_info, cb) => cb?.());

      const agg = new AggregateError(
        [new Error('inner')],
        'outer ctx: Bearer sk-aggtopleveltokenabcdefghijklmn',
      );

      logger.info('aggregate top msg', { err: agg });

      const loggedInfo = writeSpy.mock.calls[0][0];
      expect(loggedInfo.err).toBeInstanceOf(AggregateError);
      expect(loggedInfo.err.message).toContain('[REDACTED]');
      expect(loggedInfo.err.message).not.toContain('sk-aggtoplevel');
    });

    it('scrubs Error.cause set as a non-enumerable constructor option', async () => {
      const logger = await import('../src/logger.js');
      const transport = logger.default.logger.transports[0];
      const writeSpy = vi.spyOn(transport, 'log').mockImplementation((_info, cb) => cb?.());

      // `cause` set via `new Error(msg, { cause })` is a non-enumerable own prop.
      const innerCause = new Error('Bearer sk-nonenumerabletokenabcdefghijklmnop');
      const outer = new Error('outer failed', { cause: innerCause });

      logger.info('nested error', { err: outer });

      const loggedInfo = writeSpy.mock.calls[0][0];
      expect(loggedInfo.err).toBeInstanceOf(Error);
      expect(loggedInfo.err.cause).toBeInstanceOf(Error);
      expect(loggedInfo.err.cause.message).toContain('[REDACTED]');
      expect(loggedInfo.err.cause.message).not.toContain('sk-nonenumerable');
    });

    // Regression coverage for coderabbit 3120956111 / macroscope 3120949012 —
    // a cyclic Error graph (e.g. `err.cause = err`) previously stack-overflowed
    // the scrubber because every recursion minted a fresh clone and re-entered
    // the same node. The WeakMap short-circuits the back-reference.
    it('does not stack-overflow on a self-referencing Error.cause', async () => {
      const logger = await import('../src/logger.js');
      const transport = logger.default.logger.transports[0];
      const writeSpy = vi.spyOn(transport, 'log').mockImplementation((_info, cb) => cb?.());

      const err = new Error('cyclic: Bearer sk-selfcausetokenabcdefghijklmnop');
      // Direct self-cycle — cause points back at the error itself.
      Object.defineProperty(err, 'cause', {
        value: err,
        writable: true,
        enumerable: false,
        configurable: true,
      });

      const start = Date.now();
      logger.info('cyclic cause', { err });
      const elapsed = Date.now() - start;

      // Bounded time — if recursion escaped the guard this would either throw
      // "Maximum call stack size exceeded" or run until the test timeout.
      expect(elapsed).toBeLessThan(1000);

      const loggedInfo = writeSpy.mock.calls[0][0];
      expect(loggedInfo.err).toBeInstanceOf(Error);
      expect(loggedInfo.err.message).toContain('[REDACTED]');
      expect(loggedInfo.err.message).not.toContain('sk-selfcause');
      // cause resolves to the clone itself (back-reference preserved, not
      // re-cloned into infinity).
      expect(loggedInfo.err.cause).toBe(loggedInfo.err);
    });

    it('does not recurse on an AggregateError whose errors array contains itself', async () => {
      const logger = await import('../src/logger.js');
      const transport = logger.default.logger.transports[0];
      const writeSpy = vi.spyOn(transport, 'log').mockImplementation((_info, cb) => cb?.());

      const agg = new AggregateError([], 'self-ref: Bearer sk-aggselfreftokenabcdefghij');
      // Cyclic: agg.errors contains agg itself.
      agg.errors = [agg];

      const start = Date.now();
      logger.info('cyclic aggregate', { err: agg });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(1000);

      const loggedInfo = writeSpy.mock.calls[0][0];
      expect(loggedInfo.err).toBeInstanceOf(AggregateError);
      expect(loggedInfo.err.message).toContain('[REDACTED]');
      expect(loggedInfo.err.message).not.toContain('sk-aggselfref');
      expect(Array.isArray(loggedInfo.err.errors)).toBe(true);
      expect(loggedInfo.err.errors).toHaveLength(1);
      // Sub-error is the clone itself — back-reference preserved.
      expect(loggedInfo.err.errors[0]).toBe(loggedInfo.err);
    });

    // Regression coverage for macroscope 3120949010 — previous implementation
    // only handled `Array.isArray(err.errors)`, and the enumerable-copy loop
    // unconditionally skipped the `errors` key, so a non-array `errors` field
    // on a custom error (e.g. a ValidationError with `{ field: 'invalid' }`)
    // was silently dropped.
    it('preserves and scrubs a non-array errors property on a custom Error', async () => {
      const logger = await import('../src/logger.js');
      const transport = logger.default.logger.transports[0];
      const writeSpy = vi.spyOn(transport, 'log').mockImplementation((_info, cb) => cb?.());

      const err = new Error('validation failed');
      err.errors = {
        field: 'invalid',
        apiKey: 'should-be-redacted',
        detail: 'Bearer sk-nonarrayerrorstokenabcdefghij',
      };

      logger.info('validation error', { err });

      const loggedInfo = writeSpy.mock.calls[0][0];
      expect(loggedInfo.err).toBeInstanceOf(Error);
      // Shape preserved (object, not array, not undefined).
      expect(loggedInfo.err.errors).toBeDefined();
      expect(Array.isArray(loggedInfo.err.errors)).toBe(false);
      expect(typeof loggedInfo.err.errors).toBe('object');
      // Non-sensitive passthrough.
      expect(loggedInfo.err.errors.field).toBe('invalid');
      // Sensitive key redacted.
      expect(loggedInfo.err.errors.apiKey).toBe('[REDACTED]');
      // Inline secret scrubbed from the string value.
      expect(loggedInfo.err.errors.detail).toContain('[REDACTED]');
      expect(loggedInfo.err.errors.detail).not.toContain('sk-nonarrayerrors');
    });
  });

  it('should load with file output enabled config', async () => {
    vi.resetModules();

    const fs = await import('node:fs');
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(
      JSON.stringify({ logging: { level: 'debug', fileOutput: true } }),
    );

    const logger = await import('../src/logger.js');
    expect(typeof logger.info).toBe('function');
  });

  it('should handle config parse errors gracefully', async () => {
    vi.resetModules();

    const fs = await import('node:fs');
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('invalid json');

    const logger = await import('../src/logger.js');
    expect(typeof logger.info).toBe('function');
  });

  it('should export addPostgresTransport and removePostgresTransport functions', async () => {
    const logger = await import('../src/logger.js');
    expect(typeof logger.addPostgresTransport).toBe('function');
    expect(typeof logger.removePostgresTransport).toBe('function');
  });

  describe('addPostgresTransport', () => {
    it('should add a transport to the winston logger and return it', async () => {
      vi.resetModules();

      const logger = await import('../src/logger.js');
      const addSpy = vi.spyOn(logger.default.logger, 'add');
      const mockPool = { query: vi.fn(), connect: vi.fn() };
      const transport = logger.addPostgresTransport(mockPool);

      expect(transport).not.toBeNull();
      expect(typeof transport.log).toBe('function');
      expect(typeof transport.close).toBe('function');
      expect(addSpy).toHaveBeenCalledWith(transport);
    });
  });

  describe('removePostgresTransport', () => {
    it('should call close() and remove the transport from the logger', async () => {
      const logger = await import('../src/logger.js');
      const mockTransport = { close: vi.fn().mockResolvedValue(undefined) };
      const removeSpy = vi.spyOn(logger.default.logger, 'remove');

      await logger.removePostgresTransport(mockTransport);

      expect(mockTransport.close).toHaveBeenCalledTimes(1);
      expect(removeSpy).toHaveBeenCalledWith(mockTransport);
    });

    it('should handle null transport gracefully', async () => {
      const logger = await import('../src/logger.js');

      // Should not throw
      await expect(logger.removePostgresTransport(null)).resolves.toBeUndefined();
    });
  });
});
