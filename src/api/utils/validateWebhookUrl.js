/**
 * Webhook URL validation utility.
 * Prevents SSRF by rejecting URLs that target internal/private network addresses.
 */

import { warn } from '../../logger.js';

/**
 * Private/reserved IPv4 ranges that must be blocked.
 * Each entry: [startLong, endLong]
 */
const BLOCKED_IPV4_RANGES = [
  // 127.0.0.0/8 (loopback)
  [2130706432, 2147483647], // 127.0.0.0 – 127.255.255.255
  // 10.0.0.0/8
  [167772160, 184549375], // 10.0.0.0 – 10.255.255.255
  // 172.16.0.0/12
  [2886729728, 2887778303], // 172.16.0.0 – 172.31.255.255
  // 192.168.0.0/16
  [3232235520, 3232301055], // 192.168.0.0 – 192.168.255.255
  // 169.254.0.0/16 (link-local)
  [2851995648, 2852061183], // 169.254.0.0 – 169.254.255.255
  // 0.0.0.0/8
  [0, 16777215], // 0.0.0.0 – 0.255.255.255
];

/**
 * Convert a dotted-quad IPv4 string to a 32-bit unsigned integer.
 * Returns null if the string is not a valid IPv4 address.
 *
 * @param {string} ip
 * @returns {number|null}
 */
function ipv4ToLong(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;

  let result = 0;
  for (const part of parts) {
    const num = Number(part);
    if (!Number.isInteger(num) || num < 0 || num > 255) return null;
    result = (result << 8) + num;
  }
  return result >>> 0; // unsigned
}

/**
 * Check whether an IPv4 address string falls within any blocked range.
 *
 * @param {string} ip - Dotted-quad IPv4 address
 * @returns {boolean}
 */
function isBlockedIPv4(ip) {
  const long = ipv4ToLong(ip);
  if (long === null) return false;

  for (const [start, end] of BLOCKED_IPV4_RANGES) {
    if (long >= start && long <= end) return true;
  }
  return false;
}

/**
 * Extract the embedded IPv4 address from an IPv4-mapped IPv6 address.
 * Handles both dotted-quad form (::ffff:127.0.0.1) and hex form (::ffff:7f00:1).
 * Returns null if the address is not an IPv4-mapped IPv6 address.
 *
 * @param {string} ipv6 - IPv6 address (without brackets)
 * @returns {string|null} Dotted-quad IPv4 or null
 */
function extractMappedIPv4(ipv6) {
  const lower = ipv6.toLowerCase();
  const prefix = '::ffff:';
  if (!lower.startsWith(prefix)) return null;

  const suffix = ipv6.slice(prefix.length);

  // Dotted-quad form: ::ffff:127.0.0.1
  if (suffix.includes('.')) {
    return suffix;
  }

  // Hex form: ::ffff:7f00:1 → two 16-bit groups
  const hexParts = suffix.split(':');
  if (hexParts.length !== 2) return null;

  const hi = Number.parseInt(hexParts[0], 16);
  const lo = Number.parseInt(hexParts[1], 16);
  if (Number.isNaN(hi) || Number.isNaN(lo) || hi > 0xffff || lo > 0xffff) return null;

  return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
}

/** Blocked hostnames (case-insensitive check performed by caller). */
const BLOCKED_HOSTNAMES = new Set(['localhost']);

/** IPv6 loopback representations to block. */
const BLOCKED_IPV6 = new Set(['::1', '[::1]', '0:0:0:0:0:0:0:1']);

/**
 * Cache of previously validated URLs.
 * Maps URL string -> boolean (true = valid, false = blocked).
 * Evicted entirely when size exceeds MAX_CACHE_SIZE to bound memory.
 * @type {Map<string, boolean>}
 */
const validationCache = new Map();
const MAX_CACHE_SIZE = 100;

/**
 * Validate a webhook URL for SSRF safety.
 *
 * - Scheme must be https:// (or http:// when NODE_ENV === 'development')
 * - Hostname must not resolve to a private/reserved IP range
 * - Hostname must not be localhost, 127.0.0.1, [::1], etc.
 *
 * Results are cached per URL string.
 *
 * @param {string} url - The URL to validate
 * @returns {boolean} true if the URL is safe, false otherwise
 */
export function validateWebhookUrl(url) {
  if (!url || typeof url !== 'string') return false;

  const cached = validationCache.get(url);
  if (cached !== undefined) return cached;

  let result = false;
  try {
    result = _validateUrlUncached(url);
  } catch {
    result = false;
  }

  if (!result) {
    warn('Webhook URL rejected by SSRF validation', { url });
  }

  if (validationCache.size >= MAX_CACHE_SIZE) {
    validationCache.clear();
  }
  validationCache.set(url, result);
  return result;
}

/**
 * Internal uncached validation.
 * @param {string} url
 * @returns {boolean}
 */
function _validateUrlUncached(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  // Scheme check
  const isDev = process.env.NODE_ENV === 'development';
  if (parsed.protocol === 'http:' && !isDev) return false;
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;

  const hostname = parsed.hostname.toLowerCase();

  // Blocked hostnames
  if (BLOCKED_HOSTNAMES.has(hostname)) return false;

  // IPv6 loopback
  if (BLOCKED_IPV6.has(hostname)) return false;

  // IPv4 private range check (hostname could be a raw IP)
  if (isBlockedIPv4(hostname)) return false;

  // Bracketed IPv6 — strip brackets and re-check
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    const inner = hostname.slice(1, -1);
    if (BLOCKED_IPV6.has(inner)) return false;

    // IPv4-mapped IPv6: e.g. [::ffff:127.0.0.1] or [::ffff:7f00:1]
    const mappedIPv4 = extractMappedIPv4(inner);
    if (mappedIPv4 && isBlockedIPv4(mappedIPv4)) return false;
  }

  // Unbracketed IPv4-mapped IPv6 (some parsers may strip brackets)
  const mappedIPv4 = extractMappedIPv4(hostname);
  if (mappedIPv4 && isBlockedIPv4(mappedIPv4)) return false;

  return true;
}

/**
 * Clear the validation cache. Exposed for testing.
 */
export function _resetValidationCache() {
  validationCache.clear();
}
