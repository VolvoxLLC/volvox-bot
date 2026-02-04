/**
 * Structured Logger Module
 *
 * Provides centralized logging with:
 * - Multiple log levels (debug, info, warn, error)
 * - Timestamp formatting
 * - Structured output
 * - Console transport (file transport added in phase 3)
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

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
} catch (err) {
  // Fallback to default if config can't be loaded
  logLevel = process.env.LOG_LEVEL || 'info';
}

// Create logs directory if file output is enabled
if (fileOutputEnabled) {
  try {
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }
  } catch (err) {
    // Log directory creation failed, but continue without file logging
    fileOutputEnabled = false;
  }
}

/**
 * Sensitive field names that should be redacted from logs
 */
const SENSITIVE_FIELDS = [
  'DISCORD_TOKEN',
  'OPENCLAW_TOKEN',
  'token',
  'password',
  'apiKey',
  'authorization'
];

/**
 * Recursively filter sensitive data from objects
 */
function filterSensitiveData(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => filterSensitiveData(item));
  }

  const filtered = {};
  for (const [key, value] of Object.entries(obj)) {
    // Check if key matches any sensitive field (case-insensitive)
    const isSensitive = SENSITIVE_FIELDS.some(
      field => key.toLowerCase() === field.toLowerCase()
    );

    if (isSensitive) {
      filtered[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      filtered[key] = filterSensitiveData(value);
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
  // Reserved winston properties that should not be filtered
  const reserved = ['level', 'message', 'timestamp', 'stack'];

  // Filter each property in the info object
  for (const key in info) {
    if (Object.prototype.hasOwnProperty.call(info, key) && !reserved.includes(key)) {
      // Check if this key is sensitive (case-insensitive)
      const isSensitive = SENSITIVE_FIELDS.some(
        field => key.toLowerCase() === field.toLowerCase()
      );

      if (isSensitive) {
        info[key] = '[REDACTED]';
      } else if (typeof info[key] === 'object' && info[key] !== null) {
        // Recursively filter nested objects
        info[key] = filterSensitiveData(info[key]);
      }
    }
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
  debug: '🔍'
};

/**
 * Format that stores the original level before colorization
 */
const preserveOriginalLevel = winston.format((info) => {
  info.originalLevel = info.level;
  return info;
})();

/**
 * Custom format for console output with emoji prefixes
 */
const consoleFormat = winston.format.printf(({ level, message, timestamp, originalLevel, ...meta }) => {
  // Use originalLevel for emoji lookup since 'level' may contain ANSI color codes
  const prefix = EMOJI_MAP[originalLevel] || '📝';
  const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';

  return `${prefix} [${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
});

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
      consoleFormat
    )
  })
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
        winston.format.json()
      )
    })
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
        winston.format.json()
      )
    })
  );
}

const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.errors({ stack: true }),
    winston.format.splat()
  ),
  transports
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

// Default export for convenience
export default {
  debug,
  info,
  warn,
  error,
  logger // Export winston logger instance for advanced usage
};
