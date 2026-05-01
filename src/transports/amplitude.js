/**
 * Amplitude Winston Transport
 *
 * Forwards sanitized info/warn log records to Amplitude. Error-level logs stay
 * in Sentry so alerting and exception grouping remain there.
 */

import Transport from 'winston-transport';
import * as amplitude from '../amplitude.js';

const TRACKED_LEVELS = new Set(['info', 'warn']);
const RESERVED_KEYS = new Set(['level', 'message', 'originalLevel', 'splat', 'timestamp']);

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

      if (!TRACKED_LEVELS.has(level) || !amplitude.initializeAmplitude()) {
        return;
      }

      const rawProperties = {
        level,
        message: typeof message === 'string' ? message : String(message),
      };

      for (const [key, value] of Object.entries(info)) {
        if (RESERVED_KEYS.has(key)) {
          continue;
        }

        rawProperties[key] = value;
      }

      amplitude.trackAnalyticsEvent(amplitude.AMPLITUDE_LOG_EVENT, rawProperties);
    } catch {
      // Logging must never fail the process because analytics ingestion is down.
    } finally {
      callback();
    }
  }
}
