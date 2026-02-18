import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wrap async route handlers to catch errors and pass to error middleware.
 * Supports generic request types for use with ValidatedRequest.
 */
export const asyncHandler = <TReq extends Request = Request>(
  fn: (req: TReq, res: Response, next: NextFunction) => Promise<any>
): RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req as TReq, res, next)).catch(next);
