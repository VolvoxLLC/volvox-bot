/**
 * webhook Action Handler
 * Fires an HTTP POST to a configured URL with a templated JSON payload.
 * Timeout: 5s, no retries.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/369
 */

import { info, warn } from '../../logger.js';
import { renderTemplate } from '../../utils/templateEngine.js';

/** Allowed URL protocols for webhook targets. */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Validate that a string is a well-formed HTTP(S) URL.
 *
 * @param {string} urlString
 * @returns {{ valid: boolean, url?: URL, reason?: string }}
 */
export function validateWebhookUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') {
    return { valid: false, reason: 'URL is empty or not a string' };
  }
  try {
    const url = new URL(urlString);
    if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
      return { valid: false, reason: `Protocol "${url.protocol}" is not allowed` };
    }
    return { valid: true, url };
  } catch {
    return { valid: false, reason: 'Invalid URL format' };
  }
}

/**
 * Fire an HTTP POST with a templated payload.
 *
 * @param {Object} action - { type: "webhook", url: string, payload: string }
 * @param {Object} context - Pipeline context
 */
export async function handleWebhook(action, context) {
  const { guild, member, templateContext } = context;
  const guildId = guild.id;
  const userId = member.user?.id;

  // Validate URL
  const { valid, reason } = validateWebhookUrl(action.url);
  if (!valid) {
    warn('webhook action has invalid URL — skipping', { guildId, userId, url: action.url, reason });
    return;
  }

  // Render payload template
  const rendered = renderTemplate(action.payload ?? '{}', templateContext);

  // Validate rendered payload is valid JSON
  try {
    JSON.parse(rendered);
  } catch {
    warn('webhook payload is not valid JSON after template rendering — sending as-is', {
      guildId,
      userId,
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(action.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: rendered,
      signal: controller.signal,
    });

    info('webhook fired', {
      guildId,
      userId,
      url: action.url,
      status: response.status,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      warn('webhook timed out (5s)', { guildId, userId, url: action.url });
    } else {
      warn('webhook request failed', {
        guildId,
        userId,
        url: action.url,
        error: err.message,
      });
    }
  } finally {
    clearTimeout(timeout);
  }
}
