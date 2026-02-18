/**
 * API Version Middleware
 *
 * Responsibilities:
 *   1. Sets the `X-API-Version` response header so clients know which version served them.
 *   2. Validates the optional `X-API-Version` request header — if a client explicitly
 *      requests a version that doesn't exist, return 400 early.
 *
 * Supported versions: v1 (current and default).
 * When v2 is introduced, update SUPPORTED_VERSIONS and route accordingly.
 */
import type { Request, Response, NextFunction } from 'express';

export const CURRENT_API_VERSION = 'v1';
export const SUPPORTED_VERSIONS = ['v1'];

/**
 * Middleware that stamps every API response with X-API-Version
 * and rejects requests that explicitly ask for an unsupported version.
 */
export function apiVersionMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Always tell the client which version is serving the response
  res.setHeader('X-API-Version', CURRENT_API_VERSION);

  // If the client explicitly requests a version, validate it
  const requestedVersion = req.headers['x-api-version'] as string | undefined;

  if (requestedVersion && !SUPPORTED_VERSIONS.includes(requestedVersion)) {
    res.status(400).json({
      error: 'Unsupported API version',
      requested: requestedVersion,
      supported: SUPPORTED_VERSIONS,
      current: CURRENT_API_VERSION,
    });
    return;
  }

  next();
}
