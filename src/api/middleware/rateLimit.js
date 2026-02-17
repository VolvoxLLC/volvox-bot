/**
 * Rate Limiting Middleware
 * Simple in-memory per-IP rate limiter with no external dependencies
 */

/**
 * Creates rate-limiting middleware that tracks requests per IP address.
 * Returns 429 JSON error when the limit is exceeded.
 *
 * @param {Object} [options] - Rate limiter configuration
 * @param {number} [options.windowMs=900000] - Time window in milliseconds (default: 15 minutes)
 * @param {number} [options.max=100] - Maximum requests per window per IP (default: 100)
 * @returns {import('express').RequestHandler} Express middleware function
 */
export function rateLimit({ windowMs = 15 * 60 * 1000, max = 100 } = {}) {
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

  return (req, res, next) => {
    const ip = req.ip;
    const now = Date.now();

    let entry = clients.get(ip);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      clients.set(ip, entry);
    }

    entry.count++;

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Too many requests, please try again later' });
    }

    next();
  };
}
