/**
 * Trusted internal requests originate from the dashboard/web server and
 * authenticate with the shared bot API secret. These requests should not
 * consume the public per-IP rate-limit budget because they are proxied
 * server-to-server and would otherwise all collapse to localhost in dev.
 *
 * @param {import('express').Request} req
 * @returns {boolean}
 */
export function isTrustedInternalRequest(req) {
  const expectedSecret = process.env.BOT_API_SECRET;
  const providedSecret =
    typeof req.get === 'function' ? req.get('x-api-secret') : req.headers?.['x-api-secret'];

  return (
    typeof expectedSecret === 'string' &&
    expectedSecret.length > 0 &&
    typeof providedSecret === 'string' &&
    providedSecret === expectedSecret
  );
}
