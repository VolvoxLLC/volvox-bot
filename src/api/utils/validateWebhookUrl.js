/**
 * Webhook URL validation utility.
 * Prevents SSRF by rejecting URLs that target internal/private network addresses.
 */

import dns from 'node:dns';
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
 * @param {string} ip - IPv4 address in dotted-quad form (e.g. "192.0.2.1").
 * @returns {number|null} The 32-bit unsigned integer representation of the IPv4 address, or `null` if `ip` is not a valid IPv4 address.
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
 * Determine whether an IPv4 address is within a blocked or reserved range.
 * @param {string} ip - IPv4 address in dotted-quad form (e.g., "192.168.0.1"). Invalid or unparsable addresses return `false`.
 * @returns {boolean} `true` if the IPv4 address falls within a blocked range, `false` otherwise.
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
 * Return the embedded IPv4 address when the input is an IPv4-mapped IPv6 address.
 *
 * @param {string} ipv6 - IPv6 address (without surrounding brackets).
 * @returns {string|null} The IPv4 address in dotted-quad form if present, `null` otherwise.
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

/**
 * Sanitize a URL for safe logging by removing userinfo and query string.
 * Prevents credential/token leakage in logs.
 * @param {string} url - The URL to sanitize.
 * @returns {string} The sanitized URL (origin + pathname + hash), or '[invalid]' if parsing fails.
 */
function sanitizeUrlForLogging(url) {
  try {
    const parsed = new URL(url);
    // Reconstruct without userinfo and query string
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}${parsed.hash}`;
  } catch {
    return '[invalid]';
  }
}

/** Blocked hostnames (case-insensitive check performed by caller). */
const BLOCKED_HOSTNAMES = new Set(['localhost']);

/** IPv6 loopback representations to block (URL.hostname strips brackets). */
const BLOCKED_IPV6 = new Set(['::1', '0:0:0:0:0:0:0:1']);

/**
 * Cache of previously validated URLs.
 * Maps URL string -> boolean (true = valid, false = blocked).
 * Evicted entirely when size exceeds MAX_CACHE_SIZE to bound memory.
 * @type {Map<string, boolean>}
 */
const validationCache = new Map();
const MAX_CACHE_SIZE = 100;

/**
 * Determine whether a webhook URL is safe to use by rejecting private, reserved, or loopback targets and disallowed schemes.
 * @param {string} url - The URL to validate.
 * @returns {boolean} true if the URL is safe, false otherwise.
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
    warn('Webhook URL rejected by SSRF validation', { url: sanitizeUrlForLogging(url) });
  }

  if (validationCache.size >= MAX_CACHE_SIZE) {
    validationCache.clear();
  }
  validationCache.set(url, result);
  return result;
}

/**
 * Validate a webhook URL against internal/private address restrictions without using the cache.
 *
 * Performs URL parsing and enforces allowed schemes (HTTPS; HTTP only when NODE_ENV === 'development'),
 * then rejects URLs that target blocked hostnames (e.g., localhost), IPv6 loopback forms, IPv4 private/reserved
 * ranges, or IPv4-mapped IPv6 addresses that map to blocked IPv4s.
 *
 * @param {string} url - The webhook URL to validate.
 * @returns {boolean} `true` if the URL is allowed, `false` if it is invalid or targets a blocked address.
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

  const rawHostname = parsed.hostname.toLowerCase();

  // Node.js URL.hostname retains brackets for IPv6 (e.g. '[::1]').
  // Normalize by stripping them so all checks use the bare address.
  const hostname =
    rawHostname.startsWith('[') && rawHostname.endsWith(']')
      ? rawHostname.slice(1, -1)
      : rawHostname;

  // Blocked hostnames
  if (BLOCKED_HOSTNAMES.has(hostname)) return false;

  // IPv6 loopback
  if (BLOCKED_IPV6.has(hostname)) return false;

  // IPv4 private range check (hostname could be a raw IP)
  if (isBlockedIPv4(hostname)) return false;

  // IPv4-mapped IPv6
  const mappedIPv4 = extractMappedIPv4(hostname);
  if (mappedIPv4 && isBlockedIPv4(mappedIPv4)) return false;

  return true;
}

/**
 * Resolve a webhook URL's hostname via DNS and validate that all resolved addresses
 * are safe (not private/reserved/loopback). This closes the TOCTOU gap where a hostname
 * passes string-based validation but resolves to a blocked IP at fetch time (DNS rebinding).
 *
 * Should be called immediately before fetch to minimise the rebinding window.
 * For IP-literal hostnames, skips DNS resolution (already validated by the sync check).
 *
 * @param {string} url - The webhook URL to validate via DNS resolution.
 * @returns {Promise<boolean>} `true` if all resolved addresses are safe, `false` otherwise.
 */
export async function validateDnsResolution(url) {
  let hostname;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }

  // IP-literal hostnames don't need DNS resolution — already checked by sync validation
  if (isBlockedIPv4(hostname) || ipv4ToLong(hostname) !== null) return true;
  if (BLOCKED_IPV6.has(hostname)) return true;

  try {
    // Track whether at least one address family resolved successfully.
    // If both fail, we reject as a precaution (unresolvable host).
    let v4Failed = false;
    let v6Failed = false;

    const [ipv4s, ipv6s] = await Promise.all([
      dns.promises.resolve4(hostname).catch(() => {
        v4Failed = true;
        return [];
      }),
      dns.promises.resolve6(hostname).catch(() => {
        v6Failed = true;
        return [];
      }),
    ]);

    // If both families failed, the hostname is unresolvable — reject
    if (v4Failed && v6Failed) {
      return false;
    }

    for (const ip of ipv4s) {
      if (isBlockedIPv4(ip)) {
        warn('Webhook hostname resolved to blocked IPv4 (possible DNS rebinding)', {
          hostname,
          ip,
        });
        return false;
      }
    }

    for (const ip of ipv6s) {
      if (BLOCKED_IPV6.has(ip)) {
        warn('Webhook hostname resolved to blocked IPv6 (possible DNS rebinding)', {
          hostname,
          ip,
        });
        return false;
      }
      const mappedV4 = extractMappedIPv4(ip);
      if (mappedV4 && isBlockedIPv4(mappedV4)) {
        warn('Webhook hostname resolved to blocked IPv4-mapped IPv6 (possible DNS rebinding)', {
          hostname,
          ip,
        });
        return false;
      }
    }

    return true;
  } catch {
    // DNS resolution failed entirely — reject as a precaution
    return false;
  }
}

/**
 * Clear the in-memory cache of URL validation results.
 *
 * Resets the memoized results used by validateWebhookUrl; intended for use in tests.
 */
export function _resetValidationCache() {
  validationCache.clear();
}
