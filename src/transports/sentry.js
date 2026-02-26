/**
 * Sentry Winston Transport
 *
 * Forwards error and warn level logs to Sentry automatically.
 * This is the single integration point — no need to call
 * Sentry.captureException() manually throughout the codebase.
 */

import Transport from 'winston-transport';
import { Sentry } from '../sentry.js';

/**
 * Winston transport that sends error/warn logs to Sentry.
 *
 * - 'error' level → Sentry.captureException (if Error) or captureMessage (if string)
 * - 'warn' level → Sentry.captureMessage with 'warning' severity
 *
 * Metadata from the log entry is attached as Sentry extra context,
 * and recognized tags (source, command, module) are promoted to Sentry tags.
 */
export class SentryTransport extends Transport {
  /**
   * @param {Object} [opts]
   * @param {string} [opts.level='error'] - Minimum log level to forward
   */
  constructor(opts = {}) {
    super({ level: opts.level || 'warn', ...opts });
  }

  /**
   * Known metadata keys to promote to Sentry tags.
   * Everything else goes into Sentry 'extra' context.
   */
  static TAG_KEYS = new Set(['source', 'command', 'module', 'code', 'shardId']);

  /**
   * @param {Object} info - Winston log info object
   * @param {Function} callback
   */
  log(info, callback) {
    const { level, message, timestamp, stack, ...meta } = info;

    // Separate tags from extra context
    const tags = {};
    const extra = {};
    for (const [key, value] of Object.entries(meta)) {
      if (SentryTransport.TAG_KEYS.has(key) && (typeof value === 'string' || typeof value === 'number')) {
        tags[key] = String(value);
      } else if (key !== 'originalLevel' && key !== 'splat') {
        extra[key] = value;
      }
    }

    const context = {
      tags,
      extra,
    };

    if (level === 'error') {
      // If we have a stack trace, reconstruct an Error for better Sentry grouping
      if (stack) {
        const err = new Error(message);
        err.stack = stack;
        Sentry.captureException(err, context);
      } else if (meta.error && typeof meta.error === 'string') {
        // Common pattern: error('Something failed', { error: err.message })
        Sentry.captureMessage(`${message}: ${meta.error}`, { ...context, level: 'error' });
      } else {
        Sentry.captureMessage(message, { ...context, level: 'error' });
      }
    } else if (level === 'warn') {
      Sentry.captureMessage(message, { ...context, level: 'warning' });
    }

    callback();
  }
}
