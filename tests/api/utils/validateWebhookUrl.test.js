import dns from 'node:dns';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  _resetValidationCache,
  validateDnsResolution,
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

    it('should reject IPv6 unspecified address [::]', () => {
      expect(validateWebhookUrl('https://[::]/hook')).toBe(false);
    });

    it('should reject IPv6 link-local [fe80::1]', () => {
      expect(validateWebhookUrl('https://[fe80::1]/hook')).toBe(false);
    });

    it('should reject IPv6 link-local [febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff]', () => {
      expect(
        validateWebhookUrl('https://[febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff]/hook')
      ).toBe(false);
    });

    it('should reject IPv6 ULA (private) [fc00::1]', () => {
      expect(validateWebhookUrl('https://[fc00::1]/hook')).toBe(false);
    });

    it('should reject IPv6 ULA (private) [fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff]', () => {
      expect(
        validateWebhookUrl('https://[fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff]/hook')
      ).toBe(false);
    });

    it('should reject IPv6 multicast [ff00::1]', () => {
      expect(validateWebhookUrl('https://[ff00::1]/hook')).toBe(false);
    });

    it('should reject IPv6 multicast [ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff]', () => {
      expect(
        validateWebhookUrl('https://[ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff]/hook')
      ).toBe(false);
    });

    it('should reject IPv6 documentation address [2001:db8::1]', () => {
      expect(validateWebhookUrl('https://[2001:db8::1]/hook')).toBe(false);
    });

    it('should reject IPv6 6to4 (deprecated) [2002::1]', () => {
      expect(validateWebhookUrl('https://[2002::1]/hook')).toBe(false);
    });

    it('should reject IPv6 Teredo (deprecated) [2001::1]', () => {
      expect(validateWebhookUrl('https://[2001::1]/hook')).toBe(false);
    });

    it('should reject IPv6 discard-only address [100::1]', () => {
      expect(validateWebhookUrl('https://[100::1]/hook')).toBe(false);
    });

    it('should allow IPv6 global unicast [2606:4700:4700::1111]', () => {
      expect(validateWebhookUrl('https://[2606:4700:4700::1111]/hook')).toBe(true);
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

  describe('validateDnsResolution', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should accept when hostname resolves to public IPs', async () => {
      vi.spyOn(dns.promises, 'resolve4').mockResolvedValue(['203.0.113.1']);
      vi.spyOn(dns.promises, 'resolve6').mockResolvedValue([]);

      expect(await validateDnsResolution('https://example.com/hook')).toBe(true);
    });

    it('should reject when hostname resolves to loopback IPv4 (DNS rebinding)', async () => {
      vi.spyOn(dns.promises, 'resolve4').mockResolvedValue(['127.0.0.1']);
      vi.spyOn(dns.promises, 'resolve6').mockResolvedValue([]);

      expect(await validateDnsResolution('https://evil.example.com/hook')).toBe(false);
    });

    it('should reject when hostname resolves to private IPv4 (DNS rebinding)', async () => {
      vi.spyOn(dns.promises, 'resolve4').mockResolvedValue(['10.0.0.1']);
      vi.spyOn(dns.promises, 'resolve6').mockResolvedValue([]);

      expect(await validateDnsResolution('https://evil.example.com/hook')).toBe(false);
    });

    it('should reject when hostname resolves to 192.168.x.x', async () => {
      vi.spyOn(dns.promises, 'resolve4').mockResolvedValue(['192.168.1.1']);
      vi.spyOn(dns.promises, 'resolve6').mockResolvedValue([]);

      expect(await validateDnsResolution('https://evil.example.com/hook')).toBe(false);
    });

    it('should reject when hostname resolves to link-local (169.254.x.x)', async () => {
      vi.spyOn(dns.promises, 'resolve4').mockResolvedValue(['169.254.169.254']);
      vi.spyOn(dns.promises, 'resolve6').mockResolvedValue([]);

      expect(await validateDnsResolution('https://evil.example.com/hook')).toBe(false);
    });

    it('should reject when any resolved IPv4 is blocked (mixed results)', async () => {
      vi.spyOn(dns.promises, 'resolve4').mockResolvedValue(['8.8.8.8', '127.0.0.1']);
      vi.spyOn(dns.promises, 'resolve6').mockResolvedValue([]);

      expect(await validateDnsResolution('https://evil.example.com/hook')).toBe(false);
    });

    it('should reject when hostname resolves to IPv6 loopback', async () => {
      vi.spyOn(dns.promises, 'resolve4').mockResolvedValue([]);
      vi.spyOn(dns.promises, 'resolve6').mockResolvedValue(['::1']);

      expect(await validateDnsResolution('https://evil.example.com/hook')).toBe(false);
    });

    it('should reject when hostname resolves to IPv6 link-local', async () => {
      vi.spyOn(dns.promises, 'resolve4').mockResolvedValue([]);
      vi.spyOn(dns.promises, 'resolve6').mockResolvedValue(['fe80::1']);

      expect(await validateDnsResolution('https://evil.example.com/hook')).toBe(false);
    });

    it('should reject when hostname resolves to IPv6 ULA (private)', async () => {
      vi.spyOn(dns.promises, 'resolve4').mockResolvedValue([]);
      vi.spyOn(dns.promises, 'resolve6').mockResolvedValue(['fc00::1']);

      expect(await validateDnsResolution('https://evil.example.com/hook')).toBe(false);
    });

    it('should reject when hostname resolves to IPv6 multicast', async () => {
      vi.spyOn(dns.promises, 'resolve4').mockResolvedValue([]);
      vi.spyOn(dns.promises, 'resolve6').mockResolvedValue(['ff02::1']);

      expect(await validateDnsResolution('https://evil.example.com/hook')).toBe(false);
    });

    it('should reject when hostname resolves to IPv6 documentation address', async () => {
      vi.spyOn(dns.promises, 'resolve4').mockResolvedValue([]);
      vi.spyOn(dns.promises, 'resolve6').mockResolvedValue(['2001:db8::1']);

      expect(await validateDnsResolution('https://evil.example.com/hook')).toBe(false);
    });

    it('should reject when hostname resolves to IPv4-mapped IPv6 private address', async () => {
      vi.spyOn(dns.promises, 'resolve4').mockResolvedValue([]);
      vi.spyOn(dns.promises, 'resolve6').mockResolvedValue(['::ffff:127.0.0.1']);

      expect(await validateDnsResolution('https://evil.example.com/hook')).toBe(false);
    });

    it('should reject when hostname resolves to IPv4-mapped IPv6 in 10.x private range', async () => {
      vi.spyOn(dns.promises, 'resolve4').mockResolvedValue([]);
      vi.spyOn(dns.promises, 'resolve6').mockResolvedValue(['::ffff:10.0.0.1']);

      expect(await validateDnsResolution('https://evil.example.com/hook')).toBe(false);
    });

    it('should reject when hostname resolves to IPv4-mapped IPv6 in 192.168.x.x range', async () => {
      vi.spyOn(dns.promises, 'resolve4').mockResolvedValue([]);
      vi.spyOn(dns.promises, 'resolve6').mockResolvedValue(['::ffff:192.168.1.1']);

      expect(await validateDnsResolution('https://evil.example.com/hook')).toBe(false);
    });

    it('should reject when hostname resolves to IPv4-mapped IPv6 in hex form (private)', async () => {
      // ::ffff:7f00:0001 = ::ffff:127.0.0.1
      vi.spyOn(dns.promises, 'resolve4').mockResolvedValue([]);
      vi.spyOn(dns.promises, 'resolve6').mockResolvedValue(['::ffff:7f00:0001']);

      expect(await validateDnsResolution('https://evil.example.com/hook')).toBe(false);
    });

    it('should allow when hostname resolves to IPv4-mapped IPv6 of a public address', async () => {
      // ::ffff:8.8.8.8 maps to the public Google DNS address
      vi.spyOn(dns.promises, 'resolve4').mockResolvedValue([]);
      vi.spyOn(dns.promises, 'resolve6').mockResolvedValue(['::ffff:8.8.8.8']);

      expect(await validateDnsResolution('https://example.com/hook')).toBe(true);
    });

    it('should return false when both DNS families return empty arrays (no records)', async () => {
      vi.spyOn(dns.promises, 'resolve4').mockResolvedValue([]);
      vi.spyOn(dns.promises, 'resolve6').mockResolvedValue([]);

      expect(await validateDnsResolution('https://no-records.example.com/hook')).toBe(false);
    });

    it('should return true for public IPv4-literal hostnames', async () => {
      // IP literals skip DNS resolution but are still validated against blocked ranges
      expect(await validateDnsResolution('https://8.8.8.8/hook')).toBe(true);
    });

    it('should return false for blocked IPv4-literal hostnames', async () => {
      // IP literals are validated, not auto-accepted
      expect(await validateDnsResolution('https://127.0.0.1/hook')).toBe(false);
      expect(await validateDnsResolution('https://10.0.0.1/hook')).toBe(false);
      expect(await validateDnsResolution('https://192.168.1.1/hook')).toBe(false);
    });

    it('should return true for public IPv6-literal hostnames', async () => {
      expect(await validateDnsResolution('https://[2606:4700:4700::1111]/hook')).toBe(true);
    });

    it('should return false for blocked IPv6-literal hostnames', async () => {
      // IPv6 literals are validated against blocked ranges
      expect(await validateDnsResolution('https://[::1]/hook')).toBe(false);
      expect(await validateDnsResolution('https://[::]/hook')).toBe(false);
      expect(await validateDnsResolution('https://[fe80::1]/hook')).toBe(false);
      expect(await validateDnsResolution('https://[fc00::1]/hook')).toBe(false);
      expect(await validateDnsResolution('https://[ff00::1]/hook')).toBe(false);
      expect(await validateDnsResolution('https://[2001:db8::1]/hook')).toBe(false);
    });

    it('should return false for invalid URLs', async () => {
      expect(await validateDnsResolution('not-a-url')).toBe(false);
    });

    it('should return false when DNS resolution fails entirely', async () => {
      vi.spyOn(dns.promises, 'resolve4').mockRejectedValue(new Error('SERVFAIL'));
      vi.spyOn(dns.promises, 'resolve6').mockRejectedValue(new Error('SERVFAIL'));

      expect(await validateDnsResolution('https://no-such-host.example.com/hook')).toBe(false);
    });

    it('should handle when only one DNS family fails gracefully', async () => {
      vi.spyOn(dns.promises, 'resolve4').mockResolvedValue(['203.0.113.1']);
      vi.spyOn(dns.promises, 'resolve6').mockRejectedValue(new Error('NODATA'));

      expect(await validateDnsResolution('https://example.com/hook')).toBe(true);
    });
  });
});
