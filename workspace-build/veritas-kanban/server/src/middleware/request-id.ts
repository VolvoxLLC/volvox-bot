import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * Request ID Middleware
 *
 * Assigns a unique identifier to every incoming request for tracing and
 * debugging. If the client sends an `X-Request-ID` header (e.g. from a
 * gateway or another service in a distributed system), that value is
 * preserved. Otherwise a new UUIDv4 is generated.
 *
 * The request ID is:
 *  - Stored in `res.locals.requestId` for downstream middleware / routes
 *  - Echoed back to the client via the `X-Request-ID` response header
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  // Accept only a single string value; ignore arrays
  const requestId = (typeof incoming === 'string' && incoming.length > 0)
    ? incoming
    : randomUUID();

  // Make available to all downstream handlers
  res.locals.requestId = requestId;

  // Echo back so clients can correlate responses
  res.setHeader('X-Request-ID', requestId);

  next();
}
