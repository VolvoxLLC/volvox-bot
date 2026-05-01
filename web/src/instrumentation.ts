import * as Sentry from '@sentry/nextjs';

/**
 * Loads and applies the Sentry configuration corresponding to the NEXT_RUNTIME environment.
 *
 * @returns Nothing.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
