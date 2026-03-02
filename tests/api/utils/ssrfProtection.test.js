import { describe, expect, it, vi } from 'vitest';
import {
  isBlockedIp,
  validateUrlForSsrf,
  validateUrlForSsrfSync,
} from '../../../src/api/utils/ssrfProtection.js';

describe('isBlockedIp', () => {
  describe('loopback addresses', () => {
    it('should block 127.0.0.1', () => {
      expect(isBlockedIp('127.0.0.1')).toBe(true);
    });

    it('should block 127.0.0.0', () => {
      expect(isBlockedIp('127.0.0.0')).toBe(true);
    });

    it('should block 127.255.255.255', () => {
      expect(isBlockedIp('127.255.255.255')).toBe(true);
    });

    it('should block 127.123.45.67', () => {
      expect(isBlockedIp('127.123.45.67')).toBe(true);
    });
  });

  describe('link-local addresses (AWS metadata)', () => {
    it('should block 169.254.169.254 (AWS metadata)', () => {
      expect(isBlockedIp('169.254.169.254')).toBe(true);
    });

    it('should block 169.254.0.1', () => {
      expect(isBlockedIp('169.254.0.1')).toBe(true);
    });

    it('should block 169.254.255.255', () => {
      expect(isBlockedIp('169.254.255.255')).toBe(true);
    });
  });

  describe('private ranges', () => {
    it('should block 10.0.0.1 (10.0.0.0/8)', () => {
      expect(isBlockedIp('10.0.0.1')).toBe(true);
    });

    it('should block 10.255.255.255', () => {
      expect(isBlockedIp('10.255.255.255')).toBe(true);
    });

    it('should block 172.16.0.1 (172.16.0.0/12)', () => {
      expect(isBlockedIp('172.16.0.1')).toBe(true);
    });

    it('should block 172.31.255.255', () => {
      expect(isBlockedIp('172.31.255.255')).toBe(true);
    });

    it('should NOT block 172.15.255.255 (below range)', () => {
      expect(isBlockedIp('172.15.255.255')).toBe(false);
    });

    it('should NOT block 172.32.0.1 (above range)', () => {
      expect(isBlockedIp('172.32.0.1')).toBe(false);
    });

    it('should block 192.168.0.1 (192.168.0.0/16)', () => {
      expect(isBlockedIp('192.168.0.1')).toBe(true);
    });

    it('should block 192.168.255.255', () => {
      expect(isBlockedIp('192.168.255.255')).toBe(true);
    });
  });

  describe('this-network', () => {
    it('should block 0.0.0.0', () => {
      expect(isBlockedIp('0.0.0.0')).toBe(true);
    });

    it('should block 0.0.0.1', () => {
      expect(isBlockedIp('0.0.0.1')).toBe(true);
    });
  });

  describe('IPv6', () => {
    it('should block ::1 (IPv6 loopback)', () => {
      expect(isBlockedIp('::1')).toBe(true);
    });

    it('should block fe80::1 (IPv6 link-local)', () => {
      expect(isBlockedIp('fe80::1')).toBe(true);
    });

    it('should block IPv4-mapped IPv6 private addresses', () => {
      expect(isBlockedIp('::ffff:192.168.1.1')).toBe(true);
      expect(isBlockedIp('::ffff:127.0.0.1')).toBe(true);
      expect(isBlockedIp('::ffff:10.0.0.1')).toBe(true);
    });
  });

  describe('valid public IPs', () => {
    it('should NOT block 8.8.8.8 (Google DNS)', () => {
      expect(isBlockedIp('8.8.8.8')).toBe(false);
    });

    it('should NOT block 1.1.1.1 (Cloudflare DNS)', () => {
      expect(isBlockedIp('1.1.1.1')).toBe(false);
    });

    it('should NOT block 172.15.0.1 (not in private range)', () => {
      expect(isBlockedIp('172.15.0.1')).toBe(false);
    });
  });
});

describe('validateUrlForSsrfSync', () => {
  describe('invalid URL format', () => {
    it('should reject malformed URLs', () => {
      const result = validateUrlForSsrfSync('not-a-url');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid URL format');
    });

    it('should reject empty string', () => {
      const result = validateUrlForSsrfSync('');
      expect(result.valid).toBe(false);
    });
  });

  describe('protocol validation', () => {
    it('should accept HTTPS URLs by default', () => {
      const result = validateUrlForSsrfSync('https://example.com/webhook');
      expect(result.valid).toBe(true);
    });

    it('should reject HTTP URLs by default', () => {
      const result = validateUrlForSsrfSync('http://example.com/webhook');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('HTTPS');
    });

    it('should accept HTTP URLs when allowHttp is true', () => {
      const result = validateUrlForSsrfSync('http://example.com/webhook', { allowHttp: true });
      expect(result.valid).toBe(true);
    });

    it('should reject ftp:// protocol', () => {
      const result = validateUrlForSsrfSync('ftp://example.com/file');
      expect(result.valid).toBe(false);
    });
  });

  describe('blocked hostnames', () => {
    it('should reject localhost', () => {
      const result = validateUrlForSsrfSync('https://localhost/webhook');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not allowed');
    });

    it('should reject localhost with port', () => {
      const result = validateUrlForSsrfSync('https://localhost:8080/webhook');
      expect(result.valid).toBe(false);
    });

    it('should reject .local domains', () => {
      const result = validateUrlForSsrfSync('https://myserver.local/webhook');
      expect(result.valid).toBe(false);
    });

    it('should reject .internal domains', () => {
      const result = validateUrlForSsrfSync('https://api.internal/webhook');
      expect(result.valid).toBe(false);
    });

    it('should reject .localhost domains', () => {
      const result = validateUrlForSsrfSync('https://app.localhost/webhook');
      expect(result.valid).toBe(false);
    });
  });

  describe('blocked IP addresses', () => {
    it('should reject 127.0.0.1', () => {
      const result = validateUrlForSsrfSync('https://127.0.0.1/webhook');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/blocked|private|internal/i);
    });

    it('should reject 127.0.0.1 with port', () => {
      const result = validateUrlForSsrfSync('https://127.0.0.1:3000/webhook');
      expect(result.valid).toBe(false);
    });

    it('should reject AWS metadata endpoint', () => {
      const result = validateUrlForSsrfSync('https://169.254.169.254/latest/meta-data/');
      expect(result.valid).toBe(false);
    });

    it('should reject 10.x.x.x addresses', () => {
      const result = validateUrlForSsrfSync('https://10.0.0.1/webhook');
      expect(result.valid).toBe(false);
    });

    it('should reject 172.16.x.x addresses', () => {
      const result = validateUrlForSsrfSync('https://172.16.0.1/webhook');
      expect(result.valid).toBe(false);
    });

    it('should reject 192.168.x.x addresses', () => {
      const result = validateUrlForSsrfSync('https://192.168.1.1/webhook');
      expect(result.valid).toBe(false);
    });

    it('should reject 0.0.0.0', () => {
      const result = validateUrlForSsrfSync('https://0.0.0.0/webhook');
      expect(result.valid).toBe(false);
    });
  });

  describe('valid public URLs', () => {
    it('should accept https://example.com/webhook', () => {
      const result = validateUrlForSsrfSync('https://example.com/webhook');
      expect(result.valid).toBe(true);
    });

    it('should accept URLs with paths', () => {
      const result = validateUrlForSsrfSync('https://api.example.com/v1/webhooks/endpoint');
      expect(result.valid).toBe(true);
    });

    it('should accept URLs with query strings', () => {
      const result = validateUrlForSsrfSync('https://example.com/webhook?token=abc123');
      expect(result.valid).toBe(true);
    });

    it('should accept URLs with ports', () => {
      const result = validateUrlForSsrfSync('https://example.com:8443/webhook');
      expect(result.valid).toBe(true);
    });
  });
});

describe('validateUrlForSsrf (async)', () => {
  describe('basic validation', () => {
    it('should accept valid HTTPS URLs', async () => {
      const result = await validateUrlForSsrf('https://example.com/webhook');
      expect(result.valid).toBe(true);
    });

    it('should reject invalid URLs', async () => {
      const result = await validateUrlForSsrf('not-a-url');
      expect(result.valid).toBe(false);
    });

    it('should reject localhost', async () => {
      const result = await validateUrlForSsrf('https://localhost/webhook');
      expect(result.valid).toBe(false);
    });

    it('should reject blocked IPs', async () => {
      const result = await validateUrlForSsrf('https://127.0.0.1/webhook');
      expect(result.valid).toBe(false);
    });
  });

  describe('DNS resolution check', () => {
    it('should skip DNS check when checkDns is false', async () => {
      // This would normally do a DNS lookup
      const result = await validateUrlForSsrf('https://example.com/webhook', { checkDns: false });
      expect(result.valid).toBe(true);
    });
  });
});
