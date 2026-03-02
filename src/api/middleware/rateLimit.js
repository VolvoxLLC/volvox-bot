/**
 * Rate Limiting Middleware
 * Simple in-memory per-IP rate limiter with no external dependencies
 */

const DEFAULT_MESSAGE = 'Too many requests, please try again later';

/**
 * Creates rate-limiting middleware that tracks requests per IP address.
 * Returns 429 JSON error when the limit is exceeded.
 *
 * @param {Object} [options] - Rate limiter configuration
 * @param {number} [options.windowMs=900000] - Time window in milliseconds (default: 15 minutes)
 * @param {number} [options.max=100] - Maximum requests per window per IP (default: 100)
 * @param {string} [options.message] - Custom error message for 429 responses
 * @returns {import('express').RequestHandler & { destroy: () => void }} Express middleware with a destroy method to clear the cleanup timer
 */
export function rateLimit({
  windowMs = 15 * 60 * 1000,
  max = 100,
  message = DEFAULT_MESSAGE,
} = {}) {
  const errorMessage = typeof message === 'string' && message.trim() ? message : DEFAULT_MESSAGE;

  /** @type {Map<string, { count: number, resetAt: number }>} */

  const clients = new Map();

  // Periodically clean up expired entries to prevent memory leaks
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of clients) {
      if (now >= entry.resetAt) {
        clients.delete(ip);
      }
    }
  }, windowMs);

  // Allow the timer to not prevent process exit
  cleanup.unref();

  const middleware = (req, res, next) => {
    const ip = req.ip;
    const now = Date.now();

    let entry = clients.get(ip);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      clients.set(ip, entry);
    }

    entry.count++;

    // Emit rate-limit headers on every response so clients can track their quota
    res.set('X-RateLimit-Limit', String(max));
    res.set('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)));
    res.set('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: errorMessage });
    }

    next();
  };

  middleware.destroy = () => clearInterval(cleanup);

  return middleware;
}
