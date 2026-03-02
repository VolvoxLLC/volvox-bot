/**
 * Notification Webhook Routes
 *
 * Endpoints for managing outbound webhook notification endpoints per guild
 * and viewing the delivery log. Webhook secrets are write-only — they are
 * never returned in GET responses.
 */

import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { error as logError, info } from '../../logger.js';
import { getConfig, setConfigValue } from '../../modules/config.js';
import { getDeliveryLog, testEndpoint, WEBHOOK_EVENTS } from '../../modules/webhookNotifier.js';

const router = Router();

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
router.get('/:guildId/notifications/webhooks', async (req, res) => {
  const { guildId } = req.params;

  try {
    const cfg = getConfig(guildId);
    const webhooks = Array.isArray(cfg?.notifications?.webhooks)
      ? cfg.notifications.webhooks.map(maskEndpoint)
      : [];
    return res.json(webhooks);
  } catch (err) {
    logError('Failed to list webhook endpoints', { guildId, error: err.message });
    return res.status(500).json({ error: 'Failed to retrieve webhook endpoints' });
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
router.post('/:guildId/notifications/webhooks', async (req, res) => {
  const { guildId } = req.params;
  const { url, events, secret, enabled = true } = req.body || {};

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "url"' });
  }

  if (!/^https:\/\/.+/.test(url)) {
    return res.status(400).json({ error: '"url" must be a valid HTTPS URL' });
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
      enabled: Boolean(enabled),
      ...(secret ? { secret } : {}),
    };

    const updated = [...existing, newEndpoint];
    await setConfigValue('notifications.webhooks', updated, guildId);

    info('Webhook endpoint added', { guildId, endpointId: newEndpoint.id, url });
    return res.status(201).json(maskEndpoint(newEndpoint));
  } catch (err) {
    logError('Failed to add webhook endpoint', { guildId, error: err.message });
    return res.status(500).json({ error: 'Failed to add webhook endpoint' });
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
router.delete('/:guildId/notifications/webhooks/:endpointId', async (req, res) => {
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
    logError('Failed to remove webhook endpoint', { guildId, error: err.message });
    return res.status(500).json({ error: 'Failed to remove webhook endpoint' });
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
router.post('/:guildId/notifications/webhooks/:endpointId/test', async (req, res) => {
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
    logError('Failed to test webhook endpoint', { guildId, error: err.message });
    return res.status(500).json({ error: 'Failed to test webhook endpoint' });
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
router.get('/:guildId/notifications/deliveries', async (req, res) => {
  const { guildId } = req.params;
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);

  try {
    const log = await getDeliveryLog(guildId, limit);
    return res.json(log);
  } catch (err) {
    logError('Failed to fetch delivery log', { guildId, error: err.message });
    return res.status(500).json({ error: 'Failed to fetch delivery log' });
  }
});

export default router;
