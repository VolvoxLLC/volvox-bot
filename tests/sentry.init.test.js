/**
 * Tests for Sentry initialization branches: beforeSend filter, tracesSampleRate parsing,
 * and environment resolution inside the `if (dsn)` block.
 *
 * These tests exercise the code paths at src/sentry.js lines 42-65 that are NOT covered
 * by the existing sentry.test.js (which only checks sentryEnabled and exports).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// We need to intercept Sentry.init to inspect the config it receives.
const initSpy = vi.fn();
vi.mock('@sentry/node', () => {
  return {
    init: initSpy,
    captureException: vi.fn(),
    captureMessage: vi.fn(),
  };
});

describe('sentry.js — init branch coverage', () => {
  beforeEach(() => {
    vi.resetModules();
    initSpy.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ── tracesSampleRate IIFE branches ──────────────────────────────────

  it('should use parsed SENTRY_TRACES_RATE when it is a valid number', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://key@o0.ingest.sentry.io/0');
    vi.stubEnv('SENTRY_TRACES_RATE', '0.5');

    await import('../src/sentry.js');

    expect(initSpy).toHaveBeenCalledTimes(1);
    const cfg = initSpy.mock.calls[0][0];
    expect(cfg.tracesSampleRate).toBe(0.5);
  });

  it('should accept SENTRY_TRACES_RATE=0 to disable tracing', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://key@o0.ingest.sentry.io/0');
    vi.stubEnv('SENTRY_TRACES_RATE', '0');

    await import('../src/sentry.js');

    const cfg = initSpy.mock.calls[0][0];
    expect(cfg.tracesSampleRate).toBe(0);
  });

  it('should fall back to 0.1 when SENTRY_TRACES_RATE is non-numeric', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://key@o0.ingest.sentry.io/0');
    vi.stubEnv('SENTRY_TRACES_RATE', 'banana');

    await import('../src/sentry.js');

    const cfg = initSpy.mock.calls[0][0];
    expect(cfg.tracesSampleRate).toBe(0.1);
  });

  it('should fall back to 0.1 when SENTRY_TRACES_RATE is not set', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://key@o0.ingest.sentry.io/0');
    delete process.env.SENTRY_TRACES_RATE;

    await import('../src/sentry.js');

    const cfg = initSpy.mock.calls[0][0];
    expect(cfg.tracesSampleRate).toBe(0.1);
  });

  // ── environment resolution ──────────────────────────────────────────

  it('should use SENTRY_ENVIRONMENT when set', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://key@o0.ingest.sentry.io/0');
    vi.stubEnv('SENTRY_ENVIRONMENT', 'staging');

    await import('../src/sentry.js');

    const cfg = initSpy.mock.calls[0][0];
    expect(cfg.environment).toBe('staging');
  });

  it('should fall back to NODE_ENV when SENTRY_ENVIRONMENT is not set', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://key@o0.ingest.sentry.io/0');
    delete process.env.SENTRY_ENVIRONMENT;
    vi.stubEnv('NODE_ENV', 'development');

    await import('../src/sentry.js');

    const cfg = initSpy.mock.calls[0][0];
    expect(cfg.environment).toBe('development');
  });

  it('should fall back to "production" when neither env var is set', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://key@o0.ingest.sentry.io/0');
    delete process.env.SENTRY_ENVIRONMENT;
    delete process.env.NODE_ENV;

    await import('../src/sentry.js');

    const cfg = initSpy.mock.calls[0][0];
    expect(cfg.environment).toBe('production');
  });

  // ── beforeSend filter ───────────────────────────────────────────────

  it('should drop AbortError events in beforeSend', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://key@o0.ingest.sentry.io/0');

    await import('../src/sentry.js');

    const cfg = initSpy.mock.calls[0][0];
    const beforeSend = cfg.beforeSend;
    expect(typeof beforeSend).toBe('function');

    const abortEvent = {
      exception: { values: [{ value: 'AbortError: The user aborted a request.' }] },
    };
    expect(beforeSend(abortEvent)).toBeNull();
  });

  it('should drop "The operation was aborted" events in beforeSend', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://key@o0.ingest.sentry.io/0');

    await import('../src/sentry.js');

    const beforeSend = initSpy.mock.calls[0][0].beforeSend;

    const opAborted = {
      exception: { values: [{ value: 'The operation was aborted' }] },
    };
    expect(beforeSend(opAborted)).toBeNull();
  });

  it('should pass through normal error events in beforeSend', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://key@o0.ingest.sentry.io/0');

    await import('../src/sentry.js');

    const beforeSend = initSpy.mock.calls[0][0].beforeSend;

    const normalEvent = {
      exception: { values: [{ value: 'TypeError: cannot read property x of undefined' }] },
    };
    expect(beforeSend(normalEvent)).toBe(normalEvent);
  });

  it('should scrub sensitive keys from event.extra in beforeSend', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://key@o0.ingest.sentry.io/0');

    await import('../src/sentry.js');

    const beforeSend = initSpy.mock.calls[0][0].beforeSend;

    const event = {
      exception: { values: [{ value: 'Error' }] },
      extra: {
        ip: '1.2.3.4',
        accessToken: 'secret-token',
        password: 'hunter2',
        token: 'tok',
        cookie: 'session=abc',
        apiKey: 'key-123',
        authorization: 'Bearer xyz',
        secret: 'shh',
        stack: 'Error at ...',
        safeField: 'keep-this',
      },
    };

    const result = beforeSend(event);
    expect(result).not.toBeNull();
    expect(result.extra.ip).toBeUndefined();
    expect(result.extra.accessToken).toBeUndefined();
    expect(result.extra.password).toBeUndefined();
    expect(result.extra.token).toBeUndefined();
    expect(result.extra.cookie).toBeUndefined();
    expect(result.extra.apiKey).toBeUndefined();
    expect(result.extra.authorization).toBeUndefined();
    expect(result.extra.secret).toBeUndefined();
    expect(result.extra.stack).toBeUndefined();
    expect(result.extra.safeField).toBe('keep-this');
  });

  it('should handle events with no extra context in beforeSend', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://key@o0.ingest.sentry.io/0');

    await import('../src/sentry.js');

    const beforeSend = initSpy.mock.calls[0][0].beforeSend;

    const event = { exception: { values: [{ value: 'Error' }] } };
    expect(beforeSend(event)).toBe(event);
  });

  it('should handle events with no exception values in beforeSend', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://key@o0.ingest.sentry.io/0');

    await import('../src/sentry.js');

    const beforeSend = initSpy.mock.calls[0][0].beforeSend;

    const event = { exception: {} };
    expect(beforeSend(event)).toBe(event);
  });

  // ── DSN not set — should NOT call init ──────────────────────────────

  it('should not call Sentry.init when DSN is empty', async () => {
    vi.stubEnv('SENTRY_DSN', '');

    await import('../src/sentry.js');

    expect(initSpy).not.toHaveBeenCalled();
  });
});
