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

  it('should leave Sentry default PII collection disabled unless explicitly enabled', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://key@o0.ingest.sentry.io/0');

    await import('../src/sentry.js');

    expect(initSpy).toHaveBeenCalledTimes(1);
    const cfg = initSpy.mock.calls[0][0];
    expect(cfg.sendDefaultPii).toBe(false);
  });

  it('should enable Sentry default PII collection when SENTRY_SEND_DEFAULT_PII is true', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://key@o0.ingest.sentry.io/0');
    vi.stubEnv('SENTRY_SEND_DEFAULT_PII', 'true');

    await import('../src/sentry.js');

    expect(initSpy).toHaveBeenCalledTimes(1);
    const cfg = initSpy.mock.calls[0][0];
    expect(cfg.sendDefaultPii).toBe(true);
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
        ip: 'client.example',
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

  it('should scrub sensitive request and user fields in beforeSend', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://key@o0.ingest.sentry.io/0');
    vi.stubEnv('SENTRY_SEND_DEFAULT_PII', 'true');

    await import('../src/sentry.js');

    const beforeSend = initSpy.mock.calls[0][0].beforeSend;

    const event = {
      exception: { values: [{ value: 'Error' }] },
      user: {
        id: 'safe-user-key',
        email: 'person@example.com',
        ip_address: 'client.example',
      },
      request: {
        cookies: { session: 'secret' },
        query_string: 'token=secret&email=person@example.com',
        url: 'https://user:pass@example.com/callback?token=secret&email=person@example.com#done',
        headers: {
          authorization: 'Bearer secret',
          cookie: 'session=secret',
          'x-api-key': 'secret',
          accept: 'application/json',
        },
        data: {
          password: 'secret',
          access_token: 'secret',
          safeField: 'keep-this',
        },
      },
    };

    const result = beforeSend(event);
    expect(result.user).toEqual({ id: 'safe-user-key' });
    expect(result.request.cookies).toBeUndefined();
    expect(result.request.query_string).toBeUndefined();
    expect(result.request.url).toBe('https://example.com/callback');
    expect(result.request.headers).toEqual({ accept: 'application/json' });
    expect(result.request.data).toEqual({ safeField: 'keep-this' });
  });

  it('should scrub common IP metadata keys from event metadata in beforeSend', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://key@o0.ingest.sentry.io/0');

    await import('../src/sentry.js');

    const beforeSend = initSpy.mock.calls[0][0].beforeSend;
    const event = {
      exception: { values: [{ value: 'Error' }] },
      extra: {
        clientIp: 'client.example',
        remoteIp: 'remote.example',
        userIp: 'user.example',
        lastLoginIp: 'login.example',
        zip: '90210',
        shipping: 'keep-this',
      },
    };

    expect(beforeSend(event).extra).toEqual({
      zip: '90210',
      shipping: 'keep-this',
    });
  });

  it('should scrub nested email keys from event metadata in beforeSend', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://key@o0.ingest.sentry.io/0');

    await import('../src/sentry.js');

    const beforeSend = initSpy.mock.calls[0][0].beforeSend;
    const event = {
      exception: { values: [{ value: 'Error' }] },
      extra: {
        profile: {
          email: 'person@example.com',
          'e-mail': 'person@example.com',
          safeField: 'keep-this',
        },
      },
    };

    expect(beforeSend(event).extra).toEqual({
      profile: {
        safeField: 'keep-this',
      },
    });
  });

  it('should redact inline secrets from free-form event metadata strings in beforeSend', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://key@o0.ingest.sentry.io/0');

    await import('../src/sentry.js');

    const beforeSend = initSpy.mock.calls[0][0].beforeSend;
    const event = {
      exception: { values: [{ value: 'Error' }] },
      extra: {
        detail: 'using Bearer top-level-token-12345',
        nested: {
          openAiKey: 'sk-abcdefghijk1234',
          slack: 'token xoxb_abcdefghijk1234567890 leaked',
          github: 'token ghp_abcdefghijk1234567890 leaked',
          githubPat: 'token github_pat_abcdefghijk1234567890 leaked',
          callback: 'callback?access_token=secret-value&safe=1',
          assignment: 'token=secret-value safe=true',
        },
      },
      contexts: {
        retry: { reason: 'secret=hidden-value' },
      },
    };

    expect(beforeSend(event).extra).toEqual({
      detail: 'using [REDACTED]',
      nested: {
        openAiKey: '[REDACTED]',
        slack: 'token [REDACTED] leaked',
        github: 'token [REDACTED] leaked',
        githubPat: 'token [REDACTED] leaked',
        callback: 'callback?access_token=[REDACTED]&safe=1',
        assignment: 'token=[REDACTED] safe=true',
      },
    });
    expect(beforeSend(event).contexts).toEqual({
      retry: { reason: 'secret=[REDACTED]' },
    });
  });

  it('should redact inline secrets from request string data in beforeSend', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://key@o0.ingest.sentry.io/0');

    await import('../src/sentry.js');

    const beforeSend = initSpy.mock.calls[0][0].beforeSend;
    const event = {
      exception: { values: [{ value: 'Error' }] },
      request: {
        url: 'https://example.com/callback?token=secret#token=fragment-secret',
        data: 'payload Bearer request-token-12345',
      },
    };

    expect(beforeSend(event).request).toEqual({
      url: 'https://example.com/callback',
      data: 'payload [REDACTED]',
    });
  });

  it('should protect recursive scrubbing against true cycles while preserving shared references', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://key@o0.ingest.sentry.io/0');

    await import('../src/sentry.js');

    const beforeSend = initSpy.mock.calls[0][0].beforeSend;
    const cycle = { safeField: 'keep-this' };
    cycle.self = cycle;
    const shared = { ok: true };
    const event = {
      exception: { values: [{ value: 'Error' }] },
      extra: {
        cycle,
        first: shared,
        second: shared,
      },
    };

    expect(beforeSend(event).extra).toEqual({
      cycle: {
        safeField: 'keep-this',
        self: '[Circular]',
      },
      first: { ok: true },
      second: { ok: true },
    });
  });

  it('should scrub breadcrumb data and strip URL query metadata in beforeSend', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://key@o0.ingest.sentry.io/0');

    await import('../src/sentry.js');

    const beforeSend = initSpy.mock.calls[0][0].beforeSend;
    const event = {
      exception: { values: [{ value: 'Error' }] },
      breadcrumbs: [
        {
          category: 'fetch',
          message: 'fetch failed with Bearer breadcrumb-token-12345',
          data: {
            url: 'https://api-user:api-pass@api.example.com/guilds?token=secret&email=person%40example.com#done',
            nested: {
              requestUrl:
                'https://callback-user:callback-pass@example.com/callbacks?access_token=secret#complete',
              email: 'person@example.com',
              safeField: 'keep-this',
            },
          },
        },
      ],
    };

    expect(beforeSend(event).breadcrumbs).toEqual([
      {
        category: 'fetch',
        message: 'fetch failed with [REDACTED]',
        data: {
          url: 'https://api.example.com/guilds',
          nested: {
            requestUrl: 'https://example.com/callbacks',
            safeField: 'keep-this',
          },
        },
      },
    ]);
  });

  it('should scrub transaction and span events before sending performance payloads', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://key@o0.ingest.sentry.io/0');
    vi.stubEnv('SENTRY_SEND_DEFAULT_PII', 'true');

    await import('../src/sentry.js');

    const cfg = initSpy.mock.calls[0][0];
    const transaction = {
      type: 'transaction',
      request: {
        query_string: 'api_key=secret',
        url: '/internal/jobs?api_key=secret#queue',
        headers: { cookie: 'session=secret', accept: 'application/json' },
        data: { api_key: 'secret', safeField: 'keep-this' },
      },
    };
    const span = {
      data: {
        authorization: 'Bearer secret',
        safeField: 'keep-this',
      },
    };

    expect(cfg.beforeSendTransaction(transaction)).toEqual({
      type: 'transaction',
      request: {
        url: '/internal/jobs',
        headers: { accept: 'application/json' },
        data: { safeField: 'keep-this' },
      },
    });
    expect(cfg.beforeSendSpan(span)).toEqual({
      data: {
        safeField: 'keep-this',
      },
    });
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

  // ── contexts and data scrubbing ─────────────────────────────────────

  it('should scrub sensitive keys from event.contexts in beforeSend', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://key@o0.ingest.sentry.io/0');

    await import('../src/sentry.js');

    const beforeSend = initSpy.mock.calls[0][0].beforeSend;

    const event = {
      exception: { values: [{ value: 'Error' }] },
      contexts: {
        runtime: {
          name: 'node',
          version: '22.0.0',
          token: 'secret-runtime-token',
        },
        device: {
          name: 'server',
          authorization: 'Bearer xyz',
        },
      },
    };

    const result = beforeSend(event);
    expect(result).not.toBeNull();
    expect(result.contexts.runtime.token).toBeUndefined();
    expect(result.contexts.runtime.name).toBe('node');
    expect(result.contexts.device.authorization).toBeUndefined();
    expect(result.contexts.device.name).toBe('server');
  });

  it('should scrub sensitive keys from event.data in beforeSend', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://key@o0.ingest.sentry.io/0');

    await import('../src/sentry.js');

    const beforeSend = initSpy.mock.calls[0][0].beforeSend;

    const event = {
      exception: { values: [{ value: 'Error' }] },
      data: {
        userId: 'user-123',
        sessionId: 'session-abc',
        apiKey: 'secret-api-key',
        safeField: 'keep-this',
      },
    };

    const result = beforeSend(event);
    expect(result).not.toBeNull();
    expect(result.data.userId).toBe('user-123');
    expect(result.data.sessionId).toBeUndefined();
    expect(result.data.apiKey).toBeUndefined();
    expect(result.data.safeField).toBe('keep-this');
  });

  it('should delete request.data when scrubbed result is not an object', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://key@o0.ingest.sentry.io/0');

    await import('../src/sentry.js');

    const beforeSend = initSpy.mock.calls[0][0].beforeSend;

    const event = {
      exception: { values: [{ value: 'Error' }] },
      request: {
        data: 'raw string body',
      },
    };

    const result = beforeSend(event);
    expect(result).not.toBeNull();
    expect(result.request.data).toBeUndefined();
  });

  it('should handle event with no user field without throwing', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://key@o0.ingest.sentry.io/0');

    await import('../src/sentry.js');

    const beforeSend = initSpy.mock.calls[0][0].beforeSend;

    const event = {
      exception: { values: [{ value: 'Error' }] },
      request: { headers: { accept: 'application/json' } },
    };

    expect(() => beforeSend(event)).not.toThrow();
    const result = beforeSend(event);
    expect(result).not.toBeNull();
  });

  it('should handle event with no request field without throwing', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://key@o0.ingest.sentry.io/0');

    await import('../src/sentry.js');

    const beforeSend = initSpy.mock.calls[0][0].beforeSend;

    const event = {
      exception: { values: [{ value: 'Error' }] },
      user: { id: 'user-1' },
    };

    expect(() => beforeSend(event)).not.toThrow();
    const result = beforeSend(event);
    expect(result).not.toBeNull();
    expect(result.user).toEqual({ id: 'user-1' });
  });

  it('should set service tag in initialScope', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://key@o0.ingest.sentry.io/0');

    await import('../src/sentry.js');

    const cfg = initSpy.mock.calls[0][0];
    expect(cfg.initialScope?.tags?.service).toBe('volvox-bot');
  });

  it('should enable autoSessionTracking', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://key@o0.ingest.sentry.io/0');

    await import('../src/sentry.js');

    const cfg = initSpy.mock.calls[0][0];
    expect(cfg.autoSessionTracking).toBe(true);
  });

  it('should export sentryEnabled as true when DSN is set', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://key@o0.ingest.sentry.io/0');

    const { sentryEnabled } = await import('../src/sentry.js');
    expect(sentryEnabled).toBe(true);
  });

  it('should export sentryEnabled as false when DSN is not set', async () => {
    vi.stubEnv('SENTRY_DSN', '');

    const { sentryEnabled } = await import('../src/sentry.js');
    expect(sentryEnabled).toBe(false);
  });

  it('should use SENTRY_TRACES_RATE=1 to trace all transactions', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://key@o0.ingest.sentry.io/0');
    vi.stubEnv('SENTRY_TRACES_RATE', '1');

    await import('../src/sentry.js');

    const cfg = initSpy.mock.calls[0][0];
    expect(cfg.tracesSampleRate).toBe(1);
  });
});
