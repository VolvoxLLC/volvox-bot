/**
 * Guild ID adapter middleware helpers.
 * Bridges the gap between routes that receive a guild ID via a query param,
 * request body, or path param and the `requireGuildModerator` middleware that
 * expects the guild ID in `req.params.id`.
 */

/**
 * Copies `req.query.guildId` to `req.params.id` so that downstream middleware
 * (e.g. `requireGuildModerator`) can locate the guild ID in a consistent place.
 *
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} _res - Express response object (unused).
 * @param {import('express').NextFunction} next - Next middleware callback.
 */
export function adaptGuildIdFromQuery(req, _res, next) {
  if (req.query.guildId) {
    req.params.id = req.query.guildId;
  }
  next();
}

/**
 * Copies `req.body.guildId` to `req.params.id` so that downstream middleware
 * (e.g. `requireGuildModerator`) can locate the guild ID in a consistent place.
 * Used for POST routes where the guild ID arrives in the request body.
 *
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} _res - Express response object (unused).
 * @param {import('express').NextFunction} next - Next middleware callback.
 */
export function adaptGuildIdFromBody(req, _res, next) {
  if (req.body?.guildId) {
    req.params.id = req.body.guildId;
  }
  next();
}

/**
 * Adapter for DELETE routes that carry both a resource id (`:id`) and a
 * `?guildId=` query param.  Saves the resource id into `req.params.tempRoleId`
 * and moves the guild ID to `req.params.id` so that `requireGuildModerator`
 * works correctly.
 *
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} _res - Express response object (unused).
 * @param {import('express').NextFunction} next - Next middleware callback.
 */
export function adaptDeleteGuildIdParam(req, _res, next) {
  if (req.query.guildId) {
    req.params.tempRoleId = req.params.id;
    req.params.id = req.query.guildId;
  }
  next();
}
