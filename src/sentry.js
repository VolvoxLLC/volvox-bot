/**
 * Sentry Error Monitoring
 *
 * Initializes Sentry for error tracking, performance monitoring,
 * and alerting. Must be imported before any other application code.
 *
 * Configure via environment variables:
 *   SENTRY_DSN           - Sentry project DSN (required to enable)
 *   SENTRY_ENVIRONMENT   - Environment name (default: 'production')
 *   SENTRY_TRACES_RATE   - Performance sampling rate 0-1 (default: 0.1)
 *   NODE_ENV             - Used as fallback for environment name
 */

import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN;

/**
 * Whether Sentry is actively initialized.
 * Use this to guard optional Sentry calls in hot paths.
 */
export const sentryEnabled = Boolean(dsn);

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'production',

    // Performance monitoring — sample 10% of transactions by default
    // Use ?? so SENTRY_TRACES_RATE=0 explicitly disables tracing
    tracesSampleRate: (() => {
      const parsed = parseFloat(process.env.SENTRY_TRACES_RATE);
      return Number.isFinite(parsed) ? parsed : 0.1;
    })(),

    // Automatically capture unhandled rejections and uncaught exceptions
    autoSessionTracking: true,

    // Filter out noisy/expected errors
    beforeSend(event) {
      // Skip AbortError from intentional request cancellations
      const message = event.exception?.values?.[0]?.value || '';
      if (message.includes('AbortError') || message.includes('The operation was aborted')) {
        return null;
      }
      return event;
    },

    // Add useful default tags
    initialScope: {
      tags: {
        service: 'volvox-bot',
      },
    },
  });
}

export { Sentry };
