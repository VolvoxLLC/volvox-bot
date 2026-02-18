/**
 * Retry Utility with Exponential Backoff
 *
 * Provides utilities for retrying operations with configurable
 * exponential backoff and integration with error classification.
 */

import { debug, error, warn } from '../logger.js';
import { classifyError, isRetryable } from './errors.js';

/**
 * Sleep for a specified duration
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff
 * @param {number} attempt - Current attempt number (0-indexed)
 * @param {number} baseDelay - Base delay in milliseconds
 * @param {number} maxDelay - Maximum delay in milliseconds
 * @returns {number} Delay in milliseconds
 */
function calculateBackoff(attempt, baseDelay, maxDelay) {
  // Exponential backoff: baseDelay * 2^attempt
  const delay = baseDelay * 2 ** attempt;

  // Cap at maxDelay
  return Math.min(delay, maxDelay);
}

/**
 * Retry an async operation with exponential backoff
 *
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry configuration options
 * @param {number} options.maxRetries - Maximum number of retry attempts (default: 3)
 * @param {number} options.baseDelay - Initial delay in milliseconds (default: 1000)
 * @param {number} options.maxDelay - Maximum delay in milliseconds (default: 30000)
 * @param {Function} options.shouldRetry - Custom function to determine if error is retryable
 * @param {Object} options.context - Optional context for logging
 * @returns {Promise<any>} Result of the function
 * @throws {Error} Throws the last error if all retries fail
 */
export async function withRetry(fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    shouldRetry = isRetryable,
    context = {},
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Execute the function
      return await fn();
    } catch (err) {
      lastError = err;

      // Check if we should retry
      const errorType = classifyError(err, context);
      const canRetry = shouldRetry(err, context);

      // Log the error
      if (attempt === 0) {
        warn(`Operation failed: ${err.message}`, {
          ...context,
          errorType,
          attempt: attempt + 1,
          maxRetries: maxRetries + 1,
        });
      }

      // If this was the last attempt or error is not retryable, throw
      if (attempt >= maxRetries || !canRetry) {
        if (!canRetry) {
          error('Operation failed with non-retryable error', {
            ...context,
            errorType,
            attempt: attempt + 1,
            error: err.message,
          });
        } else {
          error('Operation failed after all retries', {
            ...context,
            errorType,
            totalAttempts: attempt + 1,
            error: err.message,
          });
        }
        throw err;
      }

      // Calculate backoff delay
      const delay = calculateBackoff(attempt, baseDelay, maxDelay);

      debug(`Retrying in ${delay}ms`, {
        ...context,
        attempt: attempt + 1,
        maxRetries: maxRetries + 1,
        delay,
        errorType,
      });

      // Wait before retrying
      await sleep(delay);
    }
  }

  // Should never reach here, but just in case
  throw lastError;
}

/**
 * Create a retry wrapper with pre-configured options
 *
 * @param {Object} defaultOptions - Default retry options
 * @returns {Function} Configured retry function
 */
export function createRetryWrapper(defaultOptions = {}) {
  return (fn, options = {}) => {
    return withRetry(fn, { ...defaultOptions, ...options });
  };
}
