import { warn } from '../../logger.js';

export const WEBHOOK_TIMEOUT_MS = 5_000;

/**
 * Fire-and-forget POST to a webhook URL read from the given environment variable.
 * Logs warnings on failure but never blocks the caller.
 *
 * @param {string} envVarName - Name of the env var holding the webhook URL
 * @param {Object} payload - JSON-serialisable body to POST
 */
export function fireAndForgetWebhook(envVarName, payload) {
  const url = process.env[envVarName];
  if (!url) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: controller.signal,
  })
    .then((response) => {
      if (!response.ok) {
        warn(`${envVarName} webhook returned non-OK status`, { status: response.status, url });
      }
    })
    .catch((err) => {
      warn(`${envVarName} webhook failed`, { error: err.message, url });
    })
    .finally(() => clearTimeout(timer));
}
