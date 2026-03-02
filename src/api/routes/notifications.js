/**
 * Notification Webhook Routes
 *
 * Endpoints for managing outbound webhook notification endpoints per guild
 * and viewing the delivery log. Webhook secrets are write-only — they are
 * never returned in GET responses.
 */

import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { info } from '../../logger.js';
import { getConfig, setConfigValue } from '../../modules/config.js';
import { getDeliveryLog, testEndpoint, WEBHOOK_EVENTS } from '../../modules/webhookNotifier.js';
import { validateUrlForSsrfSync } from '../utils/ssrfProtection.js';

const router = Router();

/**
 * Redact a URL for safe logging by replacing any query string or credentials.
 * @param {string} url - URL to redact
 * @returns {string} URL with query string replaced by [REDACTED]
 */
function redactUrl(url) {
  try {
    const parsed = new URL(url);
    // Redact query string (may contain secrets)
    parsed.search = '?[REDACTED]';
    // Redact password in userinfo if present
    if (parsed.password) {
      parsed.password = '[REDACTED]';
    }
    return parsed.toString();
  } catch {
    // If URL parsing fails, return a safe placeholder
    return '[INVALID URL]';
  }
}

/**
 * Mask the secret field from an endpoint object for safe GET responses.
 *
 * @param {Object} ep - Endpoint config
 * @returns {Object} Endpoint with secret replaced by a mask indicator
 */
function maskEndpoint(ep) {
  const { secret: _secret, ...rest } = ep;
  return { ...rest, hasSecret: Boolean(_secret) };
}

/**
 * @openapi
 * /guilds/{id}/notifications/webhooks:
 *   get:
 *     tags:
 *       - Notifications
 *     summary: List webhook endpoints for a guild
 *     description: Returns all configured outbound webhook endpoints. Secrets are never included.
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Guild ID
 *     responses:
 *       "200":
 *         description: List of webhook endpoints (secrets masked)
 *       "401":
 *         $ref: "#/components/responses/Unauthorized"
 */
router.get('/:guildId/notifications/webhooks', async (req, res, next) => {
  const { guildId } = req.params;

  try {
    const cfg = getConfig(guildId);
    const webhooks = Array.isArray(cfg?.notifications?.webhooks)
      ? cfg.notifications.webhooks.map(maskEndpoint)
      : [];
    return res.json(webhooks);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /guilds/{id}/notifications/webhooks:
 *   post:
 *     tags:
 *       - Notifications
 *     summary: Add a webhook endpoint
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - url
 *               - events
 *             properties:
 *               url:
 *                 type: string
 *                 description: HTTPS delivery URL
 *               events:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Event types to subscribe to
 *               secret:
 *                 type: string
 *                 description: Optional HMAC signing secret
 *               enabled:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       "201":
 *         description: Created endpoint (secret masked)
 *       "400":
 *         $ref: "#/components/responses/BadRequest"
 *       "401":
 *         $ref: "#/components/responses/Unauthorized"
 */
router.post('/:guildId/notifications/webhooks', async (req, res, next) => {
  const { guildId } = req.params;
  const { url, events, secret, enabled = true } = req.body || {};

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "url"' });
  }

  if (!/^https:\/\/.+/.test(url)) {
    return res.status(400).json({ error: '"url" must be a valid HTTPS URL' });
  }

  // Validate URL against SSRF
  try {
    validateUrlForSsrfSync(url);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  if (!Array.isArray(events) || events.length === 0) {
    return res.status(400).json({ error: '"events" must be a non-empty array' });
  }

  const invalidEvents = events.filter((e) => !WEBHOOK_EVENTS.includes(e));
  if (invalidEvents.length > 0) {
    return res.status(400).json({
      error: `Invalid event types: ${invalidEvents.join(', ')}`,
      validEvents: WEBHOOK_EVENTS,
    });
  }

  // Validate secret type before persisting
  if (secret !== undefined && typeof secret !== 'string') {
    return res.status(400).json({ error: '"secret" must be a string' });
  }

  // Validate enabled type before persisting
  if (enabled !== undefined && typeof enabled !== 'boolean') {
    return res.status(400).json({ error: '"enabled" must be a boolean' });
  }

  try {
    const cfg = getConfig(guildId);
    const existing = Array.isArray(cfg?.notifications?.webhooks) ? cfg.notifications.webhooks : [];

    if (existing.length >= 20) {
      return res.status(400).json({ error: 'Maximum of 20 webhook endpoints per guild' });
    }

    const newEndpoint = {
      id: randomUUID(),
      url,
      events,
      enabled: typeof enabled === 'boolean' ? enabled : true,
      ...(secret && typeof secret === 'string' ? { secret } : {}),
    };

    const updated = [...existing, newEndpoint];
    await setConfigValue('notifications.webhooks', updated, guildId);

    // Use redacted URL for logging to avoid leaking secrets in query params
    info('Webhook endpoint added', {
      guildId,
      endpointId: newEndpoint.id,
      url: redactUrl(url),
    });
    return res.status(201).json(maskEndpoint(newEndpoint));
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /guilds/{id}/notifications/webhooks/{endpointId}:
 *   delete:
 *     tags:
 *       - Notifications
 *     summary: Remove a webhook endpoint
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: endpointId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       "204":
 *         description: Endpoint removed
 *       "404":
 *         $ref: "#/components/responses/NotFound"
 *       "401":
 *         $ref: "#/components/responses/Unauthorized"
 */
router.delete('/:guildId/notifications/webhooks/:endpointId', async (req, res, next) => {
  const { guildId, endpointId } = req.params;

  try {
    const cfg = getConfig(guildId);
    const existing = Array.isArray(cfg?.notifications?.webhooks) ? cfg.notifications.webhooks : [];

    const updated = existing.filter((ep) => ep.id !== endpointId);
    if (updated.length === existing.length) {
      return res.status(404).json({ error: 'Webhook endpoint not found' });
    }

    await setConfigValue('notifications.webhooks', updated, guildId);
    info('Webhook endpoint removed', { guildId, endpointId });
    return res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /guilds/{id}/notifications/webhooks/{endpointId}/test:
 *   post:
 *     tags:
 *       - Notifications
 *     summary: Send a test event to a webhook endpoint
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: endpointId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       "200":
 *         description: Test result with status code and response body
 *       "404":
 *         $ref: "#/components/responses/NotFound"
 *       "401":
 *         $ref: "#/components/responses/Unauthorized"
 */
router.post('/:guildId/notifications/webhooks/:endpointId/test', async (req, res, next) => {
  const { guildId, endpointId } = req.params;

  try {
    const cfg = getConfig(guildId);
    const existing = Array.isArray(cfg?.notifications?.webhooks) ? cfg.notifications.webhooks : [];
    const endpoint = existing.find((ep) => ep.id === endpointId);

    if (!endpoint) {
      return res.status(404).json({ error: 'Webhook endpoint not found' });
    }

    const result = await testEndpoint(guildId, endpoint);
    return res.json({
      ok: result.ok,
      status: result.status,
      body: result.text?.slice(0, 500),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /guilds/{id}/notifications/deliveries:
 *   get:
 *     tags:
 *       - Notifications
 *     summary: Get webhook delivery log for a guild
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 100
 *         description: Max entries to return
 *     responses:
 *       "200":
 *         description: Delivery log entries, newest first
 *       "401":
 *         $ref: "#/components/responses/Unauthorized"
 */
router.get('/:guildId/notifications/deliveries', async (req, res, next) => {
  const { guildId } = req.params;

  // Clamp limit to positive range (1-100) to prevent DB errors from negative values
  const rawLimit = parseInt(req.query.limit, 10) || 50;
  const limit = Math.max(1, Math.min(rawLimit, 100));

  try {
    const log = await getDeliveryLog(guildId, limit);
    return res.json(log);
  } catch (err) {
    next(err);
  }
});

export default router;
