/**
 * Changes Routes
 * Efficient agent polling endpoint for incremental change detection.
 */

import { Router } from 'express';
import { getChangesService } from '../services/changes-service.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { validate } from '../middleware/validate.js';
import { changesQuerySchema } from '../schemas/changes-schemas.js';
import { createHash } from 'crypto';
import { createLogger } from '../lib/logger.js';

const log = createLogger('changes-routes');
const router = Router();
const changesService = getChangesService();

/**
 * GET /api/changes
 * Returns all changes (tasks, comments, activity, broadcasts) since a given timestamp.
 *
 * Query params:
 *   - since (required): ISO 8601 timestamp
 *   - full (optional): boolean — return full objects vs summaries (default: true)
 *   - types (optional): comma-separated list of change types to include
 *                       (default: tasks,comments,activity,broadcasts)
 *
 * ETag support:
 *   - Generates ETag from response hash
 *   - Returns 304 Not Modified if If-None-Match matches
 */
router.get(
  '/',
  validate({ query: changesQuerySchema }),
  asyncHandler(async (req, res) => {
    const {
      since,
      full = true,
      types,
    } = req.query as unknown as {
      since: string;
      full?: boolean;
      types?: string;
    };

    // Get changes from service
    const changes = await changesService.getChangesSince({ since, full, types });

    // Generate ETag from response hash
    const responseJson = JSON.stringify(changes);
    const etag = `W/"${createHash('sha256').update(responseJson).digest('hex').slice(0, 16)}"`;

    // Check If-None-Match header
    const clientEtag = req.headers['if-none-match'];
    if (clientEtag && clientEtag === etag) {
      log.debug({ since, etag }, 'Changes poll: 304 Not Modified');
      return res.status(304).end();
    }

    // Set ETag and return response
    res.setHeader('ETag', etag);

    // Log polling activity
    log.info(
      {
        since,
        until: changes.until,
        totalChanges: changes.summary.totalChanges,
        breakdown: changes.summary.breakdown,
        etag,
      },
      'Changes polled'
    );

    res.json(changes);
  })
);

export { router as changesRoutes };
