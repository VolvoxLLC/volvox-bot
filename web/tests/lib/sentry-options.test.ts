import type { Event } from '@sentry/nextjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('sentry-options', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('should parse sample rates within the allowed 0-1 range', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE', '0.25');

    const { getBrowserSentryOptions } = await import('@/lib/sentry-options');

    expect(getBrowserSentryOptions().tracesSampleRate).toBe(0.25);
  });

  it('should fall back when sample rates are missing, malformed, or out of range', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE', 'banana');
    vi.stubEnv('SENTRY_TRACES_SAMPLE_RATE', '2');

    const { getBrowserSentryOptions, getServerSentryOptions } = await import(
      '@/lib/sentry-options'
    );

    expect(getBrowserSentryOptions().tracesSampleRate).toBe(0.1);
    expect(getServerSentryOptions('nodejs').tracesSampleRate).toBe(0.1);
  });

  it('should prefer public browser DSN and public release values for client config', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://public@example.com/1');
    vi.stubEnv('SENTRY_DSN', 'https://private@example.com/1');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_RELEASE', 'web-public-release');
    vi.stubEnv('SENTRY_RELEASE', 'server-release');

    const { getBrowserSentryOptions } = await import('@/lib/sentry-options');

    expect(getBrowserSentryOptions()).toMatchObject({
      dsn: 'https://public@example.com/1',
      release: 'web-public-release',
    });
  });

  it('should enable Sentry default PII collection for browser and server configs', async () => {
    const { getBrowserSentryOptions, getServerSentryOptions } = await import(
      '@/lib/sentry-options'
    );

    expect(getBrowserSentryOptions().sendDefaultPii).toBe(true);
    expect(getServerSentryOptions('nodejs').sendDefaultPii).toBe(true);
    expect(getServerSentryOptions('edge').sendDefaultPii).toBe(true);
  });

  it('should sanitize invalid environment names', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_ENVIRONMENT', 'preview deploy/123');

    const { getBrowserSentryOptions } = await import('@/lib/sentry-options');

    expect(getBrowserSentryOptions().environment).toBe('preview-deploy-123');
  });

  it('should scrub sensitive request and user fields before sending events', async () => {
    const { scrubSentryEvent } = await import('@/lib/sentry-options');
    const event: Omit<Event, 'type'> & { type: undefined } = {
      type: undefined,
      user: {
        id: 'safe-user-key',
        email: 'person@example.com',
        ip_address: '127.0.0.1',
      },
      request: {
        cookies: { session: 'secret' },
        headers: {
          authorization: 'Bearer secret',
          cookie: 'session=secret',
          'x-forwarded-for': '127.0.0.1',
          accept: 'application/json',
        },
      },
      extra: {
        accessToken: 'secret',
        nested: {
          botApiSecret: 'secret',
          ok: true,
        },
      },
      tags: {
        route: '/dashboard',
        service: 'volvox-dashboard',
      },
    };

    expect(scrubSentryEvent(event)).toEqual({
      type: undefined,
      user: {
        id: 'safe-user-key',
      },
      request: {
        headers: {
          accept: 'application/json',
        },
      },
      extra: {
        nested: {
          ok: true,
        },
      },
      tags: {
        route: '/dashboard',
        service: 'volvox-dashboard',
      },
    });
  });
});
