import type { Event, EventHint } from '@sentry/nextjs';

type SentryInitOptions = Parameters<typeof import('@sentry/nextjs').init>[0];
type SentrySpan = Parameters<NonNullable<SentryInitOptions['beforeSendSpan']>>[0];
type SentryRuntime = 'browser' | 'edge' | 'nodejs';

const DEFAULT_TRACES_SAMPLE_RATE = 0.1;
const DEFAULT_REPLAYS_SESSION_SAMPLE_RATE = 0;
const DEFAULT_REPLAYS_ON_ERROR_SAMPLE_RATE = 0.1;
const SENSITIVE_KEY_PATTERN =
  /(?:authorization|cookie|csrf|secret|password|token|session|stack|x[-_]?forwarded[-_]?for|ip(?:[-_]?address)?|x[-_]?api[-_]?key|api[-_]?key|bot[-_]?api[-_]?secret|access[-_]?token|refresh[-_]?token)/i;

/**
 * Returns the first non-empty environment value from the provided key list.
 *
 * @param keys - Environment variable names ordered by precedence.
 * @returns The trimmed value, or undefined when none are set.
 */
function getEnvValue(keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

/**
 * Parses a Sentry sampling rate and clamps invalid values to a fallback.
 *
 * @param value - Raw environment value.
 * @param fallback - Value to use when the input is missing or outside 0-1.
 * @returns A valid Sentry sampling rate between 0 and 1.
 */
function parseSampleRate(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const sampleRate = Number.parseFloat(value);
  return Number.isFinite(sampleRate) && sampleRate >= 0 && sampleRate <= 1 ? sampleRate : fallback;
}

/**
 * Parses boolean feature flags that are enabled only by the literal string "true".
 *
 * @param value - Raw environment value.
 * @returns True only when the value is exactly "true".
 */
function parseBoolean(value: string | undefined): boolean {
  return value === 'true';
}

/**
 * Builds a Sentry-safe environment name from deployment environment variables.
 *
 * @returns A normalized environment string accepted by Sentry.
 */
function getSentryEnvironment(): string {
  const environment =
    getEnvValue([
      'NEXT_PUBLIC_SENTRY_ENVIRONMENT',
      'SENTRY_ENVIRONMENT',
      'VERCEL_ENV',
      'RAILWAY_ENVIRONMENT_NAME',
      'NODE_ENV',
    ]) ?? 'development';

  const normalized = environment.replaceAll(/[\s/\\]+/g, '-').replaceAll(/[^A-Za-z0-9_.-]/g, '');
  return normalized.slice(0, 64) || 'development';
}

/**
 * Resolves the release identifier for the current Sentry runtime.
 *
 * @param runtime - Runtime being configured.
 * @returns The release identifier when one is configured.
 */
function getSentryRelease(runtime: SentryRuntime): string | undefined {
  const releaseKeys =
    runtime === 'browser'
      ? ['NEXT_PUBLIC_SENTRY_RELEASE', 'NEXT_PUBLIC_WEB_APP_VERSION', 'SENTRY_RELEASE']
      : ['SENTRY_RELEASE', 'NEXT_PUBLIC_SENTRY_RELEASE', 'VERCEL_GIT_COMMIT_SHA'];

  return getEnvValue(releaseKeys);
}

/**
 * Recursively removes sensitive keys from arbitrary Sentry metadata.
 *
 * @param value - Metadata value to scrub.
 * @returns A copy with sensitive object keys removed.
 */
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

/**
 * Removes secrets and direct identifiers from Sentry error or transaction events.
 *
 * @param event - Sentry error or transaction event.
 * @param _hint - Sentry event hint, unused because scrubbing is payload-based.
 * @returns The same event after in-place scrubbing.
 */
export function scrubSentryEvent<TEvent extends Event>(
  event: TEvent,
  _hint?: EventHint,
): TEvent | null {
  if (event.user) {
    delete event.user.email;
    delete event.user.ip_address;
  }

  if (event.request) {
    delete event.request.cookies;

    if (event.request.headers) {
      event.request.headers = scrubUnknown(event.request.headers) as Record<string, string>;
    }

    if (event.request.data) {
      const scrubbedData = scrubUnknown(event.request.data);
      if (scrubbedData && typeof scrubbedData === 'object') {
        event.request.data = scrubbedData;
      } else {
        delete event.request.data;
      }
    }
  }

  if (event.extra) {
    event.extra = scrubUnknown(event.extra) as Record<string, unknown>;
  }

  if (event.contexts) {
    event.contexts = scrubUnknown(event.contexts) as Event['contexts'];
  }

  return event;
}

/**
 * Removes secrets from Sentry span data before performance payloads are sent.
 *
 * @param span - Serialized Sentry span payload.
 * @returns The same span after in-place data scrubbing.
 */
export function scrubSentrySpan(span: SentrySpan): SentrySpan {
  span.data = scrubUnknown(span.data) as SentrySpan['data'];
  return span;
}

/**
 * Builds Sentry options for browser-side dashboard instrumentation.
 *
 * @returns Browser Sentry initialization options.
 */
export function getBrowserSentryOptions(): SentryInitOptions {
  return {
    dsn: getEnvValue(['NEXT_PUBLIC_SENTRY_DSN']),
    environment: getSentryEnvironment(),
    release: getSentryRelease('browser'),
    sendDefaultPii: parseBoolean(getEnvValue(['NEXT_PUBLIC_SENTRY_SEND_DEFAULT_PII'])),
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
    beforeSend: (event, hint) => scrubSentryEvent(event, hint),
    beforeSendTransaction: (event, hint) => scrubSentryEvent(event, hint),
    beforeSendSpan: scrubSentrySpan,
    initialScope: {
      tags: {
        service: 'volvox-dashboard',
        runtime: 'browser',
      },
    },
  };
}

/**
 * Builds Sentry options for dashboard server or edge instrumentation.
 *
 * @param runtime - Server-side runtime being initialized.
 * @returns Server or edge Sentry initialization options.
 */
export function getServerSentryOptions(
  runtime: Exclude<SentryRuntime, 'browser'>,
): SentryInitOptions {
  return {
    dsn: getEnvValue(['SENTRY_DSN']),
    environment: getSentryEnvironment(),
    release: getSentryRelease(runtime),
    sendDefaultPii: parseBoolean(getEnvValue(['SENTRY_SEND_DEFAULT_PII'])),
    tracesSampleRate: parseSampleRate(
      getEnvValue([
        'SENTRY_TRACES_SAMPLE_RATE',
        'SENTRY_TRACES_RATE',
        'NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE',
      ]),
      DEFAULT_TRACES_SAMPLE_RATE,
    ),
    beforeSend: (event, hint) => scrubSentryEvent(event, hint),
    beforeSendTransaction: (event, hint) => scrubSentryEvent(event, hint),
    beforeSendSpan: scrubSentrySpan,
    initialScope: {
      tags: {
        service: 'volvox-dashboard',
        runtime,
      },
    },
  };
}
