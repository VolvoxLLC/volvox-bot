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

  it('should keep server trace sampling independent from the public browser setting', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE', '0.75');

    const { getBrowserSentryOptions, getServerSentryOptions } = await import(
      '@/lib/sentry-options'
    );

    expect(getBrowserSentryOptions().tracesSampleRate).toBe(0.75);
    expect(getServerSentryOptions('nodejs').tracesSampleRate).toBe(0.1);
  });

  it('should still support the legacy server trace sampling env var', async () => {
    vi.stubEnv('SENTRY_TRACES_RATE', '0.2');

    const { getServerSentryOptions } = await import('@/lib/sentry-options');

    expect(getServerSentryOptions('nodejs').tracesSampleRate).toBe(0.2);
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

  it('should not use server-only env vars when building browser options', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://private@example.com/1');
    vi.stubEnv('SENTRY_ENVIRONMENT', 'server production');
    vi.stubEnv('SENTRY_RELEASE', 'server-release');
    vi.stubEnv('SENTRY_SEND_DEFAULT_PII', 'true');
    vi.stubEnv('SENTRY_TRACES_SAMPLE_RATE', '0.75');

    const { getBrowserSentryOptions } = await import('@/lib/sentry-options');
    const options = getBrowserSentryOptions();

    expect(options.dsn).toBeUndefined();
    expect(options.environment).not.toBe('server-production');
    expect(options.release).toBeUndefined();
    expect(options.sendDefaultPii).toBe(false);
    expect(options.tracesSampleRate).toBe(0.1);
  });

  it('should keep Sentry default PII collection disabled unless explicitly enabled', async () => {
    const { getBrowserSentryOptions, getServerSentryOptions } = await import(
      '@/lib/sentry-options'
    );

    expect(getBrowserSentryOptions().sendDefaultPii).toBe(false);
    expect(getServerSentryOptions('nodejs').sendDefaultPii).toBe(false);
    expect(getServerSentryOptions('edge').sendDefaultPii).toBe(false);
  });

  it('should enable Sentry default PII collection for browser and server configs when opted in', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_SEND_DEFAULT_PII', 'true');
    vi.stubEnv('SENTRY_SEND_DEFAULT_PII', 'true');

    const { getBrowserSentryOptions, getServerSentryOptions } = await import(
      '@/lib/sentry-options'
    );

    expect(getBrowserSentryOptions().sendDefaultPii).toBe(true);
    expect(getServerSentryOptions('nodejs').sendDefaultPii).toBe(true);
    expect(getServerSentryOptions('edge').sendDefaultPii).toBe(true);
  });

  it('should require SENTRY_DSN for server and edge capture', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://public@example.com/1');
    vi.stubEnv('SENTRY_DSN', '');

    const { getBrowserSentryOptions, getServerSentryOptions } = await import(
      '@/lib/sentry-options'
    );

    expect(getBrowserSentryOptions().dsn).toBe('https://public@example.com/1');
    expect(getServerSentryOptions('nodejs').dsn).toBeUndefined();
    expect(getServerSentryOptions('edge').dsn).toBeUndefined();
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
        query_string: 'guildId=123&email=person%40example.com',
        url: 'https://dashboard.example.com/guilds/123?guildId=123&email=person%40example.com#private',
        data: {
          password: 'secret',
          api_key: 'secret',
          'x-api-key': 'secret',
          email: 'person@example.com',
          safeField: 'keep-this',
        },
        headers: {
          authorization: 'Bearer secret',
          cookie: 'session=secret',
          'x-forwarded-for': '127.0.0.1',
          'x-api-key': 'secret',
          accept: 'application/json',
        },
      },
      extra: {
        accessToken: 'secret',
        'refresh-token': 'secret',
        nested: {
          botApiSecret: 'secret',
          bot_api_secret: 'secret',
          email: 'nested@example.com',
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
        url: 'https://dashboard.example.com/guilds/123',
        data: {
          safeField: 'keep-this',
        },
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

  it('should protect recursive scrubbing against true cycles while preserving shared references', async () => {
    const { scrubSentryEvent } = await import('@/lib/sentry-options');
    const cycle: Record<string, unknown> = { safeField: 'keep-this' };
    cycle.self = cycle;
    const shared = { ok: true };
    const event = {
      type: undefined,
      extra: {
        cycle,
        first: shared,
        second: shared,
      },
    } as unknown as Event;

    expect(scrubSentryEvent(event)?.extra).toEqual({
      cycle: {
        safeField: 'keep-this',
        self: '[Circular]',
      },
      first: { ok: true },
      second: { ok: true },
    });
  });

  it('should scrub breadcrumb data and strip URL metadata before sending events', async () => {
    const { scrubSentryEvent } = await import('@/lib/sentry-options');
    const event = {
      type: undefined,
      breadcrumbs: [
        {
          category: 'fetch',
          data: {
            url: 'https://dashboard.example.com/api?token=secret&email=person%40example.com#private',
            nested: {
              requestUrl: '/settings?access_token=secret#private',
              'e-mail': 'person@example.com',
              safeField: 'keep-this',
            },
          },
        },
      ],
    } as unknown as Event;

    expect(scrubSentryEvent(event)?.breadcrumbs).toEqual([
      {
        category: 'fetch',
        data: {
          url: 'https://dashboard.example.com/api',
          nested: {
            requestUrl: '/settings',
            safeField: 'keep-this',
          },
        },
      },
    ]);
  });

  it('should normalize scrubbed request headers to strings before sending events', async () => {
    const { scrubSentryEvent } = await import('@/lib/sentry-options');
    const event = {
      type: undefined,
      request: {
        headers: {
          authorization: 'Bearer secret',
          accept: ['application/json', 'text/plain'],
          'x-retry-count': 2,
          'x-feature-enabled': true,
          metadata: { safeField: 'keep-this', email: 'person@example.com' },
        },
      },
    } as unknown as Event;

    expect(scrubSentryEvent(event)?.request?.headers).toEqual({
      accept: 'application/json, text/plain',
      'x-retry-count': '2',
      'x-feature-enabled': 'true',
      metadata: '{"safeField":"keep-this"}',
    });
  });

  it('should scrub transaction and span payloads with the same sanitizer', async () => {
    const { getServerSentryOptions } = await import('@/lib/sentry-options');
    const options = getServerSentryOptions('nodejs');

    expect(
      options.beforeSendTransaction?.({
        type: 'transaction',
        request: {
          query_string: 'token=secret',
          url: '/dashboard?token=secret&email=person%40example.com',
          headers: {
            cookie: 'session=secret',
            accept: 'application/json',
          },
          data: {
            access_token: 'secret',
            safeField: 'keep-this',
          },
        },
      }, {}),
    ).toEqual({
      type: 'transaction',
      request: {
        url: '/dashboard',
        headers: {
          accept: 'application/json',
        },
        data: {
          safeField: 'keep-this',
        },
      },
    });

    expect(
      options.beforeSendSpan?.({
        span_id: 'abc123',
        start_timestamp: 1,
        trace_id: 'trace123',
        data: {
          authorization: 'Bearer secret',
          safeField: 'keep-this',
        },
      }),
    ).toEqual({
      span_id: 'abc123',
      start_timestamp: 1,
      trace_id: 'trace123',
      data: {
        safeField: 'keep-this',
      },
    });
  });
});
