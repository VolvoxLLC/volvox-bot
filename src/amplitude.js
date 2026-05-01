/**
 * Amplitude Analytics
 *
 * Sends non-error telemetry and sanitized log events to Amplitude. Sentry owns
 * exception/error monitoring; this module is for product and operational events.
 *
 * Configure via environment variables:
 *   AMPLITUDE_API_KEY     - Amplitude project API key (required to enable)
 *   AMPLITUDE_SERVER_ZONE - US or EU data residency (optional, default: US)
 */

import * as amplitude from '@amplitude/analytics-node';

export const AMPLITUDE_LOG_EVENT = 'bot_log_recorded';
export const DEFAULT_AMPLITUDE_DEVICE_ID = 'volvox-bot-server';

const AMPLITUDE_MIN_ID_LENGTH = 5;
const SENSITIVE_KEY_PARTS = [
  'authorization',
  'cookie',
  'csrf',
  'secret',
  'password',
  'token',
  'session',
  'stack',
  'xforwardedfor',
  'ipaddress',
  'xapikey',
  'apikey',
  'botapisecret',
  'accesstoken',
  'refreshtoken',
  'email',
];
const SENSITIVE_KEY_EXACT_MATCHES = new Set(['ip']);
const INLINE_SECRET_PATTERNS = [
  /\bBearer\s+[\w.~+/=-]+/gi,
  /\bsk-\w[\w-]{10,}/g,
  /\b(?:xox[baprs]|gh[pousr])_[\w/-]{10,}/g,
];

/**
 * Retrieve an environment variable by key and return its trimmed value if non-empty.
 * @param {string} key - The environment variable name.
 * @returns {string|undefined} The trimmed value of the environment variable, or `undefined` if it is not set or is empty after trimming.
 */
function getEnvValue(key) {
  const value = process.env[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * Normalize an Amplitude server zone string to either 'US' or 'EU'.
 *
 * Trims whitespace and uppercases the input; returns 'EU' only when the normalized value equals 'EU', otherwise returns 'US'.
 * @param {string | undefined} value - The server zone value to normalize (may be undefined).
 * @returns {'US' | 'EU'} 'EU' if the normalized input equals 'EU', 'US' otherwise.
 */
function normalizeServerZone(value) {
  return value?.trim().toUpperCase() === 'EU' ? 'EU' : 'US';
}

/**
 * Normalize a candidate Amplitude identifier string.
 *
 * Trims the input and returns it only when it's a string with length at least 5; returns `undefined` otherwise.
 * @param {unknown} value - Value to normalize as an Amplitude identifier.
 * @returns {string | undefined} The trimmed identifier when valid, `undefined` when invalid or not a string.
 */
function normalizeAmplitudeId(value) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length >= AMPLITUDE_MIN_ID_LENGTH ? trimmed : undefined;
}

/**
 * Redacts any inline secret patterns found in the provided string.
 * @param {string} value - The input string that may contain sensitive substrings.
 * @returns {string} The input with matched secret substrings replaced by `"[REDACTED]"`.
 */
function scrubInlineSecrets(value) {
  return INLINE_SECRET_PATTERNS.reduce(
    (scrubbedValue, pattern) => scrubbedValue.replace(pattern, '[REDACTED]'),
    value,
  );
}

/**
 * Normalize object keys so equivalent sensitive forms (api_key, api-key, api key) match.
 * @param {string} key - Object key to normalize.
 * @returns {string} Lowercase alphanumeric key.
 */
function normalizeSensitiveKey(key) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Check whether an object key is sensitive and should be removed from telemetry.
 * @param {string} key - Object key to evaluate.
 * @returns {boolean} True when the key represents secret or PII metadata.
 */
function isSensitiveKey(key) {
  const normalizedKey = normalizeSensitiveKey(key);

  return (
    SENSITIVE_KEY_EXACT_MATCHES.has(normalizedKey) ||
    SENSITIVE_KEY_PARTS.some((sensitivePart) => normalizedKey.includes(sensitivePart))
  );
}

/**
 * Sanitize a value for Amplitude by redacting inline secrets and removing sensitive object properties.
 *
 * Handles strings (inline secrets redacted), arrays (elements sanitized), Date (converted to ISO string),
 * Error (returns an object with sanitized `message` and `name`), and plain objects (properties whose keys
 * match the sensitive-key pattern are omitted; other properties are recursively sanitized). Detects
 * circular references and replaces them with the string `"[Circular]"`.
 *
 * @param {unknown} value - The value to sanitize before sending to Amplitude.
 * @returns {unknown} The sanitized value suitable for telemetry, with sensitive fields removed or redacted.
 */
export function scrubAmplitudeProperties(value, seen = new WeakSet()) {
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

    const scrubbed = {};

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
 * Build the configuration object for initializing the Amplitude server SDK.
 * @returns {{logLevel: number, serverZone: 'US' | 'EU'}} An options object where `logLevel` is set to disable SDK logging and `serverZone` is normalized to either `'US'` or `'EU'`.
 */
export function getAmplitudeServerOptions() {
  return {
    logLevel: amplitude.Types.LogLevel.None,
    serverZone: normalizeServerZone(process.env.AMPLITUDE_SERVER_ZONE),
  };
}

/**
 * Whether the current runtime environment has Amplitude enabled.
 */
let amplitudeEnabled = Boolean(getEnvValue('AMPLITUDE_API_KEY'));
let initializedApiKey;

/**
 * Whether the current runtime environment has Amplitude enabled.
 * @returns {boolean} True when Amplitude currently has an API key.
 */
export function isAmplitudeEnabled() {
  return amplitudeEnabled;
}

/**
 * Initialize Amplitude with the current runtime environment, if configured.
 *
 * This intentionally reads `process.env` at call time so dotenv/config loaders
 * that run after this module is imported do not permanently disable analytics.
 *
 * @returns {boolean} `true` when Amplitude has an API key and is initialized.
 */
export function initializeAmplitude() {
  const apiKey = getEnvValue('AMPLITUDE_API_KEY');
  amplitudeEnabled = Boolean(apiKey);

  if (!apiKey) {
    initializedApiKey = undefined;
    return false;
  }

  if (initializedApiKey !== apiKey) {
    amplitude.init(apiKey, getAmplitudeServerOptions());
    initializedApiKey = apiKey;
  }

  return true;
}

/**
 * Send a sanitized analytics event to Amplitude.
 *
 * Event properties are recursively scrubbed of sensitive data before sending.
 *
 * @param {string} eventType - The event name; trimmed and ignored if empty.
 * @param {Record<string, unknown>} [eventProperties] - Arbitrary properties to attach to the event; will be sanitized to remove sensitive keys/values.
 * @param {{user_id?: unknown, userId?: unknown, device_id?: unknown, deviceId?: unknown}} [eventOptions] - Optional identifiers. Accepts either `user_id` or `userId`, and `device_id` or `deviceId`. A default device ID is used if none is provided or valid.
 * @returns {boolean} `true` if the event was successfully tracked, `false` otherwise.
 */
export function trackAnalyticsEvent(eventType, eventProperties = {}, eventOptions = {}) {
  const normalizedEventType = typeof eventType === 'string' ? eventType.trim() : '';

  if (normalizedEventType.length === 0 || !initializeAmplitude()) {
    return false;
  }

  const userId = normalizeAmplitudeId(eventOptions.user_id ?? eventOptions.userId);
  const deviceId =
    normalizeAmplitudeId(eventOptions.device_id ?? eventOptions.deviceId) ??
    DEFAULT_AMPLITUDE_DEVICE_ID;
  const sanitizedProperties = scrubAmplitudeProperties(eventProperties);
  const sanitizedOptions = {};

  if (deviceId) {
    sanitizedOptions.device_id = deviceId;
  }

  if (userId) {
    sanitizedOptions.user_id = userId;
  }

  try {
    amplitude.track(normalizedEventType, sanitizedProperties, sanitizedOptions);
    return true;
  } catch {
    return false;
  }
}

/**
 * Flushes any queued Amplitude events.
 *
 * @returns {boolean} `true` if queued events were successfully flushed, `false` otherwise.
 */
export async function flushAmplitude() {
  if (!initializeAmplitude()) {
    return false;
  }

  try {
    await amplitude.flush().promise;
    return true;
  } catch {
    return false;
  }
}
