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
const CIRCULAR_REFERENCE_SENTINEL = '[Circular]';
const SENSITIVE_KEY_PATTERN =
  /(?:authorization|cookie|csrf|e-?mail|secret|password|token|session|stack|x[-_]?forwarded[-_]?for|ip(?:[-_]?address)?|x[-_]?api[-_]?key|api[-_]?key|bot[-_]?api[-_]?secret|access[-_]?token|refresh[-_]?token)/i;
const URL_METADATA_KEY_PATTERN = /url/i;
const INLINE_SECRET_REPLACEMENTS = [
  { pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, replacement: '[REDACTED]' },
  { pattern: /\bsk-[A-Za-z0-9][A-Za-z0-9_-]{10,}/g, replacement: '[REDACTED]' },
  {
    pattern: /\b(?:xox[baprs]|gh[pousr])_[A-Za-z0-9_/-]{10,}/g,
    replacement: '[REDACTED]',
  },
  { pattern: /\bgithub_pat_[A-Za-z0-9_]{10,}/g, replacement: '[REDACTED]' },
  {
    pattern:
      /([?&#]\s*(?:access[-_]?token|refresh[-_]?token|api[-_]?key|token|secret|password)\s*=)\s*[^\s&#]+/gi,
    replacement: '$1[REDACTED]',
  },
  {
    pattern:
      /(^|[\s,;])((?:access[-_]?token|refresh[-_]?token|api[-_]?key|token|secret|password)\s*=)\s*[^\s,;&#]+/gi,
    replacement: '$1$2[REDACTED]',
  },
];

/**
 * Redact secret-looking substrings from free-form strings before they reach Sentry.
 * @param {string} value - The string to scrub.
 * @returns {string} The string with inline secrets redacted.
 */
function scrubInlineSecrets(value) {
  return INLINE_SECRET_REPLACEMENTS.reduce(
    (scrubbedValue, { pattern, replacement }) => scrubbedValue.replace(pattern, replacement),
    value,
  );
}

/**
 * Recursively removes sensitive keys from arbitrary Sentry metadata.
 *
 * @param {unknown} value - Metadata value to scrub.
 * @param {WeakSet<object>} seen - Objects on the current recursion path.
 * @returns {unknown} A copy with sensitive object keys removed.
 */
function scrubUnknown(value, seen = new WeakSet()) {
  if (typeof value === 'string') {
    return scrubInlineSecrets(value);
  }

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

  const scrubbed = {};

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
 * Strip query parameters and fragments from a Sentry request URL without dropping the path.
 *
 * @param {unknown} value - Request URL value from a Sentry event.
 * @returns {unknown} The URL without its query or fragment component, or the original value when not a string.
 */
function stripRequestUrlQuery(value) {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    const isAbsoluteUrl = /^[a-z][a-z\d+.-]*:/i.test(value);
    const url = new URL(value, 'https://volvox.local');
    url.search = '';
    url.hash = '';

    return isAbsoluteUrl ? url.toString() : url.pathname;
  } catch {
    const queryIndex = value.indexOf('?');
    const fragmentIndex = value.indexOf('#');
    const stripIndex = [queryIndex, fragmentIndex]
      .filter((index) => index !== -1)
      .reduce((earliestIndex, index) => Math.min(earliestIndex, index), value.length);

    return stripIndex === value.length ? value : value.slice(0, stripIndex);
  }
}

/**
 * Recursively scrub breadcrumb metadata and strip query strings from URL fields.
 *
 * @param {unknown} value - Breadcrumb data value to scrub.
 * @param {WeakSet<object>} seen - Objects on the current recursion path.
 * @returns {unknown} A scrubbed copy of the breadcrumb data value.
 */
function scrubBreadcrumbData(value, seen = new WeakSet()) {
  if (typeof value === 'string') {
    return scrubInlineSecrets(value);
  }

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

  const scrubbed = {};

  for (const [key, childValue] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      continue;
    }

    const scrubbedValue = scrubBreadcrumbData(childValue, seen);
    scrubbed[key] = URL_METADATA_KEY_PATTERN.test(key)
      ? stripRequestUrlQuery(scrubbedValue)
      : scrubbedValue;
  }

  seen.delete(value);
  return scrubbed;
}

/**
 * Scrubs Sentry breadcrumb payloads so URL query strings and nested secrets cannot bypass scrubbing.
 *
 * @param {unknown} breadcrumbs - Event breadcrumb list.
 * @returns {unknown} Scrubbed breadcrumbs, or the original value if it is not an array.
 */
function scrubBreadcrumbs(breadcrumbs) {
  if (!Array.isArray(breadcrumbs)) {
    return breadcrumbs;
  }

  return breadcrumbs.map((breadcrumb) => {
    if (!breadcrumb || typeof breadcrumb !== 'object') {
      return breadcrumb;
    }

    const scrubbedBreadcrumb = { ...breadcrumb };
    if (typeof scrubbedBreadcrumb.message === 'string') {
      scrubbedBreadcrumb.message = scrubInlineSecrets(scrubbedBreadcrumb.message);
    }

    if ('data' in scrubbedBreadcrumb) {
      scrubbedBreadcrumb.data = scrubBreadcrumbData(scrubbedBreadcrumb.data);
    }

    return scrubbedBreadcrumb;
  });
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
      const rawData = event.request.data;
      const scrubbedData = scrubUnknown(rawData);
      if (scrubbedData && typeof scrubbedData === 'object') {
        event.request.data = scrubbedData;
      } else if (typeof scrubbedData === 'string' && scrubbedData !== rawData) {
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

  if (event.breadcrumbs) {
    event.breadcrumbs = scrubBreadcrumbs(event.breadcrumbs);
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
