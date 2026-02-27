/**
 * Dashboard logger shim.
 *
 * Browser runtime: no-op to keep client bundles free of direct logging.
 * Server runtime: lightweight stderr/stdout logger.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const noop = (..._args: unknown[]) => {};
const isBrowser = typeof window !== 'undefined';

function formatArg(arg: unknown): string {
  if (typeof arg === 'string') return arg;

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

const makeServerLogger = (level: LogLevel) => (...args: unknown[]) => {
  writeServerLog(level, args);
};

export const logger = isBrowser
  ? {
      debug: noop,
      info: noop,
      warn: noop,
      error: noop,
    }
  : {
      debug: makeServerLogger('debug'),
      info: makeServerLogger('info'),
      warn: makeServerLogger('warn'),
      error: makeServerLogger('error'),
    };
