import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  _resetValidationCache,
  validateWebhookUrl,
} from '../../../src/api/utils/validateWebhookUrl.js';

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

describe('validateWebhookUrl', () => {
  afterEach(() => {
    _resetValidationCache();
    vi.unstubAllEnvs();
  });

  describe('valid URLs', () => {
    it('should accept https URLs with public hostnames', () => {
      expect(validateWebhookUrl('https://example.com/hook')).toBe(true);
      expect(validateWebhookUrl('https://hooks.slack.com/services/abc')).toBe(true);
      expect(validateWebhookUrl('https://discord.com/api/webhooks/123/abc')).toBe(true);
    });

    it('should accept https URLs with public IP addresses', () => {
      expect(validateWebhookUrl('https://8.8.8.8/hook')).toBe(true);
      expect(validateWebhookUrl('https://203.0.113.1/hook')).toBe(true);
    });

    it('should accept https URLs with ports', () => {
      expect(validateWebhookUrl('https://example.com:8443/hook')).toBe(true);
    });
  });

  describe('scheme validation', () => {
    it('should reject http in production', () => {
      vi.stubEnv('NODE_ENV', 'production');
      expect(validateWebhookUrl('http://example.com/hook')).toBe(false);
    });

    it('should allow http in development', () => {
      vi.stubEnv('NODE_ENV', 'development');
      _resetValidationCache();
      expect(validateWebhookUrl('http://example.com/hook')).toBe(true);
    });

    it('should reject ftp and other schemes', () => {
      expect(validateWebhookUrl('ftp://example.com/hook')).toBe(false);
      expect(validateWebhookUrl('file:///etc/passwd')).toBe(false);
    });
  });

  describe('blocked IPs and hostnames', () => {
    it('should reject localhost', () => {
      expect(validateWebhookUrl('https://localhost/hook')).toBe(false);
      expect(validateWebhookUrl('https://localhost:3000/hook')).toBe(false);
    });

    it('should reject 127.0.0.1 (loopback)', () => {
      expect(validateWebhookUrl('https://127.0.0.1/hook')).toBe(false);
      expect(validateWebhookUrl('https://127.0.0.1:8080/hook')).toBe(false);
    });

    it('should reject 169.254.x.x (link-local)', () => {
      expect(validateWebhookUrl('https://169.254.1.1/hook')).toBe(false);
      expect(validateWebhookUrl('https://169.254.169.254/latest/meta-data')).toBe(false);
    });

    it('should reject 10.x.x.x (private)', () => {
      expect(validateWebhookUrl('https://10.0.0.1/hook')).toBe(false);
      expect(validateWebhookUrl('https://10.255.255.255/hook')).toBe(false);
    });

    it('should reject 172.16-31.x.x (private)', () => {
      expect(validateWebhookUrl('https://172.16.0.1/hook')).toBe(false);
      expect(validateWebhookUrl('https://172.31.255.255/hook')).toBe(false);
    });

    it('should allow 172.32.x.x (not private)', () => {
      expect(validateWebhookUrl('https://172.32.0.1/hook')).toBe(true);
    });

    it('should reject 192.168.x.x (private)', () => {
      expect(validateWebhookUrl('https://192.168.0.1/hook')).toBe(false);
      expect(validateWebhookUrl('https://192.168.1.100/hook')).toBe(false);
    });

    it('should reject IPv6 loopback [::1]', () => {
      expect(validateWebhookUrl('https://[::1]/hook')).toBe(false);
    });

    it('should reject 0.0.0.0', () => {
      expect(validateWebhookUrl('https://0.0.0.0/hook')).toBe(false);
    });

    it('should reject IPv4-mapped IPv6 loopback [::ffff:127.0.0.1]', () => {
      expect(validateWebhookUrl('https://[::ffff:127.0.0.1]/hook')).toBe(false);
    });

    it('should reject IPv4-mapped IPv6 cloud metadata [::ffff:169.254.169.254]', () => {
      expect(validateWebhookUrl('https://[::ffff:169.254.169.254]/hook')).toBe(false);
    });

    it('should reject IPv4-mapped IPv6 private network [::ffff:10.0.0.1]', () => {
      expect(validateWebhookUrl('https://[::ffff:10.0.0.1]/hook')).toBe(false);
    });

    it('should reject IPv4-mapped IPv6 hex form [::ffff:7f00:1] (127.0.0.1)', () => {
      expect(validateWebhookUrl('https://[::ffff:7f00:1]/hook')).toBe(false);
    });

    it('should reject IPv4-mapped IPv6 192.168.x.x [::ffff:192.168.1.1]', () => {
      expect(validateWebhookUrl('https://[::ffff:192.168.1.1]/hook')).toBe(false);
    });

    it('should allow IPv4-mapped IPv6 with public IP [::ffff:8.8.8.8]', () => {
      expect(validateWebhookUrl('https://[::ffff:8.8.8.8]/hook')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should reject null/undefined/empty input', () => {
      expect(validateWebhookUrl(null)).toBe(false);
      expect(validateWebhookUrl(undefined)).toBe(false);
      expect(validateWebhookUrl('')).toBe(false);
    });

    it('should reject non-string input', () => {
      expect(validateWebhookUrl(123)).toBe(false);
      expect(validateWebhookUrl({})).toBe(false);
    });

    it('should reject invalid URLs', () => {
      expect(validateWebhookUrl('not-a-url')).toBe(false);
      expect(validateWebhookUrl('://missing-scheme')).toBe(false);
    });

    it('should cache validation results', () => {
      const url = 'https://example.com/hook';
      const first = validateWebhookUrl(url);
      const second = validateWebhookUrl(url);
      expect(first).toBe(second);
      expect(first).toBe(true);
    });

    it('should return fresh results after cache reset', () => {
      vi.stubEnv('NODE_ENV', 'development');
      expect(validateWebhookUrl('http://example.com/hook')).toBe(true);
      _resetValidationCache();
      vi.stubEnv('NODE_ENV', 'production');
      expect(validateWebhookUrl('http://example.com/hook')).toBe(false);
    });

    it('should evict cache when size exceeds 100 entries', () => {
      // Cache the target URL as valid in development (http:// allowed in dev)
      vi.stubEnv('NODE_ENV', 'development');
      expect(validateWebhookUrl('http://should-evict.com/hook')).toBe(true);

      // Fill the cache with 99 more entries so total = 100 (MAX_CACHE_SIZE)
      for (let i = 0; i < 99; i++) {
        validateWebhookUrl(`https://evict-filler-${i}.com/hook`);
      }

      // Switch to production — http:// is now invalid
      vi.stubEnv('NODE_ENV', 'production');

      // Adding the 101st entry triggers eviction: cache.size (100) >= MAX_CACHE_SIZE → clear
      validateWebhookUrl('https://evict-trigger.com/hook');

      // Re-evaluate the target URL — it was evicted, so it must be re-evaluated in production context
      expect(validateWebhookUrl('http://should-evict.com/hook')).toBe(false);
    });
  });
});
