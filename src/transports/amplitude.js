/**
 * Amplitude Winston Transport
 *
 * Forwards sanitized info/warn log records to Amplitude. Error-level logs stay
 * in Sentry so alerting and exception grouping remain there.
 */

import Transport from 'winston-transport';
import { AMPLITUDE_LOG_EVENT, trackAnalyticsEvent } from '../amplitude.js';

const TRACKED_LEVELS = new Set(['info', 'warn']);
const RESERVED_KEYS = new Set(['level', 'message', 'originalLevel', 'splat', 'timestamp']);
const SENSITIVE_KEY_PATTERN =
  /(?:authorization|cookie|csrf|secret|password|token|session|stack|x[-_]?forwarded[-_]?for|ip(?:[-_]?address)?|x[-_]?api[-_]?key|api[-_]?key|bot[-_]?api[-_]?secret|access[-_]?token|refresh[-_]?token|email)/i;

/**
 * Sanitize a log value into a safe, serializable structure suitable for analytics.
 *
 * Converts arrays recursively, returns primitives unchanged, formats Dates as ISO strings,
 * reduces Errors to `{ message, name }`, removes object properties whose keys match
 * the sensitive-key pattern, and replaces circular references with the string `"[Circular]"`.
 *
 * @param {unknown} value - The value to sanitize before forwarding to analytics.
 * @param {WeakSet<object>} [seen] - WeakSet used internally to track visited objects and detect circular references.
 * @returns {unknown} The sanitized value: a primitive or array, an ISO string for Dates, an `{ message, name }` object for Errors, an object with sensitive keys omitted, or the string `"[Circular]"` for circular references.
 */
function sanitizeLogValue(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  seen.add(value);

  try {
    if (Array.isArray(value)) {
      return value.map((item) => sanitizeLogValue(item, seen));
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (value instanceof Error) {
      return {
        message: value.message,
        name: value.name,
      };
    }

    const sanitized = {};

    for (const [key, childValue] of Object.entries(value)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        continue;
      }

      sanitized[key] = sanitizeLogValue(childValue, seen);
    }

    return sanitized;
  } finally {
    seen.delete(value);
  }
}

/**
 * Winston transport that sends non-error log records to Amplitude.
 */
export class AmplitudeTransport extends Transport {
  /**
   * @param {Object} [opts]
   * @param {string} [opts.level='info'] - Minimum log level to forward
   */
  constructor(opts = {}) {
    super({ level: opts.level || 'info', ...opts });
  }

  /**
   * @param {Object} info - Winston log info object
   * @param {Function} callback
   */
  log(info, callback) {
    try {
      const { level, message } = info;

      if (!TRACKED_LEVELS.has(level)) {
        return;
      }

      const properties = {
        level,
        message: typeof message === 'string' ? message : String(message),
      };

      for (const [key, value] of Object.entries(info)) {
        if (RESERVED_KEYS.has(key) || SENSITIVE_KEY_PATTERN.test(key)) {
          continue;
        }

        properties[key] = sanitizeLogValue(value);
      }

      trackAnalyticsEvent(AMPLITUDE_LOG_EVENT, properties);
    } catch {
      // Logging must never fail the process because analytics ingestion is down.
    } finally {
      callback();
    }
  }
}
