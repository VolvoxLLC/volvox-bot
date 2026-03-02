/**
 * Webhook Notifier Module
 *
 * Delivers outbound webhook notifications to configured endpoints when
 * important bot events occur. Supports HMAC-SHA256 signing, per-guild
 * endpoint configuration, exponential backoff retry, and delivery logging.
 *
 * Event types:
 *   bot.disconnected    - Discord gateway disconnection
 *   bot.reconnected     - Successful reconnection
 *   bot.error           - Unhandled error
 *   moderation.action   - Warning/ban/kick issued
 *   health.degraded     - Memory >80% or event loop lag >100ms
 *   config.changed      - Config updated via dashboard
 *   member.flagged      - AI flagged a member's message
 */

import { createHmac } from 'node:crypto';
import { getPool } from '../db.js';
import { info, error as logError, warn } from '../logger.js';
import { getConfig } from './config.js';

/** @type {string[]} All supported event types */
export const WEBHOOK_EVENTS = [
  'bot.disconnected',
  'bot.reconnected',
  'bot.error',
  'moderation.action',
  'health.degraded',
  'config.changed',
  'member.flagged',
];

/** Retry delays in ms (3 attempts: 1s, 3s, 9s) */
const RETRY_DELAYS_MS = [1000, 3000, 9000];

/** Max delivery log entries per guild */
const MAX_LOG_ENTRIES = 100;

/** Fetch timeout per attempt (ms) */
const FETCH_TIMEOUT_MS = 10000;

/**
 * Sign a payload with HMAC-SHA256 using the endpoint secret.
 *
 * @param {string} secret - Shared secret for the endpoint
 * @param {string} body - Serialised JSON payload string
 * @returns {string} Hex digest prefixed with "sha256="
 */
export function signPayload(secret, body) {
  return `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;
}

/**
 * Perform a single HTTP delivery attempt.
 *
 * @param {string} url - Endpoint URL
 * @param {string} secret - HMAC secret (empty string = no signature header)
 * @param {string} body - Serialised JSON payload
 * @returns {Promise<{ok: boolean, status: number, text: string}>}
 */
async function attemptDelivery(url, secret, body) {
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'VolvoxBot-Webhooks/1.0',
  };

  if (secret) {
    headers['X-Signature-256'] = signPayload(secret, body);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });

    const text = await res.text().catch(() => '');
    return { ok: res.ok, status: res.status, text };
  } catch (err) {
    // Network error or timeout
    return { ok: false, status: 0, text: err.message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sleep for ms milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Deliver a webhook payload to a single endpoint with exponential backoff retry.
 * Records each attempt in the delivery log.
 *
 * @param {string} guildId - Guild that owns this endpoint
 * @param {Object} endpoint - Endpoint config from notifications.webhooks[]
 * @param {string} endpoint.id - Unique identifier for the endpoint
 * @param {string} endpoint.url - Delivery URL
 * @param {string} [endpoint.secret] - HMAC secret
 * @param {Object} payload - Event payload object
 * @returns {Promise<boolean>} True if any attempt succeeded
 */
export async function deliverToEndpoint(guildId, endpoint, payload) {
  const body = JSON.stringify(payload);
  const pool = getPool();

  for (let attempt = 1; attempt <= RETRY_DELAYS_MS.length + 1; attempt++) {
    const result = await attemptDelivery(endpoint.url, endpoint.secret || '', body);

    // Log this attempt
    if (pool) {
      try {
        await pool.query(
          `INSERT INTO webhook_delivery_log
             (guild_id, endpoint_id, event_type, payload, status, response_code, response_body, attempt)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            guildId,
            endpoint.id,
            payload.event,
            payload,
            result.ok ? 'success' : 'failed',
            result.status ?? null,
            result.text?.slice(0, 2000) || null,
            attempt,
          ],
        );

        // Prune old log entries for this guild (keep most recent MAX_LOG_ENTRIES)
        await pool.query(
          `DELETE FROM webhook_delivery_log
           WHERE guild_id = $1
             AND id NOT IN (
               SELECT id FROM webhook_delivery_log
               WHERE guild_id = $1
               ORDER BY delivered_at DESC
               LIMIT $2
             )`,
          [guildId, MAX_LOG_ENTRIES],
        );
      } catch (dbErr) {
        warn('Failed to log webhook delivery', { error: dbErr.message });
      }
    }

    if (result.ok) {
      info('Webhook delivered', {
        guildId,
        endpointId: endpoint.id,
        event: payload.event,
        attempt,
        status: result.status,
      });
      return true;
    }

    const isLastAttempt = attempt > RETRY_DELAYS_MS.length;
    if (isLastAttempt) {
      logError('Webhook delivery failed after all retries', {
        guildId,
        endpointId: endpoint.id,
        event: payload.event,
        status: result.status,
        body: result.text?.slice(0, 500),
      });
      return false;
    }

    const delay = RETRY_DELAYS_MS[attempt - 1];
    warn('Webhook delivery failed, retrying', {
      guildId,
      endpointId: endpoint.id,
      event: payload.event,
      attempt,
      nextRetryMs: delay,
      status: result.status,
    });
    await sleep(delay);
  }

  return false;
}

/**
 * Fire a webhook event to all configured endpoints for a guild that subscribe
 * to this event type. Deliveries run in parallel and are fire-and-forget
 * (errors don't propagate to callers).
 *
 * @param {string} eventType - One of the WEBHOOK_EVENTS constants
 * @param {string} guildId - Guild ID ('global' for bot-level events)
 * @param {Object} data - Event-specific data to include in payload
 * @returns {Promise<void>}
 */
export async function fireEvent(eventType, guildId, data = {}) {
  let endpoints;
  try {
    const cfg = getConfig(guildId);
    endpoints = cfg?.notifications?.webhooks;
  } catch {
    // Config not loaded for this guild — skip
    return;
  }

  if (!Array.isArray(endpoints) || endpoints.length === 0) return;

  // Filter to endpoints that subscribe to this event
  const targets = endpoints.filter(
    (ep) =>
      ep?.url &&
      ep.enabled !== false &&
      (Array.isArray(ep.events) ? ep.events.includes(eventType) : true),
  );

  if (targets.length === 0) return;

  const payload = {
    event: eventType,
    timestamp: new Date().toISOString(),
    guild_id: guildId,
    data,
  };

  // Fire-and-forget — parallel delivery, don't block caller
  Promise.all(targets.map((ep) => deliverToEndpoint(guildId, ep, payload))).catch((err) => {
    logError('Unexpected error in webhook delivery batch', { error: err.message });
  });
}

/**
 * Get the delivery log for a guild.
 *
 * @param {string} guildId - Guild ID
 * @param {number} [limit=100] - Max entries to return
 * @returns {Promise<Object[]>} Delivery log entries, newest first
 */
export async function getDeliveryLog(guildId, limit = 50) {
  const pool = getPool();
  if (!pool) return [];

  const { rows } = await pool.query(
    `SELECT id, endpoint_id, event_type, status, response_code, response_body, attempt, delivered_at
     FROM webhook_delivery_log
     WHERE guild_id = $1
     ORDER BY delivered_at DESC
     LIMIT $2`,
    [guildId, Math.min(limit, MAX_LOG_ENTRIES)],
  );

  return rows;
}

/**
 * Send a test event to a specific endpoint. Used by the dashboard.
 *
 * @param {string} guildId - Guild ID
 * @param {Object} endpoint - Endpoint config
 * @returns {Promise<{ok: boolean, status: number, text: string}>}
 */
export async function testEndpoint(guildId, endpoint) {
  const payload = {
    event: 'test',
    timestamp: new Date().toISOString(),
    guild_id: guildId,
    data: { message: 'This is a test webhook from VolvoxBot.' },
  };
  const body = JSON.stringify(payload);
  return attemptDelivery(endpoint.url, endpoint.secret || '', body);
}

/**
 * Fire a webhook event for all configured guilds that subscribe to this event.
 * Use this for bot-level events (disconnect, error) that aren't guild-specific.
 *
 * @param {string} eventType - One of the WEBHOOK_EVENTS constants
 * @param {Object} data - Event-specific data to include in payload
 * @param {string[]} [guildIds] - Guild IDs to fire for (defaults to all guilds with webhook configs)
 * @returns {Promise<void>}
 */
export async function fireEventAllGuilds(eventType, data = {}, guildIds) {
  let targets = guildIds;

  if (!targets) {
    // Import here to avoid circular dependency at module load time
    const { getAllGuildIds } = await import('./config.js');
    targets = getAllGuildIds ? getAllGuildIds() : [];
  }

  await Promise.all(targets.map((gid) => fireEvent(eventType, gid, data))).catch((err) => {
    logError('Unexpected error in fireEventAllGuilds', { error: err.message });
  });
}
