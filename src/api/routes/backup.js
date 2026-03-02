/**
 * Backup Routes
 * Endpoints for config export, import, backup creation, listing, restore, and deletion.
 *
 * All routes require global admin access (API secret or bot-owner OAuth).
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/129
 */

import { Router } from 'express';
import {
  createBackup,
  exportConfig,
  importConfig,
  listBackups,
  pruneBackups,
  readBackup,
  restoreBackup,
  validateImportPayload,
} from '../../modules/backup.js';
import { requireGlobalAdmin } from '../middleware/requireGlobalAdmin.js';

const router = Router();

/**
 * @openapi
 * /backups/export:
 *   get:
 *     tags:
 *       - Backup
 *     summary: Export current config as JSON
 *     description: >
 *       Download the current server configuration as a JSON file.
 *       Sensitive fields (API keys, tokens) are redacted.
 *       Restricted to API-secret callers or bot-owner OAuth users.
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     responses:
 *       "200":
 *         description: Config exported successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 config:
 *                   type: object
 *                 exportedAt:
 *                   type: string
 *                   format: date-time
 *                 version:
 *                   type: integer
 *       "401":
 *         $ref: "#/components/responses/Unauthorized"
 *       "403":
 *         $ref: "#/components/responses/Forbidden"
 */
router.get(
  '/export',
  (req, res, next) => requireGlobalAdmin('Backup access', req, res, next),
  (_req, res) => {
    const payload = exportConfig();
    const filename = `config-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(payload);
  },
);

/**
 * @openapi
 * /backups/import:
 *   post:
 *     tags:
 *       - Backup
 *     summary: Import config from a JSON payload
 *     description: >
 *       Apply configuration from a previously exported JSON payload.
 *       Redacted values (REDACTED placeholder) are skipped to preserve live secrets.
 *       Restricted to API-secret callers or bot-owner OAuth users.
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [config]
 *             properties:
 *               config:
 *                 type: object
 *               exportedAt:
 *                 type: string
 *               version:
 *                 type: integer
 *     responses:
 *       "200":
 *         description: Import completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 applied:
 *                   type: array
 *                   items:
 *                     type: string
 *                 skipped:
 *                   type: array
 *                   items:
 *                     type: string
 *                 failed:
 *                   type: array
 *                   items:
 *                     type: object
 *       "400":
 *         description: Invalid import payload
 *       "401":
 *         $ref: "#/components/responses/Unauthorized"
 *       "403":
 *         $ref: "#/components/responses/Forbidden"
 */
router.post(
  '/import',
  (req, res, next) => requireGlobalAdmin('Backup access', req, res, next),
  async (req, res) => {
    const payload = req.body;

    const validationErrors = validateImportPayload(payload);
    if (validationErrors.length > 0) {
      return res.status(400).json({ error: 'Invalid import payload', details: validationErrors });
    }

    try {
      const result = await importConfig(payload);
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: 'Import failed', details: err.message });
    }
  },
);

/**
 * @openapi
 * /backups:
 *   get:
 *     tags:
 *       - Backup
 *     summary: List available backups
 *     description: >
 *       Returns metadata for all stored config backups, sorted newest first.
 *       Restricted to API-secret callers or bot-owner OAuth users.
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     responses:
 *       "200":
 *         description: List of backups
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   filename:
 *                     type: string
 *                   createdAt:
 *                     type: string
 *                     format: date-time
 *                   size:
 *                     type: integer
 *       "401":
 *         $ref: "#/components/responses/Unauthorized"
 *       "403":
 *         $ref: "#/components/responses/Forbidden"
 */
router.get(
  '/',
  (req, res, next) => requireGlobalAdmin('Backup access', req, res, next),
  (_req, res) => {
    const backups = listBackups();
    res.json(backups);
  },
);

/**
 * @openapi
 * /backups:
 *   post:
 *     tags:
 *       - Backup
 *     summary: Create a manual backup
 *     description: >
 *       Triggers an immediate backup of the current config.
 *       Returns the backup metadata (id, size, createdAt).
 *       Restricted to API-secret callers or bot-owner OAuth users.
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     responses:
 *       "201":
 *         description: Backup created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 size:
 *                   type: integer
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *       "401":
 *         $ref: "#/components/responses/Unauthorized"
 *       "403":
 *         $ref: "#/components/responses/Forbidden"
 *       "500":
 *         $ref: "#/components/responses/ServerError"
 */
router.post(
  '/',
  (req, res, next) => requireGlobalAdmin('Backup access', req, res, next),
  (_req, res) => {
    try {
      const meta = createBackup();
      return res.status(201).json({ id: meta.id, size: meta.size, createdAt: meta.createdAt });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to create backup', details: err.message });
    }
  },
);

/**
 * @openapi
 * /backups/{id}/download:
 *   get:
 *     tags:
 *       - Backup
 *     summary: Download a specific backup file
 *     description: >
 *       Stream a backup JSON file for download by its ID.
 *       Restricted to API-secret callers or bot-owner OAuth users.
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Backup ID (filename without .json extension)
 *     responses:
 *       "200":
 *         description: Backup JSON file
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       "400":
 *         description: Invalid backup ID
 *       "404":
 *         description: Backup not found
 *       "401":
 *         $ref: "#/components/responses/Unauthorized"
 *       "403":
 *         $ref: "#/components/responses/Forbidden"
 */
router.get(
  '/:id/download',
  (req, res, next) => requireGlobalAdmin('Backup access', req, res, next),
  (req, res) => {
    const { id } = req.params;

    try {
      const payload = readBackup(id);
      const filename = `${id}.json`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'application/json');
      return res.json(payload);
    } catch (err) {
      const status = err.message.includes('not found')
        ? 404
        : err.message.includes('Invalid')
          ? 400
          : 500;
      return res.status(status).json({ error: err.message });
    }
  },
);

/**
 * @openapi
 * /backups/{id}/restore:
 *   post:
 *     tags:
 *       - Backup
 *     summary: Restore config from a backup
 *     description: >
 *       Restore the live configuration from a stored backup.
 *       Redacted sensitive values are skipped to preserve live secrets.
 *       Restricted to API-secret callers or bot-owner OAuth users.
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Backup ID to restore
 *     responses:
 *       "200":
 *         description: Restore completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 applied:
 *                   type: array
 *                   items:
 *                     type: string
 *                 skipped:
 *                   type: array
 *                   items:
 *                     type: string
 *                 failed:
 *                   type: array
 *                   items:
 *                     type: object
 *       "400":
 *         description: Invalid backup ID or backup format
 *       "404":
 *         description: Backup not found
 *       "401":
 *         $ref: "#/components/responses/Unauthorized"
 *       "403":
 *         $ref: "#/components/responses/Forbidden"
 *       "500":
 *         $ref: "#/components/responses/ServerError"
 */
router.post(
  '/:id/restore',
  (req, res, next) => requireGlobalAdmin('Backup access', req, res, next),
  async (req, res) => {
    const { id } = req.params;

    try {
      const result = await restoreBackup(id);
      return res.json(result);
    } catch (err) {
      const status = err.message.includes('not found')
        ? 404
        : err.message.includes('Invalid')
          ? 400
          : 500;
      return res.status(status).json({ error: err.message });
    }
  },
);

/**
 * @openapi
 * /backups/prune:
 *   post:
 *     tags:
 *       - Backup
 *     summary: Prune old backups
 *     description: >
 *       Delete backups that exceed the retention policy.
 *       Default: keep last 7 daily + 4 weekly backups.
 *       Restricted to API-secret callers or bot-owner OAuth users.
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               daily:
 *                 type: integer
 *                 description: Number of daily backups to keep
 *                 default: 7
 *               weekly:
 *                 type: integer
 *                 description: Number of weekly backups to keep
 *                 default: 4
 *     responses:
 *       "200":
 *         description: Pruning completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 deleted:
 *                   type: array
 *                   items:
 *                     type: string
 *                 count:
 *                   type: integer
 *       "401":
 *         $ref: "#/components/responses/Unauthorized"
 *       "403":
 *         $ref: "#/components/responses/Forbidden"
 */
router.post(
  '/prune',
  (req, res, next) => requireGlobalAdmin('Backup access', req, res, next),
  (req, res) => {
    const retention = req.body ?? {};
    const errors = [];

    if (retention.daily !== undefined) {
      if (!Number.isInteger(retention.daily) || retention.daily < 0) {
        errors.push('daily must be a non-negative integer');
      }
    }
    if (retention.weekly !== undefined) {
      if (!Number.isInteger(retention.weekly) || retention.weekly < 0) {
        errors.push('weekly must be a non-negative integer');
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: 'Invalid prune options', details: errors });
    }

    const deleted = pruneBackups(retention);
    return res.json({ deleted, count: deleted.length });
  },
);

export default router;
