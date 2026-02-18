import { Router, type Router as RouterType } from 'express';
import { DiffService } from '../services/diff-service.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { validate, type ValidatedRequest } from '../middleware/validate.js';
import { 
  DiffParamsSchema, 
  DiffFileQuerySchema,
  type DiffParams,
  type DiffFileQuery 
} from '../schemas/diff-schemas.js';

const router: RouterType = Router();
const diffService = new DiffService();

// GET /api/diff/:taskId - Get diff summary for task
router.get(
  '/:taskId',
  validate({ params: DiffParamsSchema }),
  asyncHandler(async (req: ValidatedRequest<DiffParams>, res) => {
    const { taskId } = req.validated.params!;
    const summary = await diffService.getDiffSummary(taskId);
    res.json(summary);
  })
);

// GET /api/diff/:taskId/file - Get diff for specific file
router.get(
  '/:taskId/file',
  validate({ params: DiffParamsSchema, query: DiffFileQuerySchema }),
  asyncHandler(async (req: ValidatedRequest<DiffParams, DiffFileQuery>, res) => {
    const { taskId } = req.validated.params!;
    const { path } = req.validated.query!;
    const diff = await diffService.getFileDiff(taskId, path);
    res.json(diff);
  })
);

// GET /api/diff/:taskId/full - Get full diff for all files
router.get(
  '/:taskId/full',
  validate({ params: DiffParamsSchema }),
  asyncHandler(async (req: ValidatedRequest<DiffParams>, res) => {
    const { taskId } = req.validated.params!;
    const diffs = await diffService.getFullDiff(taskId);
    res.json(diffs);
  })
);

export { router as diffRoutes };
