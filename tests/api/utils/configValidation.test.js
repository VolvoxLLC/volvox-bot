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

    it('should validate nested object arrays using item properties', () => {
      const schema = {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['Playing', 'Watching'] },
            text: { type: 'string', minLength: 1 },
          },
          required: ['text'],
        },
      };

      expect(validateValue([{ type: 'Watching', text: 'ready' }], schema, 'test')).toEqual([]);
      expect(validateValue([{ type: 'Bad', text: 'ready' }], schema, 'test')[0]).toContain(
        'must be one of',
      );
      expect(validateValue([{ type: 'Watching', text: '' }], schema, 'test')[0]).toContain(
        'at least 1 characters',
      );
      expect(
        validateValue([{ type: 'Watching', text: 'ready', extra: true }], schema, 'test')[0],
      ).toContain('unknown config key');
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

    it('should accept valid welcome.introChannel string', () => {
      expect(validateSingleValue('welcome.introChannel', '123456')).toEqual([]);
    });

    it('should accept null welcome.introChannel', () => {
      expect(validateSingleValue('welcome.introChannel', null)).toEqual([]);
    });

    it('should reject malformed roleMenu.options items', () => {
      const errors = validateSingleValue('welcome.roleMenu', {
        enabled: true,
        options: [{ label: 'Test' }],
      });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes('missing required key "roleId"'))).toBe(true);
    });

    it('should reject dmSequence.steps as non-array', () => {
      const errors = validateSingleValue('welcome.dmSequence', {
        enabled: true,
        steps: 'not-an-array',
      });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes('expected array'))).toBe(true);
    });
  });

  describe('CONFIG_SCHEMA', () => {
    it('should have schemas for all expected top-level sections', () => {
      expect(Object.keys(CONFIG_SCHEMA)).toEqual(
        expect.arrayContaining([
          'ai',
          'welcome',
          'spam',
          'moderation',
          'triage',
          'auditLog',
          'botStatus',
          'xp',
        ]),
      );
    });
  });

  describe('number range validation', () => {
    it('should reject numbers below minimum', () => {
      const errors = validateValue(0, { type: 'number', min: 1, max: 100 }, 'test');
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('>= 1');
    });

    it('should reject numbers above maximum', () => {
      const errors = validateValue(101, { type: 'number', min: 1, max: 100 }, 'test');
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('<= 100');
    });

    it('should accept numbers within range', () => {
      expect(validateValue(1, { type: 'number', min: 1, max: 100 }, 'test')).toEqual([]);
      expect(validateValue(50, { type: 'number', min: 1, max: 100 }, 'test')).toEqual([]);
      expect(validateValue(100, { type: 'number', min: 1, max: 100 }, 'test')).toEqual([]);
    });

    it('should enforce ai.historyLength range', () => {
      expect(validateSingleValue('ai.historyLength', 0)).toEqual(
        expect.arrayContaining([expect.stringContaining('>= 1')]),
      );
      expect(validateSingleValue('ai.historyLength', 101)).toEqual(
        expect.arrayContaining([expect.stringContaining('<= 100')]),
      );
      expect(validateSingleValue('ai.historyLength', 50)).toEqual([]);
    });

    it('should enforce auditLog.retentionDays range', () => {
      expect(validateSingleValue('auditLog.retentionDays', 0)).toEqual(
        expect.arrayContaining([expect.stringContaining('>= 1')]),
      );
      expect(validateSingleValue('auditLog.retentionDays', 366)).toEqual(
        expect.arrayContaining([expect.stringContaining('<= 365')]),
      );
      expect(validateSingleValue('auditLog.retentionDays', 90)).toEqual([]);
    });

    it('should enforce reminders.maxPerUser range', () => {
      expect(validateSingleValue('reminders.maxPerUser', 0)).toEqual(
        expect.arrayContaining([expect.stringContaining('>= 1')]),
      );
      expect(validateSingleValue('reminders.maxPerUser', 50)).toEqual([]);
    });

    it('should enforce voice.xpPerMinute range', () => {
      expect(validateSingleValue('voice.xpPerMinute', -1)).toEqual(
        expect.arrayContaining([expect.stringContaining('>= 0')]),
      );
      expect(validateSingleValue('voice.xpPerMinute', 1001)).toEqual(
        expect.arrayContaining([expect.stringContaining('<= 1000')]),
      );
      expect(validateSingleValue('voice.xpPerMinute', 5)).toEqual([]);
    });
  });

  describe('string constraint validation', () => {
    it('should reject strings exceeding maxLength', () => {
      const errors = validateValue('x'.repeat(4001), { type: 'string', maxLength: 4000 }, 'test');
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('max length');
    });

    it('should accept strings within maxLength', () => {
      expect(validateValue('x'.repeat(4000), { type: 'string', maxLength: 4000 }, 'test')).toEqual(
        [],
      );
    });

    it('should enforce ai.systemPrompt maxLength', () => {
      expect(validateSingleValue('ai.systemPrompt', 'x'.repeat(4001))).toEqual(
        expect.arrayContaining([expect.stringContaining('max length')]),
      );
      expect(validateSingleValue('ai.systemPrompt', 'You are a helpful bot')).toEqual([]);
    });

    it('should enforce enum constraint on ai.defaultChannelMode', () => {
      expect(validateSingleValue('ai.defaultChannelMode', 'off')).toEqual([]);
      expect(validateSingleValue('ai.defaultChannelMode', 'mention')).toEqual([]);
      expect(validateSingleValue('ai.defaultChannelMode', 'vibe')).toEqual([]);
      expect(validateSingleValue('ai.defaultChannelMode', 'invalid')).toEqual(
        expect.arrayContaining([expect.stringContaining('must be one of')]),
      );
    });
  });

  describe('openProperties support', () => {
    it('should allow unknown keys in open-properties objects', () => {
      const errors = validateValue(
        { 12345: 'vibe', 67890: 'mention' },
        { type: 'object', openProperties: true },
        'test',
      );
      expect(errors).toEqual([]);
    });

    it('should validate ai.channelModes as open-properties', () => {
      expect(validateSingleValue('ai.channelModes', { 12345: 'vibe' })).toEqual([]);
    });

    it('should resolve nested dynamic keys in validateSingleValue (channelModes path)', () => {
      // channelModes has openProperties — any channel-ID sub-key is dynamic;
      // the value is validated against the parent object schema, so an object passes
      expect(validateSingleValue('ai.channelModes.12345', { mode: 'vibe' })).toEqual([]);
    });
  });

  describe('botStatus schema validation', () => {
    it('should accept valid botStatus rotation settings', () => {
      expect(validateSingleValue('botStatus.enabled', true)).toEqual([]);
      expect(validateSingleValue('botStatus.status', 'online')).toEqual([]);
      expect(validateSingleValue('botStatus.rotation.enabled', false)).toEqual([]);
      expect(validateSingleValue('botStatus.rotation.intervalMinutes', 5)).toEqual([]);
      expect(
        validateSingleValue('botStatus.rotation.messages', [
          { type: 'Watching', text: '{guildCount} servers' },
        ]),
      ).toEqual([]);
    });

    it('should reject invalid botStatus status value', () => {
      const errors = validateSingleValue('botStatus.status', 'busy');
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('must be one of');
    });

    it('should reject rotation messages missing text', () => {
      const errors = validateSingleValue('botStatus.rotation.messages', [{ type: 'Watching' }]);
      expect(errors.some((e) => e.includes('missing required key "text"'))).toBe(true);
    });

    it('should reject rotation messages with invalid type', () => {
      const errors = validateSingleValue('botStatus.rotation.messages', [
        { type: 'Dancing', text: '{guildCount} servers' },
      ]);
      expect(errors.some((e) => e.includes('must be one of'))).toBe(true);
    });

    it('should reject rotation messages with blank text', () => {
      const errors = validateSingleValue('botStatus.rotation.messages', [
        { type: 'Watching', text: '' },
      ]);
      expect(errors.some((e) => e.includes('at least 1 characters'))).toBe(true);
    });

    it('should reject rotation messages with unknown keys', () => {
      const errors = validateSingleValue('botStatus.rotation.messages', [
        { type: 'Watching', text: '{guildCount} servers', extra: true },
      ]);
      expect(errors.some((e) => e.includes('unknown config key'))).toBe(true);
    });
  });

  describe('auditLog schema validation', () => {
    it('should accept valid auditLog.enabled boolean', () => {
      expect(validateSingleValue('auditLog.enabled', true)).toEqual([]);
      expect(validateSingleValue('auditLog.enabled', false)).toEqual([]);
    });

    it('should reject non-boolean auditLog.enabled', () => {
      const errors = validateSingleValue('auditLog.enabled', 'yes');
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('expected boolean');
    });

    it('should accept valid auditLog.retentionDays number', () => {
      expect(validateSingleValue('auditLog.retentionDays', 90)).toEqual([]);
      expect(validateSingleValue('auditLog.retentionDays', 365)).toEqual([]);
    });

    it('should reject non-number auditLog.retentionDays', () => {
      const errors = validateSingleValue('auditLog.retentionDays', '90');
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('expected finite number');
    });

    it('should reject NaN auditLog.retentionDays', () => {
      const errors = validateSingleValue('auditLog.retentionDays', NaN);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('expected finite number');
    });

    it('should reject unknown keys in auditLog object', () => {
      const errors = validateSingleValue('auditLog', {
        enabled: true,
        retentionDays: 90,
        badKey: 'nope',
      });
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('unknown config key');
    });
  });

  describe('xp schema validation', () => {
    it('should accept valid xp.enabled boolean', () => {
      expect(validateSingleValue('xp.enabled', true)).toEqual([]);
      expect(validateSingleValue('xp.enabled', false)).toEqual([]);
    });

    it('should reject non-boolean xp.enabled', () => {
      const errors = validateSingleValue('xp.enabled', 'yes');
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('expected boolean');
    });

    it('should accept valid xp.levelThresholds array', () => {
      expect(validateSingleValue('xp.levelThresholds', [100, 300, 600])).toEqual([]);
    });

    it('should reject non-array xp.levelThresholds', () => {
      const errors = validateSingleValue('xp.levelThresholds', 'bad');
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('expected array');
    });

    it('should reject negative numbers in xp.levelThresholds', () => {
      const errors = validateSingleValue('xp.levelThresholds', [-1, 100]);
      expect(errors.some((e) => e.includes('>= 0'))).toBe(true);
    });

    it('should accept valid xp.levelActions array', () => {
      const actions = [
        { level: 5, actions: [{ type: 'grantRole', roleId: '123' }] },
        { level: 10, actions: [{ type: 'removeRole', roleId: '456' }] },
      ];
      expect(validateSingleValue('xp.levelActions', actions)).toEqual([]);
    });

    it('should reject levelActions missing required keys', () => {
      const errors = validateSingleValue('xp.levelActions', [{ actions: [] }]);
      expect(errors.some((e) => e.includes('missing required key "level"'))).toBe(true);
    });

    it('should reject levelActions with missing actions key', () => {
      const errors = validateSingleValue('xp.levelActions', [{ level: 5 }]);
      expect(errors.some((e) => e.includes('missing required key "actions"'))).toBe(true);
    });

    it('should reject levelActions with level out of range', () => {
      const errors = validateSingleValue('xp.levelActions', [
        { level: 0, actions: [{ type: 'grantRole' }] },
      ]);
      expect(errors.some((e) => e.includes('>= 1'))).toBe(true);
    });

    it('should reject levelActions with level above max', () => {
      const errors = validateSingleValue('xp.levelActions', [
        { level: 1001, actions: [{ type: 'grantRole' }] },
      ]);
      expect(errors.some((e) => e.includes('<= 1000'))).toBe(true);
    });

    it('should reject actions missing type', () => {
      const errors = validateSingleValue('xp.levelActions', [
        { level: 5, actions: [{ roleId: '123' }] },
      ]);
      expect(errors.some((e) => e.includes('missing required key "type"'))).toBe(true);
    });

    it('should accept actions with extra properties (openProperties)', () => {
      const actions = [
        { level: 5, actions: [{ type: 'grantRole', roleId: '123', extraField: 'ok' }] },
      ];
      expect(validateSingleValue('xp.levelActions', actions)).toEqual([]);
    });

    it('should accept valid xp.defaultActions array', () => {
      expect(
        validateSingleValue('xp.defaultActions', [{ type: 'grantRole', roleId: '123' }]),
      ).toEqual([]);
    });

    it('should reject defaultActions missing type', () => {
      const errors = validateSingleValue('xp.defaultActions', [{ roleId: '123' }]);
      expect(errors.some((e) => e.includes('missing required key "type"'))).toBe(true);
    });

    it('should accept valid xp.roleRewards object', () => {
      expect(
        validateSingleValue('xp.roleRewards', { stackRoles: true, removeOnLevelDown: false }),
      ).toEqual([]);
    });

    it('should reject non-boolean roleRewards.stackRoles', () => {
      const errors = validateSingleValue('xp.roleRewards', { stackRoles: 'yes' });
      expect(errors.some((e) => e.includes('expected boolean'))).toBe(true);
    });

    it('should reject non-boolean roleRewards.removeOnLevelDown', () => {
      const errors = validateSingleValue('xp.roleRewards', { removeOnLevelDown: 1 });
      expect(errors.some((e) => e.includes('expected boolean'))).toBe(true);
    });

    it('should reject unknown keys in xp object', () => {
      const errors = validateSingleValue('xp', { enabled: true, badKey: 'nope' });
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('unknown config key');
    });
  });
});
