import { describe, expect, it, vi } from 'vitest';
import { validateConfigPatchBody } from '../../../src/api/utils/validateConfigPatch.js';

// Mock the validateSingleValue function from config.js
vi.mock('../../../src/api/routes/config.js', () => ({
  validateSingleValue: vi.fn((path, value) => {
    // Return validation errors for known test cases
    if (path === 'ai.invalid' && typeof value !== 'boolean') {
      return ['ai.invalid: expected boolean, got string'];
    }
    return [];
  }),
}));

const SAFE_CONFIG_KEYS = new Set(['ai', 'welcome', 'spam', 'moderation', 'triage']);

describe('validateConfigPatch', () => {
  describe('validateConfigPatchBody', () => {
    it('should validate a correct config patch body', () => {
      const body = {
        path: 'ai.enabled',
        value: true,
      };

      const result = validateConfigPatchBody(body, SAFE_CONFIG_KEYS);

      expect(result.error).toBeUndefined();
      expect(result.path).toBe('ai.enabled');
      expect(result.value).toBe(true);
      expect(result.topLevelKey).toBe('ai');
    });

    it('should reject missing path', () => {
      const body = {
        value: true,
      };

      const result = validateConfigPatchBody(body, SAFE_CONFIG_KEYS);

      expect(result.error).toBe('Missing or invalid "path" in request body');
      expect(result.status).toBe(400);
    });

    it('should reject invalid path type', () => {
      const body = {
        path: 123,
        value: true,
      };

      const result = validateConfigPatchBody(body, SAFE_CONFIG_KEYS);

      expect(result.error).toBe('Missing or invalid "path" in request body');
      expect(result.status).toBe(400);
    });

    it('should reject missing value', () => {
      const body = {
        path: 'ai.enabled',
      };

      const result = validateConfigPatchBody(body, SAFE_CONFIG_KEYS);

      expect(result.error).toBe('Missing "value" in request body');
      expect(result.status).toBe(400);
    });

    it('should allow null or false as values', () => {
      const bodyNull = {
        path: 'welcome.channelId',
        value: null,
      };

      const resultNull = validateConfigPatchBody(bodyNull, SAFE_CONFIG_KEYS);
      expect(resultNull.error).toBeUndefined();
      expect(resultNull.value).toBe(null);

      const bodyFalse = {
        path: 'ai.enabled',
        value: false,
      };

      const resultFalse = validateConfigPatchBody(bodyFalse, SAFE_CONFIG_KEYS);
      expect(resultFalse.error).toBeUndefined();
      expect(resultFalse.value).toBe(false);
    });

    it('should reject unsafe top-level keys', () => {
      const body = {
        path: 'permissions.botOwners',
        value: ['user123'],
      };

      const result = validateConfigPatchBody(body, SAFE_CONFIG_KEYS);

      expect(result.error).toBe('Modifying this config key is not allowed');
      expect(result.status).toBe(403);
    });

    it('should reject paths without dot separator', () => {
      const body = {
        path: 'ai',
        value: {},
      };

      const result = validateConfigPatchBody(body, SAFE_CONFIG_KEYS);

      expect(result.error).toContain('must include at least one dot separator');
      expect(result.status).toBe(400);
    });

    it('should reject paths with empty segments', () => {
      const body = {
        path: 'ai..enabled',
        value: true,
      };

      const result = validateConfigPatchBody(body, SAFE_CONFIG_KEYS);

      expect(result.error).toBe('Config path contains empty segments');
      expect(result.status).toBe(400);
    });

    it('should reject paths exceeding 200 characters', () => {
      const longPath = 'ai.' + 'a'.repeat(200);
      const body = {
        path: longPath,
        value: true,
      };

      const result = validateConfigPatchBody(body, SAFE_CONFIG_KEYS);

      expect(result.error).toBe('Config path exceeds maximum length of 200 characters');
      expect(result.status).toBe(400);
    });

    it('should reject paths exceeding 10 segments', () => {
      const deepPath = 'ai.a.b.c.d.e.f.g.h.i.j';
      const body = {
        path: deepPath,
        value: true,
      };

      const result = validateConfigPatchBody(body, SAFE_CONFIG_KEYS);

      expect(result.error).toBe('Config path exceeds maximum depth of 10 segments');
      expect(result.status).toBe(400);
    });

    it('should handle nested paths correctly', () => {
      const body = {
        path: 'triage.classifyModel',
        value: 'claude-3-haiku',
      };

      const result = validateConfigPatchBody(body, SAFE_CONFIG_KEYS);

      expect(result.error).toBeUndefined();
      expect(result.path).toBe('triage.classifyModel');
      expect(result.value).toBe('claude-3-haiku');
      expect(result.topLevelKey).toBe('triage');
    });

    it('should handle deeply nested paths', () => {
      const body = {
        path: 'moderation.logging.channels.default',
        value: 'channel123',
      };

      const result = validateConfigPatchBody(body, SAFE_CONFIG_KEYS);

      expect(result.error).toBeUndefined();
      expect(result.path).toBe('moderation.logging.channels.default');
      expect(result.value).toBe('channel123');
      expect(result.topLevelKey).toBe('moderation');
    });

    it('should handle null body', () => {
      const result = validateConfigPatchBody(null, SAFE_CONFIG_KEYS);

      expect(result.error).toBe('Missing or invalid "path" in request body');
      expect(result.status).toBe(400);
    });

    it('should handle empty object body', () => {
      const result = validateConfigPatchBody({}, SAFE_CONFIG_KEYS);

      expect(result.error).toBe('Missing or invalid "path" in request body');
      expect(result.status).toBe(400);
    });

    it('should handle array values', () => {
      const body = {
        path: 'ai.channels',
        value: ['channel1', 'channel2'],
      };

      const result = validateConfigPatchBody(body, SAFE_CONFIG_KEYS);

      expect(result.error).toBeUndefined();
      expect(Array.isArray(result.value)).toBe(true);
      expect(result.value).toEqual(['channel1', 'channel2']);
    });

    it('should handle object values', () => {
      const body = {
        path: 'welcome.dynamic',
        value: {
          enabled: true,
          timezone: 'UTC',
        },
      };

      const result = validateConfigPatchBody(body, SAFE_CONFIG_KEYS);

      expect(result.error).toBeUndefined();
      expect(typeof result.value).toBe('object');
      expect(result.value.enabled).toBe(true);
    });

    it('should handle number values', () => {
      const body = {
        path: 'ai.historyLength',
        value: 20,
      };

      const result = validateConfigPatchBody(body, SAFE_CONFIG_KEYS);

      expect(result.error).toBeUndefined();
      expect(result.value).toBe(20);
    });

    it('should handle string values', () => {
      const body = {
        path: 'ai.systemPrompt',
        value: 'You are a helpful assistant',
      };

      const result = validateConfigPatchBody(body, SAFE_CONFIG_KEYS);

      expect(result.error).toBeUndefined();
      expect(result.value).toBe('You are a helpful assistant');
    });

    it('should handle empty string path', () => {
      const body = {
        path: '',
        value: true,
      };

      const result = validateConfigPatchBody(body, SAFE_CONFIG_KEYS);

      expect(result.error).toBe('Missing or invalid "path" in request body');
      expect(result.status).toBe(400);
    });

    it('should handle path with trailing dot', () => {
      const body = {
        path: 'ai.enabled.',
        value: true,
      };

      const result = validateConfigPatchBody(body, SAFE_CONFIG_KEYS);

      expect(result.error).toBe('Config path contains empty segments');
      expect(result.status).toBe(400);
    });

    it('should handle path with leading dot', () => {
      const body = {
        path: '.ai.enabled',
        value: true,
      };

      const result = validateConfigPatchBody(body, SAFE_CONFIG_KEYS);

      expect(result.error).toBe('Config path contains empty segments');
      expect(result.status).toBe(400);
    });
  });
});