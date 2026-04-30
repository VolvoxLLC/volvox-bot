import type * as Sentry from '@sentry/nextjs';
import type { Event, EventHint } from '@sentry/nextjs';

type SentryInitOptions = Parameters<typeof Sentry.init>[0];
type SentryErrorEvent = Omit<Event, 'type'> & { type: undefined };
type SentryRuntime = 'browser' | 'edge' | 'nodejs';

const DEFAULT_TRACES_SAMPLE_RATE = 0.1;
const DEFAULT_REPLAYS_SESSION_SAMPLE_RATE = 0;
const DEFAULT_REPLAYS_ON_ERROR_SAMPLE_RATE = 0.1;
const SENSITIVE_KEY_PATTERN =
  /(?:authorization|cookie|csrf|secret|password|token|accessToken|refreshToken|apiKey|botApiSecret|session|ip_address|x-forwarded-for)/i;

function getEnvValue(keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function parseSampleRate(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const sampleRate = Number.parseFloat(value);
  return Number.isFinite(sampleRate) && sampleRate >= 0 && sampleRate <= 1 ? sampleRate : fallback;
}

function getSentryEnvironment(): string {
  const environment =
    getEnvValue([
      'NEXT_PUBLIC_SENTRY_ENVIRONMENT',
      'SENTRY_ENVIRONMENT',
      'VERCEL_ENV',
      'RAILWAY_ENVIRONMENT_NAME',
      'NODE_ENV',
    ]) ?? 'development';

  const normalized = environment.replace(/[\s/\\]+/g, '-').replace(/[^A-Za-z0-9_.-]/g, '');
  return normalized.slice(0, 64) || 'development';
}

function getSentryRelease(runtime: SentryRuntime): string | undefined {
  const releaseKeys =
    runtime === 'browser'
      ? ['NEXT_PUBLIC_SENTRY_RELEASE', 'NEXT_PUBLIC_WEB_APP_VERSION', 'SENTRY_RELEASE']
      : ['SENTRY_RELEASE', 'NEXT_PUBLIC_SENTRY_RELEASE', 'VERCEL_GIT_COMMIT_SHA'];

  return getEnvValue(releaseKeys);
}

function scrubUnknown(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(scrubUnknown);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const scrubbed: Record<string, unknown> = {};

  for (const [key, childValue] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      continue;
    }

    scrubbed[key] = scrubUnknown(childValue);
  }

  return scrubbed;
}

export function scrubSentryEvent(
  event: SentryErrorEvent,
  _hint?: EventHint,
): SentryErrorEvent | null {
  if (event.user) {
    delete event.user.email;
    delete event.user.ip_address;
  }

  if (event.request) {
    delete event.request.cookies;

    if (event.request.headers) {
      event.request.headers = scrubUnknown(event.request.headers) as Record<string, string>;
    }
  }

  if (event.extra) {
    event.extra = scrubUnknown(event.extra) as Record<string, unknown>;
  }

  if (event.contexts) {
    event.contexts = scrubUnknown(event.contexts) as SentryErrorEvent['contexts'];
  }

  return event;
}

export function getBrowserSentryOptions(): SentryInitOptions {
  return {
    dsn: getEnvValue(['NEXT_PUBLIC_SENTRY_DSN']),
    environment: getSentryEnvironment(),
    release: getSentryRelease('browser'),
    sendDefaultPii: true,
    tracesSampleRate: parseSampleRate(
      getEnvValue(['NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE']),
      DEFAULT_TRACES_SAMPLE_RATE,
    ),
    replaysSessionSampleRate: parseSampleRate(
      getEnvValue(['NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE']),
      DEFAULT_REPLAYS_SESSION_SAMPLE_RATE,
    ),
    replaysOnErrorSampleRate: parseSampleRate(
      getEnvValue(['NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE']),
      DEFAULT_REPLAYS_ON_ERROR_SAMPLE_RATE,
    ),
    beforeSend: scrubSentryEvent,
    initialScope: {
      tags: {
        service: 'volvox-dashboard',
        runtime: 'browser',
      },
    },
  };
}

export function getServerSentryOptions(
  runtime: Exclude<SentryRuntime, 'browser'>,
): SentryInitOptions {
  return {
    dsn: getEnvValue(['SENTRY_DSN', 'NEXT_PUBLIC_SENTRY_DSN']),
    environment: getSentryEnvironment(),
    release: getSentryRelease(runtime),
    sendDefaultPii: true,
    tracesSampleRate: parseSampleRate(
      getEnvValue([
        'SENTRY_TRACES_SAMPLE_RATE',
        'SENTRY_TRACES_RATE',
        'NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE',
      ]),
      DEFAULT_TRACES_SAMPLE_RATE,
    ),
    beforeSend: scrubSentryEvent,
    initialScope: {
      tags: {
        service: 'volvox-dashboard',
        runtime,
      },
    },
  };
}
