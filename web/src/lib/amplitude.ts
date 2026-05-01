'use client';

import * as amplitude from '@amplitude/analytics-browser';

export const DASHBOARD_PAGE_VIEW_EVENT = 'dashboard_page_viewed';

type BrowserAmplitudeOptions = NonNullable<Parameters<typeof amplitude.init>[2]>;
type BrowserAmplitudeProperties = Record<string, unknown>;

const AMPLITUDE_MIN_ID_LENGTH = 5;
const SENSITIVE_KEY_FRAGMENTS = [
  'authorization',
  'cookie',
  'csrf',
  'e-mail',
  'email',
  'secret',
  'password',
  'token',
  'session',
  'stack',
] as const;
const SENSITIVE_COMPACT_KEYS = new Set(['ip', 'ipaddress', 'xforwardedfor', 'apikey', 'xapikey']);
const SENSITIVE_KEY_SEPARATOR_PATTERN = /[\s._-]+/g;
const INLINE_SECRET_PATTERNS = [
  /\bBearer\s+[\w.~+/=-]+/gi,
  /\bsk-[A-Za-z0-9][A-Za-z0-9_-]{10,}/g,
  /\b(?:xox[baprs]|gh[pousr])_[A-Za-z0-9_/-]{10,}/g,
];

let hasInitialized = false;
let activeUserId: string | undefined;

/**
 * Read the public Amplitude API key from the environment and return it trimmed.
 *
 * @returns The trimmed value of `NEXT_PUBLIC_AMPLITUDE_API_KEY` if it is a non-empty string, `undefined` otherwise.
 */
function getPublicApiKey(): string | undefined {
  const value = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * Convert an environment-like string into a boolean flag.
 *
 * @param value - The input string, typically from an environment variable
 * @returns `true` only when `value` is exactly `'true'`, `false` otherwise
 */
function parseBoolean(value: string | undefined): boolean {
  return value === 'true';
}

/**
 * Normalize a server zone identifier to either 'US' or 'EU'.
 *
 * @param value - Raw server zone value (for example from an environment variable); leading/trailing whitespace is ignored and comparison is case-insensitive.
 * @returns `'EU'` if the trimmed, uppercased input equals `'EU'`, otherwise `'US'`.
 */
function normalizeServerZone(value: string | undefined): 'US' | 'EU' {
  return value?.trim().toUpperCase() === 'EU' ? 'EU' : 'US';
}

/**
 * Normalize an arbitrary value into a valid Amplitude user id.
 *
 * Trims the input when it's a string and returns it only if its length is at least the minimum allowed id length.
 *
 * @param value - The value to normalize into an Amplitude user id
 * @returns The trimmed id when `value` is a string with length greater than or equal to the minimum allowed; `undefined` otherwise
 */
function normalizeAmplitudeId(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length >= AMPLITUDE_MIN_ID_LENGTH ? trimmed : undefined;
}

/**
 * Redacts inline secret tokens and keys from a string.
 *
 * @param value - Input string potentially containing inline secrets (e.g., bearer tokens, API keys)
 * @returns The input string with matches of inline-secret patterns replaced by `"[REDACTED]"`
 */
function scrubInlineSecrets(value: string): string {
  return INLINE_SECRET_PATTERNS.reduce(
    (scrubbedValue, pattern) => scrubbedValue.replace(pattern, '[REDACTED]'),
    value,
  );
}

/**
 * Determines whether an event property key may contain sensitive telemetry data.
 *
 * @param key - Property key to inspect.
 * @returns True when the key should be removed from analytics payloads.
 */
function isSensitiveKey(key: string): boolean {
  const normalizedKey = key.toLowerCase();

  if (SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalizedKey.includes(fragment))) {
    return true;
  }

  return SENSITIVE_COMPACT_KEYS.has(normalizedKey.replaceAll(SENSITIVE_KEY_SEPARATOR_PATTERN, ''));
}

/**
 * Recursively prepares a value for Amplitude event properties by redacting sensitive data and normalizing types.
 *
 * Strings have inline secret patterns replaced with "[REDACTED]". Arrays and objects are processed recursively. Object keys that match the sensitive-key pattern are omitted. Circular references are replaced with the string "[Circular]". Date objects are converted to ISO strings. Error objects are converted to `{ message, name }` with the message redacted.
 *
 * @param value - The value to scrub into a safe shape for Amplitude event properties.
 * @param seen - Internal WeakSet used to track visited objects and detect circular references; callers should not need to provide this.
 * @returns The scrubbed value, preserving the original structure where possible (primitive, array, or object) with sensitive data redacted or omitted.
 */
function scrubAmplitudeProperties(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') {
    return scrubInlineSecrets(value);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  seen.add(value);

  try {
    if (Array.isArray(value)) {
      return value.map((item) => scrubAmplitudeProperties(item, seen));
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (value instanceof Error) {
      return {
        message: scrubInlineSecrets(value.message),
        name: value.name,
      };
    }

    const scrubbed: BrowserAmplitudeProperties = {};

    for (const [key, childValue] of Object.entries(value)) {
      if (isSensitiveKey(key)) {
        continue;
      }

      scrubbed[key] = scrubAmplitudeProperties(childValue, seen);
    }

    return scrubbed;
  } finally {
    seen.delete(value);
  }
}

/**
 * Determines whether Amplitude analytics is available for the dashboard in the current environment.
 *
 * @returns `true` if running in a browser and a public Amplitude API key is configured, `false` otherwise.
 */
export function isDashboardAmplitudeEnabled(): boolean {
  return typeof globalThis.window !== 'undefined' && Boolean(getPublicApiKey());
}

/**
 * Build the Amplitude browser initialization options using environment variables.
 *
 * The returned object configures autocapture based on NEXT_PUBLIC_AMPLITUDE_AUTOCAPTURE,
 * sets log level to `None`, disables remote config fetching, normalizes `serverZone`
 * from NEXT_PUBLIC_AMPLITUDE_SERVER_ZONE, and disables IP address tracking.
 *
 * @returns The options object to pass to `amplitude.init`
 */
export function getBrowserAmplitudeOptions(): BrowserAmplitudeOptions {
  return {
    autocapture: parseBoolean(process.env.NEXT_PUBLIC_AMPLITUDE_AUTOCAPTURE)
      ? {
          attribution: true,
          elementInteractions: false,
          fileDownloads: false,
          formInteractions: false,
          frustrationInteractions: false,
          networkTracking: false,
          pageUrlEnrichment: true,
          pageViews: true,
          sessions: true,
          webVitals: false,
        }
      : false,
    logLevel: amplitude.Types.LogLevel.None,
    remoteConfig: {
      fetchRemoteConfig: false,
    },
    serverZone: normalizeServerZone(process.env.NEXT_PUBLIC_AMPLITUDE_SERVER_ZONE),
    trackingOptions: {
      ipAddress: false,
    },
  };
}

/**
 * Initialize Amplitude for dashboard usage and set or clear the module's active user id.
 *
 * Normalizes the provided `userId` before applying it. If Amplitude has not yet been initialized,
 * this will initialize it with the public API key and the normalized user id. If already initialized,
 * this will set a new normalized user id or reset the client when `userId` is absent.
 *
 * @param userId - Optional raw user id; trimmed and accepted only if it is a string of at least 5 characters
 * @returns `true` when initialization or user update/reset completed successfully, `false` otherwise (for example, when not running in a browser, when no public API key is available, or an error occurs)
 */
export function initDashboardAmplitude(userId?: string | null): boolean {
  const apiKey = getPublicApiKey();
  const normalizedUserId = normalizeAmplitudeId(userId);

  if (typeof globalThis.window === 'undefined' || !apiKey) {
    return false;
  }

  try {
    if (!hasInitialized) {
      amplitude.init(apiKey, normalizedUserId, getBrowserAmplitudeOptions());
      hasInitialized = true;
      activeUserId = normalizedUserId;
      return true;
    }

    if (normalizedUserId && normalizedUserId !== activeUserId) {
      amplitude.setUserId(normalizedUserId);
      activeUserId = normalizedUserId;
    } else if (!normalizedUserId && activeUserId) {
      amplitude.reset();
      activeUserId = undefined;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Send a named dashboard event to Amplitude after scrubbing sensitive properties.
 *
 * @param eventName - The event name; leading and trailing whitespace is ignored.
 * @param eventProperties - Event property payload; values will be recursively scrubbed to redact sensitive or inline secrets.
 * @returns `true` if the tracking call was sent successfully, `false` otherwise.
 */
export function trackDashboardEvent(
  eventName: string,
  eventProperties: BrowserAmplitudeProperties = {},
): boolean {
  const normalizedEventName = eventName.trim();

  if (!normalizedEventName || !initDashboardAmplitude(activeUserId)) {
    return false;
  }

  try {
    amplitude.track(
      normalizedEventName,
      scrubAmplitudeProperties(eventProperties) as BrowserAmplitudeProperties,
    );
    return true;
  } catch {
    return false;
  }
}
