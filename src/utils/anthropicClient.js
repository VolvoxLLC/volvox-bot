/**
 * Shared Anthropic client factory.
 *
 * Resolves authentication from environment variables in priority order:
 * 1. ANTHROPIC_API_KEY → SDK apiKey (standard API key auth)
 * 2. CLAUDE_CODE_OAUTH_TOKEN → SDK authToken (Bearer token auth)
 *
 * All modules that need an Anthropic client should import from here
 * instead of constructing their own `new Anthropic()`.
 */

import Anthropic from '@anthropic-ai/sdk';

/** @type {Anthropic | null} */
let client = null;

/**
 * Build SDK constructor options from available environment variables.
 * @returns {{ apiKey?: string, authToken?: string }}
 */
function resolveAuthOptions() {
  if (process.env.ANTHROPIC_API_KEY) {
    return { apiKey: process.env.ANTHROPIC_API_KEY };
  }
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    return { authToken: process.env.CLAUDE_CODE_OAUTH_TOKEN };
  }
  return {};
}

/**
 * Get a shared Anthropic client instance.
 * @returns {Anthropic}
 */
export function getAnthropicClient() {
  if (!client) {
    client = new Anthropic(resolveAuthOptions());
  }
  return client;
}

/**
 * Replace the singleton client (for testing).
 * @param {Anthropic | null} newClient
 */
export function _setAnthropicClient(newClient) {
  client = newClient;
}
