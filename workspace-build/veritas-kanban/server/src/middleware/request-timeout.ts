import { Request, Response, NextFunction } from 'express';

/**
 * Request Timeout Middleware
 *
 * Enforces a maximum duration for each request. If the handler hasn't
 * finished within the allotted time, the client receives a 408 response
 * and the underlying socket is destroyed to free resources.
 *
 * Upload/attachment routes automatically receive a longer timeout (120 s)
 * since file transfers are expected to take more time.
 *
 * Skipped for:
 *  - WebSocket upgrade requests (long-lived by design)
 *  - Responses that have already begun streaming (headersSent === true)
 *
 * Usage:
 *   app.use(requestTimeout());          // 30 s default
 *   app.use(requestTimeout(60_000));    // custom 60 s
 */

const DEFAULT_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 120_000;

/** Matches attachment/upload routes: /tasks/:id/attachments */
const UPLOAD_PATH_RE = /\/tasks\/[^/]+\/attachments/;

export function requestTimeout(ms: number = DEFAULT_TIMEOUT_MS) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip WebSocket upgrade requests — they are long-lived by design
    if (req.headers.upgrade && req.headers.upgrade.toLowerCase() === 'websocket') {
      next();
      return;
    }

    // Use longer timeout for upload/attachment routes
    const url = req.originalUrl || req.url || req.path;
    const effectiveMs = UPLOAD_PATH_RE.test(url) ? UPLOAD_TIMEOUT_MS : ms;

    const timeoutId = setTimeout(() => {
      // Don't send a response if headers were already sent (SSE / streaming)
      if (res.headersSent) {
        return;
      }

      const seconds = Math.round(effectiveMs / 1000);

      res.status(408).json({
        error: 'Request Timeout',
        message: `Request exceeded the ${seconds}s timeout`,
        code: 'REQUEST_TIMEOUT',
      });

      // Tear down the underlying socket to release resources
      req.destroy();
    }, effectiveMs);

    // Clear the timeout when the response finishes normally
    const cleanup = () => clearTimeout(timeoutId);
    res.on('finish', cleanup);
    res.on('close', cleanup);

    next();
  };
}
