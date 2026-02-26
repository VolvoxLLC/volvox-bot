import { describe, expect, it } from 'vitest';
import {
  isMasked,
  maskSensitiveFields,
  READABLE_CONFIG_KEYS,
  SAFE_CONFIG_KEYS,
  SENSITIVE_FIELDS,
  stripMaskedWrites,
} from '../../../src/api/utils/configAllowlist.js';

describe('configAllowlist', () => {
  describe('SAFE_CONFIG_KEYS', () => {
    it('should export a Set of safe config keys', () => {
      expect(SAFE_CONFIG_KEYS instanceof Set).toBe(true);
      expect(SAFE_CONFIG_KEYS.has('ai')).toBe(true);
      expect(SAFE_CONFIG_KEYS.has('welcome')).toBe(true);
      expect(SAFE_CONFIG_KEYS.has('spam')).toBe(true);
      expect(SAFE_CONFIG_KEYS.has('moderation')).toBe(true);
      expect(SAFE_CONFIG_KEYS.has('triage')).toBe(true);
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

  describe('isMasked', () => {
    it('should return true for the mask sentinel value', () => {
      expect(isMasked('••••••••')).toBe(true);
    });

    it('should return false for regular strings', () => {
      expect(isMasked('sk-secret-123')).toBe(false);
      expect(isMasked('')).toBe(false);
      expect(isMasked('••••')).toBe(false); // partial mask
    });

    it('should return false for non-string values', () => {
      expect(isMasked(null)).toBe(false);
      expect(isMasked(undefined)).toBe(false);
      expect(isMasked(42)).toBe(false);
      expect(isMasked(true)).toBe(false);
    });
  });

  describe('stripMaskedWrites', () => {
    it('should remove writes where sensitive fields have the mask sentinel', () => {
      const writes = [
        { path: 'triage.enabled', value: true },
        { path: 'triage.classifyApiKey', value: '••••••••' },
        { path: 'triage.respondApiKey', value: '••••••••' },
      ];

      const result = stripMaskedWrites(writes);

      expect(result).toEqual([{ path: 'triage.enabled', value: true }]);
    });

    it('should keep writes where sensitive fields have real values', () => {
      const writes = [
        { path: 'triage.classifyApiKey', value: 'sk-new-key-123' },
        { path: 'triage.respondApiKey', value: 'sk-new-key-456' },
      ];

      const result = stripMaskedWrites(writes);

      expect(result).toEqual(writes);
    });

    it('should not strip mask sentinel from non-sensitive fields', () => {
      const writes = [{ path: 'ai.model', value: '••••••••' }];

      const result = stripMaskedWrites(writes);

      expect(result).toEqual(writes);
    });

    it('should return empty array when all writes are masked sentinels', () => {
      const writes = [
        { path: 'triage.classifyApiKey', value: '••••••••' },
        { path: 'triage.respondApiKey', value: '••••••••' },
      ];

      const result = stripMaskedWrites(writes);

      expect(result).toEqual([]);
    });
  });
});
