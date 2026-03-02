import { createHmac } from 'node:crypto';
import { warn } from '../../logger.js';

export const WEBHOOK_TIMEOUT_MS = 5_000;

/**
 * Fire-and-forget POST to a webhook URL read from the given environment variable.
 * These webhooks are internal addresses (calling the bot's own HTTP endpoint),
 * so only a basic URL format check is needed — no SSRF or DNS validation.
 * Logs warnings on failure but never blocks the caller.
 *
 * @param {string} envVarName - Name of the env var holding the webhook URL
 * @param {Object} payload - JSON-serialisable body to POST
 */
export function fireAndForgetWebhook(envVarName, payload) {
  const url = process.env[envVarName];
  if (!url) return;

  // Basic URL format check
  let safeUrl;
  try {
    const u = new URL(url);
    safeUrl = `${u.origin}${u.pathname}`;
  } catch {
    warn(`${envVarName} webhook has invalid URL`, { url: '<invalid>' });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  const body = JSON.stringify(payload);
  const headers = { 'Content-Type': 'application/json' };

  // Sign payload with HMAC-SHA256 using WEBHOOK_SECRET (preferred) or SESSION_SECRET (fallback).
  // WEBHOOK_SECRET is the dedicated signing key — keep it separate from the JWT session secret.
  const signingSecret = process.env.WEBHOOK_SECRET || process.env.SESSION_SECRET;
  if (signingSecret) {
    headers['X-Webhook-Signature'] = createHmac('sha256', signingSecret).update(body).digest('hex');
  }

  fetch(url, {
    method: 'POST',
    headers,
    body,
    signal: controller.signal,
  })
    .then((response) => {
      if (!response.ok) {
        warn(`${envVarName} webhook returned non-OK status`, {
          status: response.status,
          url: safeUrl,
        });
      }
    })
    .catch((err) => {
      warn(`${envVarName} webhook failed`, { error: err.message, url: safeUrl });
    })
    .finally(() => clearTimeout(timer));
}
