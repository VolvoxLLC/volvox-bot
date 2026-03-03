import { warn } from '../../logger.js';
import { getConfig } from '../../modules/config.js';
import { getBotOwnerIds } from '../../utils/permissions.js';

/**
 * Middleware: restrict to API-secret callers or bot-owner OAuth users.
 */
export function requireGlobalAdmin(...args) {
  let forResource;
  let req;
  let res;
  let next;

  // Support both requireGlobalAdmin(req, res, next) and requireGlobalAdmin('Resource', req, res, next)
  if (args.length === 3) {
    // Called as requireGlobalAdmin(req, res, next)
    [req, res, next] = args;
    forResource = 'Global admin access';
  } else if (args.length === 4) {
    // Called as requireGlobalAdmin('Resource', req, res, next)
    [forResource, req, res, next] = args;
    forResource = forResource || 'Global admin access';
  } else {
    // Fallback
    forResource = 'Global admin access';
    req = args[0];
    res = args[1];
    next = args[2];
  }

  if (req.authMethod === 'api-secret') {
    return next();
  }

  if (req.authMethod === 'oauth') {
    const config = getConfig();
    const botOwners = getBotOwnerIds(config);
    if (botOwners.includes(req.user?.userId)) {
      return next();
    }
    return res.status(403).json({ error: `${forResource} requires bot owner permissions` });
  }

  warn('Unknown authMethod in global admin check', {
    authMethod: req.authMethod,
    path: req.path,
  });
  return res.status(401).json({ error: 'Unauthorized' });
}
