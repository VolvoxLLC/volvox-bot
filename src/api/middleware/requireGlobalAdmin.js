import { getConfig } from '../../modules/config.js';
import { getBotOwnerIds } from '../../utils/permissions.js';
import { warn } from '../../logger.js';

/**
 * Middleware: restrict to API-secret callers or bot-owner OAuth users.
 */
export function requireGlobalAdmin(forResource, req, res, next) {
  console.error('[DEBUG] requireGlobalAdmin called');
  console.error('[DEBUG] arguments.length:', arguments.length);
  console.error('[DEBUG] typeof forResource:', typeof forResource);
  
  // Support both requireGlobalAdmin(req, res, next) and requireGlobalAdmin('Resource', req, res, next)
  if (arguments.length === 3) {
    console.error('[DEBUG] 3-arg case: shifting parameters');
    // Called as requireGlobalAdmin(req, res, next)
    // Parameters are shifted: forResource=req, req=res, res=next, next=undefined
    next = res;      // res parameter is actually the next function
    res = req;       // req parameter is actually the res object
    req = forResource; // forResource is the actual req object
    forResource = 'Global admin access';
  } else {
    forResource = forResource || 'Global admin access';
  }

  console.error('[DEBUG] After shift - authMethod:', req.authMethod, 'userId:', req.user?.userId);
  
  if (req.authMethod === 'api-secret') {
    console.error('[DEBUG] api-secret - calling next()');
    return next();
  }

  if (req.authMethod === 'oauth') {
    const config = getConfig();
    const botOwners = getBotOwnerIds(config);
    console.error('[DEBUG] oauth - botOwners:', botOwners, 'userId:', req.user?.userId);
    if (botOwners.includes(req.user?.userId)) {
      console.error('[DEBUG] oauth owner - calling next()');
      return next();
    }
    console.error('[DEBUG] oauth non-owner - returning 403');
    return res.status(403).json({ error: `${forResource} requires bot owner permissions` });
  }

  console.error('[DEBUG] unknown authMethod - returning 401');
  warn('Unknown authMethod in global admin check', {
    authMethod: req.authMethod,
    path: req.path,
  });
  return res.status(401).json({ error: 'Unauthorized' });
}
