/**
 * SSRF Protection Utilities
 *
 * Validates URLs to prevent Server-Side Request Forgery attacks by blocking
 * requests to internal/private network addresses.
 */

/**
 * Check if a hostname resolves to a blocked IP address.
 * This handles DNS rebinding attacks by checking the resolved IP.
 *
 * @param {string} hostname - The hostname to check
 * @returns {Promise<string|null>} The blocked IP if found, null if safe
 */
async function resolveAndCheckIp(hostname) {
  // Only perform DNS resolution in Node.js runtime
  if (typeof process === 'undefined') return null;

  const dns = await import('node:dns').catch(() => null);
  if (!dns) return null;

  return new Promise((resolve) => {
    dns.lookup(hostname, { all: true }, (err, addresses) => {
      if (err || !addresses) {
        resolve(null);
        return;
      }

      for (const addr of addresses) {
        if (isBlockedIp(addr.address)) {
          resolve(addr.address);
          return;
        }
      }
      resolve(null);
    });
  });
}

/**
 * Check if an IP address is in a blocked range.
 * Blocks:
 * - Loopback (127.0.0.0/8)
 * - Link-local (169.254.0.0/16) - includes AWS metadata at 169.254.169.254
 * - Private ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
 * - Localhost IPv6 (::1)
 * - IPv6 link-local (fe80::/10)
 *
 * @param {string} ip - The IP address to check
 * @returns {boolean} True if the IP is blocked
 */
export function isBlockedIp(ip) {
  // Normalize IPv6 addresses
  const normalizedIp = ip.toLowerCase().trim();

  // IPv6 loopback
  if (normalizedIp === '::1' || normalizedIp === '0:0:0:0:0:0:0:1') {
    return true;
  }

  // IPv6 link-local (fe80::/10)
  if (normalizedIp.startsWith('fe80:')) {
    return true;
  }

  // IPv4-mapped IPv6 addresses (::ffff:192.168.1.1)
  const ipv4MappedMatch = normalizedIp.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (ipv4MappedMatch) {
    return isBlockedIp(ipv4MappedMatch[1]);
  }

  // IPv4 checks
  const parts = normalizedIp.split('.');
  if (parts.length !== 4) {
    // Not a valid IPv4, let it pass (will fail elsewhere)
    return false;
  }

  const octets = parts.map((p) => {
    const num = parseInt(p, 10);
    return Number.isNaN(num) ? -1 : num;
  });

  // Invalid octets
  if (octets.some((o) => o < 0 || o > 255)) {
    return false;
  }

  const [first, second] = octets;

  // Loopback: 127.0.0.0/8
  if (first === 127) {
    return true;
  }

  // Link-local: 169.254.0.0/16 (includes AWS metadata endpoint)
  if (first === 169 && second === 254) {
    return true;
  }

  // Private: 10.0.0.0/8
  if (first === 10) {
    return true;
  }

  // Private: 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
  if (first === 172 && second >= 16 && second <= 31) {
    return true;
  }

  // Private: 192.168.0.0/16
  if (first === 192 && second === 168) {
    return true;
  }

  // 0.0.0.0/8 - "this network"
  if (first === 0) {
    return true;
  }

  return false;
}

/**
 * Check if a hostname is a blocked literal (like "localhost")
 *
 * @param {string} hostname - The hostname to check
 * @returns {boolean} True if the hostname is blocked
 */
function isBlockedHostname(hostname) {
  const normalized = hostname.toLowerCase().trim();

  // Block localhost variants
  const blockedHostnames = [
    'localhost',
    'localhost.localdomain',
    'ip6-localhost',
    'ip6-loopback',
    'ip6-localnet',
    'ip6-mcastprefix',
  ];

  if (blockedHostnames.includes(normalized)) {
    return true;
  }

  // Block hostnames that end with .local, .localhost, .internal, .localdomain
  const blockedSuffixes = ['.local', '.localhost', '.internal', '.localdomain', '.home', '.home.arpa'];
  if (blockedSuffixes.some((suffix) => normalized.endsWith(suffix))) {
    return true;
  }

  // Block if the hostname is a raw IP address that's blocked
  // IPv4 check
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized)) {
    return isBlockedIp(normalized);
  }

  // IPv6 check (basic patterns)
  if (normalized.includes(':') && (normalized.startsWith('::1') || normalized.startsWith('fe80:'))) {
    return true;
  }

  return false;
}

/**
 * Validation result for SSRF-safe URL check
 *
 * @typedef {Object} UrlValidationResult
 * @property {boolean} valid - Whether the URL is safe to use
 * @property {string} [error] - Error message if invalid
 * @property {string} [blockedIp] - The blocked IP address if found during DNS resolution
 */

/**
 * Validate a URL for SSRF safety.
 * Checks both the hostname literal and performs DNS resolution to prevent
 * DNS rebinding attacks.
 *
 * @param {string} urlString - The URL to validate
 * @param {Object} [options] - Validation options
 * @param {boolean} [options.allowHttp=false] - Allow HTTP (not just HTTPS)
 * @param {boolean} [options.checkDns=true] - Perform DNS resolution check
 * @returns {Promise<UrlValidationResult>} Validation result
 */
export async function validateUrlForSsrf(urlString, options = {}) {
  const { allowHttp = false, checkDns = true } = options;

  // Basic URL parsing
  let url;
  try {
    url = new URL(urlString);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // Protocol check
  const allowedProtocols = allowHttp ? ['https:', 'http:'] : ['https:'];
  if (!allowedProtocols.includes(url.protocol)) {
    return {
      valid: false,
      error: allowHttp
        ? 'URL must use HTTP or HTTPS protocol'
        : 'URL must use HTTPS protocol',
    };
  }

  const hostname = url.hostname;

  // Check for blocked hostnames (localhost, etc.)
  if (isBlockedHostname(hostname)) {
    return {
      valid: false,
      error: 'URL hostname is not allowed (private/internal addresses are blocked)',
    };
  }

  // Check if hostname is already an IP and if it's blocked
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    if (isBlockedIp(hostname)) {
      return {
        valid: false,
        error: 'URL resolves to a blocked IP address (private/internal ranges are not allowed)',
      };
    }
  } else if (checkDns) {
    // Perform DNS resolution to prevent DNS rebinding
    const blockedIp = await resolveAndCheckIp(hostname);
    if (blockedIp) {
      return {
        valid: false,
        error: `URL hostname resolves to blocked IP address ${blockedIp} (private/internal ranges are not allowed)`,
        blockedIp,
      };
    }
  }

  return { valid: true };
}

/**
 * Synchronous version of SSRF validation for cases where DNS resolution
 * is not possible or desired. Use the async version when possible.
 *
 * @param {string} urlString - The URL to validate
 * @param {Object} [options] - Validation options
 * @param {boolean} [options.allowHttp=false] - Allow HTTP (not just HTTPS)
 * @returns {UrlValidationResult} Validation result
 */
export function validateUrlForSsrfSync(urlString, options = {}) {
  const { allowHttp = false } = options;

  // Basic URL parsing
  let url;
  try {
    url = new URL(urlString);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // Protocol check
  const allowedProtocols = allowHttp ? ['https:', 'http:'] : ['https:'];
  if (!allowedProtocols.includes(url.protocol)) {
    return {
      valid: false,
      error: allowHttp
        ? 'URL must use HTTP or HTTPS protocol'
        : 'URL must use HTTPS protocol',
    };
  }

  const hostname = url.hostname;

  // Check for blocked hostnames
  if (isBlockedHostname(hostname)) {
    return {
      valid: false,
      error: 'URL hostname is not allowed (private/internal addresses are blocked)',
    };
  }

  // Check if hostname is a raw IP and if it's blocked
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    if (isBlockedIp(hostname)) {
      return {
        valid: false,
        error: 'URL points to a blocked IP address (private/internal ranges are not allowed)',
      };
    }
  }

  return { valid: true };
}

export default {
  validateUrlForSsrf,
  validateUrlForSsrfSync,
  isBlockedIp,
};
