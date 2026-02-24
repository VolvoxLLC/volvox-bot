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
  });
});
