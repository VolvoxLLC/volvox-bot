/**
 * Dashboard logger shim.
 *
 * Browser runtime: thin wrapper around console methods that adds a
 * `[VolvoxDash] [ISO-8601 timestamp] [LEVEL]` prefix for consistent
 * structured logging visible in DevTools. Only `warn` and `error` are
 * active in production builds; `debug` and `info` are suppressed unless
 * `NODE_ENV === 'development'`.
 *
 * Server runtime: lightweight stderr/stdout logger (no Winston dependency).
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const isBrowser = typeof window !== 'undefined';

// ─── Server logger ──────────────────────────────────────────────────────────

function formatArg(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) {
    return JSON.stringify({ name: arg.name, message: arg.message, stack: arg.stack });
  }
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function writeServerLog(level: LogLevel, args: unknown[]): void {
  if (isBrowser || typeof process === 'undefined') return;

  const stream = level === 'warn' || level === 'error' ? process.stderr : process.stdout;
  if (!stream?.write) return;

  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${args
    .map(formatArg)
    .join(' ')}\n`;

  stream.write(line);
}

const makeServerLogger =
  (level: LogLevel) =>
  (...args: unknown[]) => {
    writeServerLog(level, args);
  };

// ─── Browser logger ─────────────────────────────────────────────────────────

/** Map log levels to their corresponding console methods. */
const CONSOLE_METHOD: Record<LogLevel, 'debug' | 'info' | 'warn' | 'error'> = {
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
};

const isDev = typeof process !== 'undefined' ? process.env.NODE_ENV === 'development' : false;

const noop = (..._args: unknown[]) => {};

function makeBrowserLogger(level: LogLevel): (...args: unknown[]) => void {
  // In production, suppress noisy debug/info — only surface warnings and errors.
  if (isDev || level === 'warn' || level === 'error') {
    // active in all envs
  } else {
    return noop;
  }

  const method = CONSOLE_METHOD[level];

  return (...args: unknown[]) => {
    // biome-ignore lint/suspicious/noConsole: browser logger shim wraps console for structured output
    console[method](`[VolvoxDash] [${new Date().toISOString()}] [${level.toUpperCase()}]`, ...args);
  };
}

// ─── Export ──────────────────────────────────────────────────────────────────

export const logger = isBrowser
  ? {
      debug: makeBrowserLogger('debug'),
      info: makeBrowserLogger('info'),
      warn: makeBrowserLogger('warn'),
      error: makeBrowserLogger('error'),
    }
  : {
      debug: makeServerLogger('debug'),
      info: makeServerLogger('info'),
      warn: makeServerLogger('warn'),
      error: makeServerLogger('error'),
    };
