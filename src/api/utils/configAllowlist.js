/**
 * Shared config key allowlists.
 * Used by config, guilds, and webhooks routes to restrict which sections
 * can be read or written via the API.
 */

export const SAFE_CONFIG_KEYS = ['ai', 'welcome', 'spam', 'moderation', 'triage'];

export const READABLE_CONFIG_KEYS = [...SAFE_CONFIG_KEYS, 'logging', 'memory', 'permissions'];
