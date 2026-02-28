import { describe, expect, it } from 'vitest';

import {
  CONFIG_SCHEMA,
  validateSingleValue,
  validateValue,
} from '../../../src/api/utils/configValidation.js';

describe('configValidation', () => {
  describe('validateValue', () => {
    it('should accept valid boolean', () => {
      const errors = validateValue(true, { type: 'boolean' }, 'test');
      expect(errors).toEqual([]);
    });

    it('should reject wrong type', () => {
      const errors = validateValue('hello', { type: 'boolean' }, 'test');
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('expected boolean');
    });

    it('should accept null for nullable fields', () => {
      const errors = validateValue(null, { type: 'string', nullable: true }, 'test');
      expect(errors).toEqual([]);
    });

    it('should reject null for non-nullable fields', () => {
      const errors = validateValue(null, { type: 'string' }, 'test');
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('must not be null');
    });

    it('should reject unknown keys in objects', () => {
      const schema = { type: 'object', properties: { enabled: { type: 'boolean' } } };
      const errors = validateValue({ enabled: true, fake: 'bad' }, schema, 'test');
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('unknown config key');
    });
  });

  describe('validateSingleValue', () => {
    it('should validate a known path', () => {
      const errors = validateSingleValue('ai.enabled', true);
      expect(errors).toEqual([]);
    });

    it('should reject invalid type for known path', () => {
      const errors = validateSingleValue('ai.enabled', 'not-a-bool');
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('expected boolean');
    });

    it('should return error for unknown nested path', () => {
      const errors = validateSingleValue('ai.fakeKey', true);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('Unknown config path');
    });

    it('should return empty array for unknown top-level section', () => {
      const errors = validateSingleValue('unknownSection.key', true);
      expect(errors).toEqual([]);
    });

    it('should validate NaN as invalid number', () => {
      const errors = validateSingleValue('triage.timeout', NaN);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('expected finite number');
    });

    it('should validate new welcome onboarding fields', () => {
      expect(validateSingleValue('welcome.rulesChannel', null)).toEqual([]);
      expect(validateSingleValue('welcome.verifiedRole', '123')).toEqual([]);
      expect(validateSingleValue('welcome.roleMenu.enabled', true)).toEqual([]);
      expect(validateSingleValue('welcome.dmSequence.steps', ['hi', 'there'])).toEqual([]);
    });
  });

  describe('CONFIG_SCHEMA', () => {
    it('should have schemas for all expected top-level sections', () => {
      expect(Object.keys(CONFIG_SCHEMA)).toEqual(
        expect.arrayContaining(['ai', 'welcome', 'spam', 'moderation', 'triage']),
      );
    });
  });
});
