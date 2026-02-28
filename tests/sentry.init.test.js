import { afterEach, describe, expect, it, vi } from 'vitest';

const { initMock, captureExceptionMock, captureMessageMock } = vi.hoisted(() => ({
  initMock: vi.fn(),
  captureExceptionMock: vi.fn(),
  captureMessageMock: vi.fn(),
}));

vi.mock('@sentry/node', () => ({
  init: initMock,
  captureException: captureExceptionMock,
  captureMessage: captureMessageMock,
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('sentry init coverage', () => {
  it('does not initialize when DSN is missing', async () => {
    vi.resetModules();
    vi.stubEnv('SENTRY_DSN', '');

    const mod = await import('../src/sentry.js');

    expect(mod.sentryEnabled).toBe(false);
    expect(initMock).not.toHaveBeenCalled();
    expect(mod.Sentry.captureException).toBe(captureExceptionMock);
    expect(mod.Sentry.captureMessage).toBe(captureMessageMock);
  });

  it('initializes with explicit environment and supports beforeSend filtering/scrubbing', async () => {
    vi.resetModules();
    vi.stubEnv('SENTRY_DSN', 'https://public@example.ingest.sentry.io/123');
    vi.stubEnv('SENTRY_ENVIRONMENT', 'staging');
    vi.stubEnv('SENTRY_TRACES_RATE', '0.25');

    const mod = await import('../src/sentry.js');

    expect(mod.sentryEnabled).toBe(true);
    expect(initMock).toHaveBeenCalledTimes(1);

    const initArgs = initMock.mock.calls[0][0];
    expect(initArgs.environment).toBe('staging');
    expect(initArgs.tracesSampleRate).toBe(0.25);
    expect(initArgs.autoSessionTracking).toBe(true);
    expect(initArgs.initialScope).toEqual({
      tags: { service: 'volvox-bot' },
    });

    const aborted = {
      exception: { values: [{ value: 'AbortError: request cancelled' }] },
    };
    expect(initArgs.beforeSend(aborted)).toBeNull();

    const alsoAborted = {
      exception: { values: [{ value: 'The operation was aborted due to timeout' }] },
    };
    expect(initArgs.beforeSend(alsoAborted)).toBeNull();

    const event = {
      extra: {
        ip: '127.0.0.1',
        password: 'super-secret',
        token: 'token-value',
        authorization: 'Bearer abc',
        safe: 'ok',
      },
    };
    const scrubbed = initArgs.beforeSend(event);
    expect(scrubbed).toBe(event);
    expect(scrubbed.extra).toEqual({ safe: 'ok' });

    const noExtra = { message: 'keep me' };
    expect(initArgs.beforeSend(noExtra)).toBe(noExtra);
  });

  it('falls back to NODE_ENV and default trace rate for invalid values', async () => {
    vi.resetModules();
    vi.stubEnv('SENTRY_DSN', 'https://public@example.ingest.sentry.io/123');
    vi.stubEnv('SENTRY_ENVIRONMENT', '');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SENTRY_TRACES_RATE', 'not-a-number');

    await import('../src/sentry.js');

    const initArgs = initMock.mock.calls[0][0];
    expect(initArgs.environment).toBe('development');
    expect(initArgs.tracesSampleRate).toBe(0.1);
  });

  it('falls back to production when neither SENTRY_ENVIRONMENT nor NODE_ENV are set', async () => {
    vi.resetModules();
    vi.stubEnv('SENTRY_DSN', 'https://public@example.ingest.sentry.io/123');
    vi.stubEnv('SENTRY_ENVIRONMENT', '');
    vi.stubEnv('NODE_ENV', '');

    await import('../src/sentry.js');

    const initArgs = initMock.mock.calls[0][0];
    expect(initArgs.environment).toBe('production');
  });
});
