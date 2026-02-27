/**
 * Dashboard logger shim.
 *
 * Intentionally no-op to keep browser code free of direct console usage.
 * Replace with a structured client logger/sink when needed.
 */

const noop = (..._args: unknown[]) => {};

export const logger = {
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
};
