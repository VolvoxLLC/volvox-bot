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

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
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
