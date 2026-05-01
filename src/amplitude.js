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
const SENSITIVE_KEY_PATTERN =
  /(?:authorization|cookie|csrf|secret|password|token|session|stack|x[-_]?forwarded[-_]?for|ip(?:[-_]?address)?|x[-_]?api[-_]?key|api[-_]?key|bot[-_]?api[-_]?secret|access[-_]?token|refresh[-_]?token|email)/i;
const INLINE_SECRET_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\bsk-[A-Za-z0-9][A-Za-z0-9_-]{10,}/g,
  /\b(?:xox[baprs]|gh[pousr])_[A-Za-z0-9_/-]{10,}/g,
];

/**
 * @param {string} key
 * @returns {string | undefined}
 */
function getEnvValue(key) {
  const value = process.env[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * @param {string | undefined} value
 * @returns {'US' | 'EU'}
 */
function normalizeServerZone(value) {
  return value?.trim().toUpperCase() === 'EU' ? 'EU' : 'US';
}

/**
 * @param {unknown} value
 * @returns {string | undefined}
 */
function normalizeAmplitudeId(value) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length >= AMPLITUDE_MIN_ID_LENGTH ? trimmed : undefined;
}

/**
 * @param {string} value
 * @returns {string}
 */
function scrubInlineSecrets(value) {
  return INLINE_SECRET_PATTERNS.reduce(
    (scrubbedValue, pattern) => scrubbedValue.replace(pattern, '[REDACTED]'),
    value,
  );
}

/**
 * Recursively removes sensitive keys from Amplitude event properties.
 *
 * @param {unknown} value
 * @param {WeakSet<object>} [seen]
 * @returns {unknown}
 */
export function scrubAmplitudeProperties(value, seen = new WeakSet()) {
  if (typeof value === 'string') {
    return scrubInlineSecrets(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => scrubAmplitudeProperties(item, seen));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  seen.add(value);

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
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      continue;
    }

    scrubbed[key] = scrubAmplitudeProperties(childValue, seen);
  }

  return scrubbed;
}

/**
 * @returns {{logLevel: number, serverZone: 'US' | 'EU'}}
 */
export function getAmplitudeServerOptions() {
  return {
    logLevel: amplitude.Types.LogLevel.None,
    serverZone: normalizeServerZone(process.env.AMPLITUDE_SERVER_ZONE),
  };
}

const apiKey = getEnvValue('AMPLITUDE_API_KEY');

/**
 * Whether Amplitude is actively initialized.
 */
export const amplitudeEnabled = Boolean(apiKey);

if (apiKey) {
  amplitude.init(apiKey, getAmplitudeServerOptions());
}

/**
 * Tracks a sanitized analytics event.
 *
 * @param {string} eventType
 * @param {Record<string, unknown>} [eventProperties]
 * @param {{user_id?: unknown, userId?: unknown, device_id?: unknown, deviceId?: unknown}} [eventOptions]
 * @returns {boolean}
 */
export function trackAnalyticsEvent(eventType, eventProperties = {}, eventOptions = {}) {
  const normalizedEventType = typeof eventType === 'string' ? eventType.trim() : '';

  if (!amplitudeEnabled || normalizedEventType.length === 0) {
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
 * Flushes queued Amplitude events before shutdown.
 *
 * @returns {Promise<boolean>}
 */
export async function flushAmplitude() {
  if (!amplitudeEnabled) {
    return false;
  }

  try {
    await amplitude.flush().promise;
    return true;
  } catch {
    return false;
  }
}
