import { warn } from '../../logger.js';
import { validateDnsResolution, validateWebhookUrl } from './validateWebhookUrl.js';

export const WEBHOOK_TIMEOUT_MS = 5_000;

/**
 * Fire-and-forget POST to a webhook URL read from the given environment variable.
 * Validates the URL for SSRF safety before sending.
 * Logs warnings on failure but never blocks the caller.
 *
 * @param {string} envVarName - Name of the env var holding the webhook URL
 * @param {Object} payload - JSON-serialisable body to POST
 */
export function fireAndForgetWebhook(envVarName, payload) {
  const url = process.env[envVarName];
  if (!url) return;

  if (!validateWebhookUrl(url)) return;

  // Strip query/fragment to avoid leaking tokens in logs
  const safeUrl = (() => {
    try {
      const u = new URL(url);
      return `${u.origin}${u.pathname}`;
    } catch {
      return '<invalid>';
    }
  })();

  // DNS resolution check to close TOCTOU rebinding gap (defense-in-depth)
  validateDnsResolution(url)
    .then((dnsOk) => {
      if (!dnsOk) {
        warn(`${envVarName} webhook blocked by DNS resolution check`, { url: safeUrl });
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
    })
    .catch(() => {
      // DNS validation itself failed — swallow to maintain fire-and-forget semantics
    });
}
