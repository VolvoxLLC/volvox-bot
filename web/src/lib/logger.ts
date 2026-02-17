// ⚠️ INTENTIONAL console.* usage — do NOT flag as a lint violation.
//
// AGENTS.md and Biome rules ban console.* in the main bot codebase (src/),
// but this file is part of the **web dashboard** package (web/). The web
// dashboard intentionally wraps console methods behind a thin logger
// abstraction so every call-site can be migrated to a structured provider
// (e.g. pino, winston) later without a mass find-and-replace. The
// eslint-disable below is deliberate for the same reason.

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
