import { describe, expect, it } from 'vitest';
import {
  maskSensitiveFields,
  READABLE_CONFIG_KEYS,
  SAFE_CONFIG_KEYS,
  SENSITIVE_FIELDS,
} from '../../../src/api/utils/configAllowlist.js';

describe('configAllowlist', () => {
  describe('SAFE_CONFIG_KEYS', () => {
    it('should export an array of safe config keys', () => {
      expect(Array.isArray(SAFE_CONFIG_KEYS)).toBe(true);
      expect(SAFE_CONFIG_KEYS).toContain('ai');
      expect(SAFE_CONFIG_KEYS).toContain('welcome');
      expect(SAFE_CONFIG_KEYS).toContain('spam');
      expect(SAFE_CONFIG_KEYS).toContain('moderation');
      expect(SAFE_CONFIG_KEYS).toContain('triage');
    });
  });

  describe('READABLE_CONFIG_KEYS', () => {
    it('should include all SAFE_CONFIG_KEYS plus additional readable keys', () => {
      expect(Array.isArray(READABLE_CONFIG_KEYS)).toBe(true);
      expect(READABLE_CONFIG_KEYS).toContain('ai');
      expect(READABLE_CONFIG_KEYS).toContain('welcome');
      expect(READABLE_CONFIG_KEYS).toContain('spam');
      expect(READABLE_CONFIG_KEYS).toContain('moderation');
      expect(READABLE_CONFIG_KEYS).toContain('triage');
      expect(READABLE_CONFIG_KEYS).toContain('logging');
      expect(READABLE_CONFIG_KEYS).toContain('memory');
      expect(READABLE_CONFIG_KEYS).toContain('permissions');
    });
  });

  describe('SENSITIVE_FIELDS', () => {
    it('should be a Set containing sensitive field paths', () => {
      expect(SENSITIVE_FIELDS instanceof Set).toBe(true);
      expect(SENSITIVE_FIELDS.has('triage.classifyApiKey')).toBe(true);
      expect(SENSITIVE_FIELDS.has('triage.respondApiKey')).toBe(true);
    });
  });

  describe('maskSensitiveFields', () => {
    it('should mask sensitive API keys with dots', () => {
      const config = {
        triage: {
          classifyApiKey: 'secret-key-123',
          respondApiKey: 'another-secret-456',
          enabled: true,
        },
      };

      const masked = maskSensitiveFields(config);

      expect(masked.triage.classifyApiKey).toBe('••••••••');
      expect(masked.triage.respondApiKey).toBe('••••••••');
      expect(masked.triage.enabled).toBe(true);
    });

    it('should not modify original config object', () => {
      const config = {
        triage: {
          classifyApiKey: 'secret-key-123',
          enabled: true,
        },
      };

      const masked = maskSensitiveFields(config);

      expect(config.triage.classifyApiKey).toBe('secret-key-123');
      expect(masked.triage.classifyApiKey).toBe('••••••••');
    });

    it('should not mask empty or null sensitive fields', () => {
      const config = {
        triage: {
          classifyApiKey: '',
          respondApiKey: null,
          enabled: true,
        },
      };

      const masked = maskSensitiveFields(config);

      expect(masked.triage.classifyApiKey).toBe('');
      expect(masked.triage.respondApiKey).toBe(null);
    });

    it('should handle missing nested objects gracefully', () => {
      const config = {
        ai: {
          enabled: true,
        },
      };

      const masked = maskSensitiveFields(config);

      expect(masked.ai.enabled).toBe(true);
      expect(masked.triage).toBeUndefined();
    });

    it('should handle config without sensitive fields', () => {
      const config = {
        ai: {
          enabled: true,
          model: 'claude-3-sonnet',
        },
        welcome: {
          enabled: false,
        },
      };

      const masked = maskSensitiveFields(config);

      expect(masked.ai.enabled).toBe(true);
      expect(masked.ai.model).toBe('claude-3-sonnet');
      expect(masked.welcome.enabled).toBe(false);
    });

    it('should deeply clone nested objects', () => {
      const config = {
        triage: {
          classifyApiKey: 'secret',
          nested: {
            value: 'test',
          },
        },
      };

      const masked = maskSensitiveFields(config);
      masked.triage.nested.value = 'modified';

      expect(config.triage.nested.value).toBe('test');
    });

    it('should preserve arrays in config', () => {
      const config = {
        triage: {
          classifyApiKey: 'secret',
          channels: ['channel1', 'channel2'],
          excludeChannels: [],
        },
      };

      const masked = maskSensitiveFields(config);

      expect(Array.isArray(masked.triage.channels)).toBe(true);
      expect(masked.triage.channels).toEqual(['channel1', 'channel2']);
      expect(Array.isArray(masked.triage.excludeChannels)).toBe(true);
      expect(masked.triage.excludeChannels).toEqual([]);
    });

    it('should handle null config gracefully', () => {
      expect(() => maskSensitiveFields(null)).not.toThrow();
    });

    it('should handle undefined nested paths', () => {
      const config = {
        triage: undefined,
      };

      const masked = maskSensitiveFields(config);

      expect(masked.triage).toBeUndefined();
    });
  });
});