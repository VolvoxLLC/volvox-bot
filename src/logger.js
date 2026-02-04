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
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, '..', 'config.json');

// Load config to get log level
let logLevel = 'info';
try {
  if (existsSync(configPath)) {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    logLevel = process.env.LOG_LEVEL || config.logging?.level || 'info';
  }
} catch (err) {
  // Fallback to default if config can't be loaded
  logLevel = process.env.LOG_LEVEL || 'info';
}

/**
 * Custom format for console output with emoji prefixes
 */
const consoleFormat = winston.format.printf(({ level, message, timestamp, ...meta }) => {
  const emoji = {
    error: '❌',
    warn: '⚠️',
    info: '✅',
    debug: '🔍'
  };

  const prefix = emoji[level] || '📝';
  const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';

  return `${prefix} [${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
});

/**
 * Create winston logger instance
 */
const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        consoleFormat
      )
    })
  ]
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
