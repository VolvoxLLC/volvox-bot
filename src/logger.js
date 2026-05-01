/**
 * Structured Logger Module
 *
 * Provides centralized logging with:
 * - Multiple log levels (debug, info, warn, error)
 * - Timestamp formatting
 * - Structured output
 * - Console transport (file transport added in phase 3)
 *
 * TODO: Logger browser shim — this module uses Winston + Node.js APIs (fs, path) and cannot
 * be imported in browser/Next.js client components. If client-side structured logging is
 * needed (e.g. for error tracking or debug mode), create a thin `web/src/lib/logger.ts`
 * shim that wraps the browser console with the same interface (info/warn/error/debug)
 * and optionally forwards to a remote logging endpoint.
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { sentryEnabled } from './sentry.js';
import { SentryTransport } from './transports/sentry.js';
import { WebSocketTransport } from './transports/websocket.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, '..', 'config.json');
const logsDir = join(__dirname, '..', 'logs');

// Load config to get log level and file output setting
let logLevel = 'info';
let fileOutputEnabled = false;

try {
  if (existsSync(configPath)) {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    logLevel = process.env.LOG_LEVEL || config.logging?.level || 'info';
    fileOutputEnabled = config.logging?.fileOutput || false;
  }
} catch (_err) {
  // Fallback to default if config can't be loaded
  logLevel = process.env.LOG_LEVEL || 'info';
}

// Create logs directory if file output is enabled
if (fileOutputEnabled) {
  try {
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }
  } catch (_err) {
    // Log directory creation failed, but continue without file logging
    fileOutputEnabled = false;
  }
}

/**
 * Sensitive field names that should be redacted from logs.
 * Pattern-based matches (any env var ending in `_API_KEY` or `_AUTH_TOKEN`) are
 * handled by `isSensitiveKey()` using `SENSITIVE_PATTERNS` so new providers are
 * covered automatically.
 */
const SENSITIVE_FIELDS = [
  'DISCORD_TOKEN',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'token',
  'authToken',
  'password',
  'apiKey',
  'authorization',
  'secret',
  'clientSecret',
  'DATABASE_URL',
  'connectionString',
];

/**
 * Case-insensitive suffix patterns that mark a key as sensitive. Covers both
 * snake_case (`MINIMAX_API_KEY`, `PROVIDER_AUTH_TOKEN`) and camelCase
 * (`classifyApiKey`, `respondApiKey`, `authToken`) conventions so new providers
 * and config keys are redacted without per-field maintenance. The generic
 * `secret` suffix catches SESSION_SECRET, NEXTAUTH_SECRET, clientSecret, etc.
 */
const SENSITIVE_PATTERNS = [
  /(?:^|[_-])api[_-]?key$/i,
  /apiKey$/i,
  /(?:^|[_-])auth[_-]?token$/i,
  /authToken$/i,
  /secret$/i,
];

/**
 * Inline-value patterns that redact substrings inside log messages. Used as a
 * last-line defence when a credential appears inside a message string rather
 * than as a metadata key (e.g. when an SDK reflects auth headers into its
 * error message).
 *
 * Each pattern replaces the matched substring with `[REDACTED]`. Keep these
 * tight — an over-broad pattern corrupts legitimate messages.
 */
const INLINE_SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  // Covers both generic `sk-…` secrets and Anthropic `sk-ant-…` tokens — the
  // broader pattern already matches `ant-` within the character class, so a
  // dedicated `sk-ant-…` entry would never fire.
  /sk-[A-Za-z0-9_-]{20,}/g,
];

/**
 * Scrub inline secrets from a free-form string. Returns the original value
 * unchanged if nothing matches or input is non-string.
 * @param {unknown} value
 * @returns {unknown}
 */
function scrubInlineSecrets(value) {
  if (typeof value !== 'string') return value;
  let out = value;
  for (const pattern of INLINE_SECRET_PATTERNS) {
    out = out.replace(pattern, '[REDACTED]');
  }
  return out;
}

/**
 * Determine whether a key name is sensitive.
 * Exact (case-insensitive) match against SENSITIVE_FIELDS, or a suffix match
 * against SENSITIVE_PATTERNS.
 *
 * @param {string} key
 * @returns {boolean}
 */
function isSensitiveKey(key) {
  if (typeof key !== 'string') return false;
  const lower = key.toLowerCase();
  if (SENSITIVE_FIELDS.some((field) => field.toLowerCase() === lower)) return true;
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Clone an Error, preserving its subclass and scrubbing secrets from `message`,
 * `stack`, and every enumerable own-property (including `cause`). Called from
 * `filterSensitiveData` whenever an Error surfaces inside log metadata.
 *
 * The `seen` WeakMap short-circuits cyclic error graphs — e.g. `err.cause = err`
 * or an `AggregateError` whose `errors` array contains itself. The clone is
 * registered in `seen` BEFORE recursing, so any back-reference at any depth
 * resolves to the already-being-built clone instead of stack-overflowing.
 *
 * @param {Error} err
 * @param {WeakMap<object, unknown>} [seen]
 * @returns {Error}
 */
function cloneAndScrubError(err, seen = new WeakMap()) {
  if (seen.has(err)) return seen.get(err);

  const scrubbedMessage = scrubInlineSecrets(err.message);

  // Use Object.create + defineProperty rather than `new Ctor(scrubbedMessage)`
  // because several built-in Error subclasses (most notably AggregateError)
  // interpret their first constructor argument as an iterable of sub-errors
  // rather than a message string — `new AggregateError("Bearer …")` throws
  // or silently discards the message. Direct prototype instantiation
  // sidesteps every subclass's constructor quirks while preserving the
  // prototype chain so `instanceof` checks downstream still hold.
  const cloned = Object.create(Object.getPrototypeOf(err));

  // Register BEFORE recursing so cyclic references resolve to this clone.
  seen.set(err, cloned);

  Object.defineProperty(cloned, 'message', {
    value: scrubbedMessage,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(cloned, 'name', {
    value: err.name,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  if (typeof err.stack === 'string') {
    Object.defineProperty(cloned, 'stack', {
      value: scrubInlineSecrets(err.stack),
      writable: true,
      enumerable: false,
      configurable: true,
    });
  }

  const scrubValue = (value) => {
    if (typeof value === 'object' && value !== null) return filterSensitiveData(value, seen);
    if (typeof value === 'string') return scrubInlineSecrets(value);
    return value;
  };

  // `cause` set via `new Error(msg, { cause })` is a non-enumerable own-property,
  // so Object.entries misses it. Preserve its non-enumerable shape on the clone.
  if (Object.hasOwn(err, 'cause')) {
    Object.defineProperty(cloned, 'cause', {
      value: scrubValue(err.cause),
      writable: true,
      enumerable: false,
      configurable: true,
    });
  }

  // AggregateError carries its sub-errors on the non-enumerable own-property
  // `errors`. Recurse into each so a leaked Bearer token in a child error's
  // message gets scrubbed the same way a top-level one would.
  //
  // A non-array `errors` (e.g. `{ field: 'invalid' }` on a custom ValidationError)
  // would otherwise be dropped entirely — the enumerable-copy loop below
  // skips it because `errors` is non-enumerable. Preserve whatever shape the
  // caller set by scrubbing it through `scrubValue`.
  if (Object.hasOwn(err, 'errors') && Array.isArray(err.errors)) {
    cloned.errors = err.errors.map((sub) => scrubValue(sub));
  } else if (Object.hasOwn(err, 'errors')) {
    cloned.errors = scrubValue(err.errors);
  }

  // Copy remaining enumerable own-properties (code, custom fields), scrubbing
  // each the same way filterSensitiveData would for a plain object.
  for (const [key, value] of Object.entries(err)) {
    if (
      key === 'message' ||
      key === 'stack' ||
      key === 'name' ||
      key === 'cause' ||
      key === 'errors'
    )
      continue;
    if (isSensitiveKey(key)) {
      cloned[key] = '[REDACTED]';
    } else {
      cloned[key] = scrubValue(value);
    }
  }
  return cloned;
}

/**
 * Recursively filter sensitive data from objects.
 * - Keys matching the sensitive list/patterns → `[REDACTED]`.
 * - String values get scrubbed for inline secrets (e.g. `Bearer <token>`).
 * - Nested objects/arrays recurse.
 *
 * `Error` instances are cloned (preserving subclass so `instanceof TypeError`
 * still holds downstream) with `message`, `stack`, and every enumerable own
 * property scrubbed. This closes the nested-leak path where
 * `{ cause: new Error('Bearer sk-…') }` would otherwise land in log output
 * unredacted — the top-level format only scrubs `info.message` / `info.stack`.
 *
 * The `seen` WeakMap threads through every recursive call (arrays, plain
 * objects, and Error clones) so cyclic graphs — e.g. an object that refers
 * back to an ancestor — short-circuit to the previously-built clone instead
 * of stack-overflowing.
 *
 * @param {unknown} obj
 * @param {WeakMap<object, unknown>} [seen]
 */
function filterSensitiveData(obj, seen = new WeakMap()) {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return scrubInlineSecrets(obj);
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (obj instanceof Error) {
    return cloneAndScrubError(obj, seen);
  }

  if (seen.has(obj)) return seen.get(obj);

  if (Array.isArray(obj)) {
    const out = [];
    seen.set(obj, out);
    for (const item of obj) {
      out.push(filterSensitiveData(item, seen));
    }
    return out;
  }

  const filtered = {};
  seen.set(obj, filtered);
  for (const [key, value] of Object.entries(obj)) {
    if (isSensitiveKey(key)) {
      filtered[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      filtered[key] = filterSensitiveData(value, seen);
    } else if (typeof value === 'string') {
      filtered[key] = scrubInlineSecrets(value);
    } else {
      filtered[key] = value;
    }
  }

  return filtered;
}

/**
 * Winston format that redacts sensitive data
 */
const redactSensitiveData = winston.format((info) => {
  // Reserved winston properties that should not be recursively filtered as
  // metadata — but `message` and `stack` are still scanned for inline secrets
  // (SDK errors sometimes reflect `Bearer <token>` into their message text).
  const reserved = ['level', 'message', 'timestamp', 'stack'];

  // Filter each property in the info object
  for (const key in info) {
    if (Object.hasOwn(info, key) && !reserved.includes(key)) {
      if (isSensitiveKey(key)) {
        info[key] = '[REDACTED]';
      } else if (typeof info[key] === 'object' && info[key] !== null) {
        // Recursively filter nested objects
        info[key] = filterSensitiveData(info[key]);
      } else if (typeof info[key] === 'string') {
        info[key] = scrubInlineSecrets(info[key]);
      }
    }
  }

  // Scrub the message string and stack trace for inline credentials. This is
  // the last line of defence against an SDK leaking a token into its error
  // message before Sentry/Postgres/file transports persist it.
  if (typeof info.message === 'string') {
    info.message = scrubInlineSecrets(info.message);
  }
  if (typeof info.stack === 'string') {
    info.stack = scrubInlineSecrets(info.stack);
  }

  return info;
})();

/**
 * Emoji mapping for log levels
 */
const EMOJI_MAP = {
  error: '❌',
  warn: '⚠️',
  info: '✅',
  debug: '🔍',
};

/**
 * Format that stores the original level before colorization
 */
const preserveOriginalLevel = winston.format((info) => {
  info.originalLevel = info.level;
  return info;
})();

/**
 * Circular-reference-safe JSON.stringify replacer. Logged errors may carry
 * cyclic graphs (e.g. `err.cause = err`, or `AggregateError.errors` containing
 * the aggregate itself) — `cloneAndScrubError` intentionally preserves those
 * back-references rather than re-cloning into infinity, so the formatter must
 * also tolerate them instead of throwing "Converting circular structure to JSON".
 *
 * @returns {(key: string, value: unknown) => unknown}
 */
function circularSafeReplacer() {
  const seen = new WeakSet();
  return (_key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
    }
    return value;
  };
}

/**
 * Custom format for console output with emoji prefixes
 */
const consoleFormat = winston.format.printf(
  ({ level, message, timestamp, originalLevel, ...meta }) => {
    // Use originalLevel for emoji lookup since 'level' may contain ANSI color codes
    const prefix = EMOJI_MAP[originalLevel] || '📝';
    const metaStr =
      Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta, circularSafeReplacer())}` : '';

    const lvl = typeof originalLevel === 'string' ? originalLevel : (level ?? 'info');
    return `${prefix} [${timestamp}] ${lvl.toUpperCase()}: ${message}${metaStr}`;
  },
);

/**
 * Create winston logger instance
 */
const transports = [
  new winston.transports.Console({
    format: winston.format.combine(
      redactSensitiveData,
      preserveOriginalLevel,
      winston.format.colorize(),
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      consoleFormat,
    ),
  }),
];

// Add file transport if enabled in config
if (fileOutputEnabled) {
  transports.push(
    new DailyRotateFile({
      filename: join(logsDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: winston.format.combine(
        redactSensitiveData,
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.json(),
      ),
    }),
  );

  // Separate transport for error-level logs only
  transports.push(
    new DailyRotateFile({
      level: 'error',
      filename: join(logsDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: winston.format.combine(
        redactSensitiveData,
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.json(),
      ),
    }),
  );
}

// Add Sentry transport if enabled — all error/warn logs automatically go to Sentry
if (sentryEnabled) {
  transports.push(new SentryTransport({ level: 'warn' }));
}

const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    redactSensitiveData,
  ),
  transports,
});

/**
 * Log at debug level
 */
export function debug(message, meta = {}) {
  logger.debug(message, meta);
}

/**
 * Log at info level
 */
export function info(message, meta = {}) {
  logger.info(message, meta);
}

/**
 * Log at warn level
 */
export function warn(message, meta = {}) {
  logger.warn(message, meta);
}

/**
 * Log at error level
 */
export function error(message, meta = {}) {
  logger.error(message, meta);
}

/**
 * Create and add a WebSocket transport to the logger.
 * Returns the transport instance so it can be passed to the WS server setup.
 *
 * @returns {WebSocketTransport} The transport instance
 */
export function addWebSocketTransport() {
  const transport = new WebSocketTransport({
    level: logLevel,
    format: winston.format.combine(
      redactSensitiveData,
      winston.format.timestamp(),
      winston.format.json(),
    ),
  });

  logger.add(transport);
  return transport;
}

/**
 * Remove a WebSocket transport from the logger.
 *
 * @param {WebSocketTransport} transport - The transport to remove
 */
export function removeWebSocketTransport(transport) {
  if (transport) {
    transport.close();
    logger.remove(transport);
  }
}

// Default export for convenience
export default {
  debug,
  info,
  warn,
  error,
  logger, // Export winston logger instance for advanced usage
};
