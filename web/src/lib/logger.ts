/**
 * Simple logger utility for the web dashboard.
 *
 * Wraps console methods so logging can be swapped to a structured provider
 * (e.g. pino, winston) later without touching every call-site.
 */

/* eslint-disable no-console */

export const logger = {
  debug: (...args: unknown[]) => console.debug(...args),
  info: (...args: unknown[]) => console.info(...args),
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),
};
