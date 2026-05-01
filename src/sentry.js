/**
 * Sentry Error Monitoring
 *
 * Initializes Sentry for error tracking, performance monitoring,
 * and alerting. Must be imported before any other application code.
 *
 * Configure via environment variables:
 *   SENTRY_DSN           - Sentry project DSN (required to enable)
 *   SENTRY_ENVIRONMENT   - Environment name (default: 'production')
 *   SENTRY_SEND_DEFAULT_PII - Enable default PII capture after local scrubbing (default: false)
 *   SENTRY_TRACES_RATE   - Performance sampling rate 0-1 (default: 0.1)
 *   NODE_ENV             - Used as fallback for environment name
 */

import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN;
// Keep Sentry default PII capture opt-in only; any value other than the explicit string "true" stays disabled.
const sendDefaultPii = process.env.SENTRY_SEND_DEFAULT_PII === 'true';
const SENSITIVE_KEY_PATTERN =
  /(?:authorization|cookie|csrf|secret|password|token|session|stack|x[-_]?forwarded[-_]?for|ip(?:[-_]?address)?|x[-_]?api[-_]?key|api[-_]?key|bot[-_]?api[-_]?secret|access[-_]?token|refresh[-_]?token)/i;

/**
 * Recursively removes sensitive keys from arbitrary Sentry metadata.
 *
 * @param {unknown} value - Metadata value to scrub.
 * @returns {unknown} A copy with sensitive object keys removed.
 */
function scrubUnknown(value) {
  if (Array.isArray(value)) {
    return value.map(scrubUnknown);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const scrubbed = {};

  for (const [key, childValue] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      continue;
    }

    scrubbed[key] = scrubUnknown(childValue);
  }

  return scrubbed;
}

/**
 * Strip query parameters from a Sentry request URL without dropping the path.
 *
 * @param {unknown} value - Request URL value from a Sentry event.
 * @returns {unknown} The URL without its query component, or the original value when not a string.
 */
function stripRequestUrlQuery(value) {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    const isAbsoluteUrl = /^[a-z][a-z\d+.-]*:/i.test(value);
    const url = new URL(value, 'https://volvox.local');
    url.search = '';

    return isAbsoluteUrl ? url.toString() : `${url.pathname}${url.hash}`;
  } catch {
    const queryIndex = value.indexOf('?');
    return queryIndex === -1 ? value : value.slice(0, queryIndex);
  }
}

/**
 * Removes sensitive fields and identifiers from a Sentry event or performance payload.
 *
 * Mutates the provided event in place: deletes user email and IP address, removes request cookies,
 * replaces request headers and nested data with scrubbed copies (or deletes request.data if it cannot
 * be represented as an object), and replaces `extra`, `contexts`, and `data` with scrubbed copies.
 *
 * @param {object} event - Sentry event-like payload to be sanitized; this object is modified in place.
 * @returns {object} The same event object after in-place scrubbing.
 */
function scrubSentryEvent(event) {
  if (event.user) {
    delete event.user.email;
    delete event.user.ip_address;
  }

  if (event.request) {
    delete event.request.cookies;
    delete event.request.query_string;

    if (event.request.url) {
      event.request.url = stripRequestUrlQuery(event.request.url);
    }

    if (event.request.headers) {
      event.request.headers = scrubUnknown(event.request.headers);
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
    event.extra = scrubUnknown(event.extra);
  }

  if (event.contexts) {
    event.contexts = scrubUnknown(event.contexts);
  }

  if (event.data) {
    event.data = scrubUnknown(event.data);
  }

  return event;
}

/**
 * Whether Sentry is actively initialized.
 * Use this to guard optional Sentry calls in hot paths.
 */
export const sentryEnabled = Boolean(dsn);

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'production',
    sendDefaultPii,

    // Performance monitoring — sample 10% of transactions by default
    // Use ?? so SENTRY_TRACES_RATE=0 explicitly disables tracing
    tracesSampleRate: (() => {
      const parsed = parseFloat(process.env.SENTRY_TRACES_RATE);
      return Number.isFinite(parsed) ? parsed : 0.1;
    })(),

    // Automatically capture unhandled rejections and uncaught exceptions
    autoSessionTracking: true,

    // Filter out noisy/expected errors and scrub sensitive metadata
    beforeSend(event) {
      // Skip AbortError from intentional request cancellations
      const message = event.exception?.values?.[0]?.value || '';
      if (message.includes('AbortError') || message.includes('The operation was aborted')) {
        return null;
      }
      return scrubSentryEvent(event);
    },
    beforeSendTransaction: scrubSentryEvent,
    beforeSendSpan: scrubSentryEvent,

    // Add useful default tags
    initialScope: {
      tags: {
        service: 'volvox-bot',
      },
    },
  });
}

export { Sentry };
