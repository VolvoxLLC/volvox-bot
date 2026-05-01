import type { Event, EventHint } from '@sentry/nextjs';

type SentryInitOptions = Parameters<typeof import('@sentry/nextjs').init>[0];
type SentrySpan = Parameters<NonNullable<SentryInitOptions['beforeSendSpan']>>[0];
type SentryRuntime = 'browser' | 'edge' | 'nodejs';

const DEFAULT_TRACES_SAMPLE_RATE = 0.1;
const DEFAULT_REPLAYS_SESSION_SAMPLE_RATE = 0;
const DEFAULT_REPLAYS_ON_ERROR_SAMPLE_RATE = 0.1;
const CIRCULAR_REFERENCE_SENTINEL = '[Circular]';
const SENSITIVE_KEY_PATTERN =
  /(?:authorization|cookie|csrf|e-?mail|secret|password|token|session|stack|x[-_]?forwarded[-_]?for|ip(?:[-_]?address)?|x[-_]?api[-_]?key|api[-_]?key|bot[-_]?api[-_]?secret|access[-_]?token|refresh[-_]?token)/i;
const URL_METADATA_KEY_PATTERN = /url/i;

const BROWSER_SENTRY_ENV = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
  webAppVersion: process.env.NEXT_PUBLIC_WEB_APP_VERSION,
  sendDefaultPii: process.env.NEXT_PUBLIC_SENTRY_SEND_DEFAULT_PII,
  tracesSampleRate: process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
  replaysSessionSampleRate: process.env.NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE,
  replaysOnErrorSampleRate: process.env.NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE,
} as const;

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
 * Returns the first non-empty value from statically referenced browser environment values.
 *
 * Next.js only bundles client-side environment variables when they are referenced with
 * direct `process.env.NEXT_PUBLIC_*` property access, so browser options must use values
 * captured from static references instead of dynamic `process.env[key]` lookups.
 *
 * @param values - Environment values ordered by precedence.
 * @returns The trimmed value, or undefined when none are set.
 */
function getStaticEnvValue(values: readonly (string | undefined)[]): string | undefined {
  for (const value of values) {
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
 * Derives a normalized Sentry environment name from prioritized deployment environment variables.
 *
 * For browser runtime, checks statically referenced NEXT_PUBLIC_SENTRY_ENVIRONMENT and NODE_ENV.
 * For server runtimes, checks SENTRY_ENVIRONMENT, VERCEL_ENV, RAILWAY_ENVIRONMENT_NAME,
 * and NODE_ENV. Normalizes the value for Sentry by replacing whitespace and slashes with `-`,
 * removing characters outside `A-Za-z0-9_.-`, and truncating to 64 characters. Falls back to
 * `development` if no valid value is found.
 *
 * @returns The normalized environment string accepted by Sentry (or `development`).
 */
function getSentryEnvironment(runtime: SentryRuntime): string {
  const environment =
    (runtime === 'browser'
      ? getStaticEnvValue([BROWSER_SENTRY_ENV.environment, process.env.NODE_ENV])
      : getEnvValue([
          'SENTRY_ENVIRONMENT',
          'VERCEL_ENV',
          'RAILWAY_ENVIRONMENT_NAME',
          'NODE_ENV',
        ])) ?? 'development';

  const normalized = environment.replaceAll(/[\s/\\]+/g, '-').replaceAll(/[^A-Za-z0-9_.-]/g, '');
  return normalized.slice(0, 64) || 'development';
}

/**
 * Determines the Sentry release identifier using runtime-specific environment-variable precedence.
 *
 * For `runtime === 'browser'`, checks statically referenced public values in order:
 * `NEXT_PUBLIC_SENTRY_RELEASE`, `NEXT_PUBLIC_WEB_APP_VERSION`.
 * For non-browser runtimes, checks in order: `SENTRY_RELEASE`, `NEXT_PUBLIC_SENTRY_RELEASE`, `VERCEL_GIT_COMMIT_SHA`.
 *
 * @param runtime - Runtime being configured (`'browser' | 'edge' | 'nodejs'`)
 * @returns The first configured release string found, or `undefined` if none are set
 */
function getSentryRelease(runtime: SentryRuntime): string | undefined {
  if (runtime === 'browser') {
    return getStaticEnvValue([BROWSER_SENTRY_ENV.release, BROWSER_SENTRY_ENV.webAppVersion]);
  }

  return getEnvValue(['SENTRY_RELEASE', 'NEXT_PUBLIC_SENTRY_RELEASE', 'VERCEL_GIT_COMMIT_SHA']);
}

/**
 * Strips query strings and fragments from request URLs before sending telemetry.
 *
 * @param url - Request URL captured by Sentry.
 * @returns The URL without query-string or fragment metadata.
 */
function stripUrlMetadata(url: string): string {
  const queryIndex = url.indexOf('?');
  const fragmentIndex = url.indexOf('#');
  const cutIndexes = [queryIndex, fragmentIndex].filter((index) => index >= 0);

  if (cutIndexes.length === 0) {
    return url;
  }

  return url.slice(0, Math.min(...cutIndexes));
}

/**
 * Remove sensitive object properties from a value recursively.
 *
 * Processes arrays element-wise, returns non-object values unchanged, and for objects
 * returns a shallow copy with any property whose key matches `SENSITIVE_KEY_PATTERN`
 * removed; nested objects/arrays are scrubbed recursively.
 *
 * @param value - The value to scrub of sensitive object keys.
 * @returns The scrubbed value: objects copied with sensitive keys removed, arrays with
 * scrubbed elements, or the original non-object value.
 */
function scrubUnknown(value: unknown, seen = new WeakSet<object>()): unknown {
  if (!value || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return CIRCULAR_REFERENCE_SENTINEL;
  }

  seen.add(value);

  if (Array.isArray(value)) {
    const scrubbedArray = value.map((childValue) => scrubUnknown(childValue, seen));
    seen.delete(value);
    return scrubbedArray;
  }

  const scrubbed: Record<string, unknown> = {};

  for (const [key, childValue] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      continue;
    }

    scrubbed[key] = scrubUnknown(childValue, seen);
  }

  seen.delete(value);
  return scrubbed;
}

/**
 * Recursively scrub breadcrumb metadata and strip query strings/fragments from URL fields.
 *
 * @param value - Breadcrumb data value to scrub.
 * @param seen - Objects on the current recursion path.
 * @returns A scrubbed copy of the breadcrumb data value.
 */
function scrubBreadcrumbData(value: unknown, seen = new WeakSet<object>()): unknown {
  if (!value || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return CIRCULAR_REFERENCE_SENTINEL;
  }

  seen.add(value);

  if (Array.isArray(value)) {
    const scrubbedArray = value.map((childValue) => scrubBreadcrumbData(childValue, seen));
    seen.delete(value);
    return scrubbedArray;
  }

  const scrubbed: Record<string, unknown> = {};

  for (const [key, childValue] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      continue;
    }

    const scrubbedValue = scrubBreadcrumbData(childValue, seen);
    scrubbed[key] =
      typeof scrubbedValue === 'string' && URL_METADATA_KEY_PATTERN.test(key)
        ? stripUrlMetadata(scrubbedValue)
        : scrubbedValue;
  }

  seen.delete(value);
  return scrubbed;
}

/**
 * Scrubs Sentry breadcrumb payloads so URL metadata and nested secrets cannot bypass scrubbing.
 *
 * @param breadcrumbs - Event breadcrumb list.
 * @returns Scrubbed breadcrumbs, or the original value if it is not an array.
 */
function scrubBreadcrumbs(breadcrumbs: Event['breadcrumbs']): Event['breadcrumbs'] {
  if (!Array.isArray(breadcrumbs)) {
    return breadcrumbs;
  }

  return breadcrumbs.map((breadcrumb) => {
    const scrubbedBreadcrumb = { ...breadcrumb };
    if ('data' in scrubbedBreadcrumb) {
      scrubbedBreadcrumb.data = scrubBreadcrumbData(
        scrubbedBreadcrumb.data,
      ) as typeof scrubbedBreadcrumb.data;
    }

    return scrubbedBreadcrumb;
  });
}

/**
 * Converts scrubbed header values to strings for Sentry request header compatibility.
 *
 * @param value - Scrubbed header value.
 * @returns A string representation safe for Sentry request headers.
 */
function normalizeHeaderValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(normalizeHeaderValue).join(', ');
  }

  if (value === null) {
    return 'null';
  }

  if (value === undefined) {
    return 'undefined';
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Scrubs request headers and normalizes retained values to strings for Sentry compatibility.
 *
 * @param headers - Raw Sentry request headers.
 * @returns Scrubbed string headers, or undefined when headers are not object-shaped.
 */
function scrubHeaders(headers: unknown): Record<string, string> | undefined {
  const scrubbedHeaders = scrubUnknown(headers);

  if (!scrubbedHeaders || typeof scrubbedHeaders !== 'object' || Array.isArray(scrubbedHeaders)) {
    return undefined;
  }

  const normalizedHeaders: Record<string, string> = {};

  for (const [key, value] of Object.entries(scrubbedHeaders)) {
    if (value !== undefined) {
      normalizedHeaders[key] = normalizeHeaderValue(value);
    }
  }

  return normalizedHeaders;
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
    delete event.request.query_string;

    if (typeof event.request.url === 'string') {
      event.request.url = stripUrlMetadata(event.request.url);
    }

    if (event.request.headers) {
      const scrubbedHeaders = scrubHeaders(event.request.headers);
      if (scrubbedHeaders) {
        event.request.headers = scrubbedHeaders;
      } else {
        delete event.request.headers;
      }
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

  if (event.breadcrumbs) {
    event.breadcrumbs = scrubBreadcrumbs(event.breadcrumbs);
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
    dsn: getStaticEnvValue([BROWSER_SENTRY_ENV.dsn]),
    environment: getSentryEnvironment('browser'),
    release: getSentryRelease('browser'),
    sendDefaultPii: parseBoolean(getStaticEnvValue([BROWSER_SENTRY_ENV.sendDefaultPii])),
    tracesSampleRate: parseSampleRate(
      getStaticEnvValue([BROWSER_SENTRY_ENV.tracesSampleRate]),
      DEFAULT_TRACES_SAMPLE_RATE,
    ),
    replaysSessionSampleRate: parseSampleRate(
      getStaticEnvValue([BROWSER_SENTRY_ENV.replaysSessionSampleRate]),
      DEFAULT_REPLAYS_SESSION_SAMPLE_RATE,
    ),
    replaysOnErrorSampleRate: parseSampleRate(
      getStaticEnvValue([BROWSER_SENTRY_ENV.replaysOnErrorSampleRate]),
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
    environment: getSentryEnvironment(runtime),
    release: getSentryRelease(runtime),
    sendDefaultPii: parseBoolean(getEnvValue(['SENTRY_SEND_DEFAULT_PII'])),
    tracesSampleRate: parseSampleRate(
      getEnvValue(['SENTRY_TRACES_SAMPLE_RATE', 'SENTRY_TRACES_RATE']),
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
