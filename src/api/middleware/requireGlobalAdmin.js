import { warn } from '../../logger.js';
import { getConfig } from '../../modules/config.js';
import { getBotOwnerIds } from '../../utils/permissions.js';

/**
 * Middleware: restrict to API-secret callers or bot-owner OAuth users.
 */
export function requireGlobalAdmin(forResource, req, res, next) {
  // Support both requireGlobalAdmin(req, res, next) and requireGlobalAdmin('Resource', req, res, next)
  if (arguments.length === 3) {
    // Called as requireGlobalAdmin(req, res, next)
    // Parameters are shifted: forResource=req, req=res, res=next, next=undefined
    next = res; // res parameter is actually the next function
    res = req; // req parameter is actually the res object
    req = forResource; // forResource is the actual req object
    forResource = 'Global admin access';
  } else {
    forResource = forResource || 'Global admin access';
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
