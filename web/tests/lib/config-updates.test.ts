import { describe, expect, it } from 'vitest';
import type { GuildConfig } from '@/lib/config-utils';
import {
  updateSectionEnabled,
  updateSectionField,
  updateNestedField,
  updateArrayItem,
  removeArrayItem,
  appendArrayItem,
} from '@/lib/config-updates';

describe('config-updates', () => {
  const baseConfig: GuildConfig = {
    ai: { enabled: false, systemPrompt: '' },
    welcome: {
      enabled: true,
      message: 'Hello!',
      roleMenu: {
        enabled: false,
        options: [
          { id: '1', label: 'Option 1', roleId: 'role-1' },
          { id: '2', label: 'Option 2', roleId: 'role-2' },
        ],
      },
    },
    moderation: {
      enabled: false,
      rateLimit: {
        enabled: true,
        maxMessages: 10,
      },
    },
  };

  describe('updateSectionEnabled', () => {
    it('updates section enabled flag', () => {
      const result = updateSectionEnabled(baseConfig, 'ai', true);
      expect(result.ai?.enabled).toBe(true);
    });

    it('preserves other section fields', () => {
      const result = updateSectionEnabled(baseConfig, 'ai', true);
      expect(result.ai?.systemPrompt).toBe('');
    });

    it('creates section if it does not exist', () => {
      const config: GuildConfig = {};
      const result = updateSectionEnabled(config, 'starboard', true);
      expect(result.starboard?.enabled).toBe(true);
    });

    it('does not mutate original config', () => {
      const original = { ...baseConfig };
      updateSectionEnabled(baseConfig, 'ai', true);
      expect(baseConfig.ai?.enabled).toBe(original.ai?.enabled);
    });
  });

  describe('updateSectionField', () => {
    it('updates a field within a section', () => {
      const result = updateSectionField(baseConfig, 'welcome', 'message', 'New message');
      expect(result.welcome?.message).toBe('New message');
    });

    it('preserves other fields in the section', () => {
      const result = updateSectionField(baseConfig, 'welcome', 'message', 'New message');
      expect(result.welcome?.enabled).toBe(true);
    });

    it('creates section if it does not exist', () => {
      const config: GuildConfig = {};
      const result = updateSectionField(config, 'permissions', 'adminRoleId', '123');
      expect(result.permissions?.adminRoleId).toBe('123');
    });
  });

  describe('updateNestedField', () => {
    it('updates a nested field', () => {
      const result = updateNestedField(baseConfig, 'moderation', 'rateLimit', 'maxMessages', 20);
      expect(result.moderation?.rateLimit?.maxMessages).toBe(20);
    });

    it('preserves sibling nested fields', () => {
      const result = updateNestedField(baseConfig, 'moderation', 'rateLimit', 'maxMessages', 20);
      expect(result.moderation?.rateLimit?.enabled).toBe(true);
    });

    it('creates nested object if it does not exist', () => {
      const config: GuildConfig = { moderation: { enabled: true } };
      const result = updateNestedField(config, 'moderation', 'linkFilter', 'enabled', true);
      expect(result.moderation?.linkFilter?.enabled).toBe(true);
    });
  });

  describe('updateArrayItem', () => {
    it('updates an item at specified index', () => {
      const newOption = { id: '1', label: 'Updated', roleId: 'role-1' };
      const result = updateArrayItem(
        baseConfig,
        'welcome',
        ['roleMenu', 'options'],
        0,
        newOption,
      );
      expect(result.welcome?.roleMenu?.options?.[0]).toEqual(newOption);
    });

    it('preserves other array items', () => {
      const newOption = { id: '1', label: 'Updated', roleId: 'role-1' };
      const result = updateArrayItem(
        baseConfig,
        'welcome',
        ['roleMenu', 'options'],
        0,
        newOption,
      );
      expect(result.welcome?.roleMenu?.options?.[1]).toEqual(baseConfig.welcome?.roleMenu?.options?.[1]);
    });

    it('creates array if it does not exist', () => {
      const config: GuildConfig = { welcome: { enabled: true } };
      const newOption = { id: '1', label: 'New', roleId: 'role-1' };
      const result = updateArrayItem(config, 'welcome', ['roleMenu', 'options'], 0, newOption);
      expect(result.welcome?.roleMenu?.options).toHaveLength(1);
      expect(result.welcome?.roleMenu?.options?.[0]).toEqual(newOption);
    });
  });

  describe('removeArrayItem', () => {
    it('removes item at specified index', () => {
      const result = removeArrayItem(baseConfig, 'welcome', ['roleMenu', 'options'], 0);
      expect(result.welcome?.roleMenu?.options).toHaveLength(1);
      expect(result.welcome?.roleMenu?.options?.[0].id).toBe('2');
    });

    it('handles removing last item', () => {
      const config: GuildConfig = {
        welcome: {
          roleMenu: {
            options: [{ id: '1', label: 'Only', roleId: 'role-1' }],
          },
        },
      };
      const result = removeArrayItem(config, 'welcome', ['roleMenu', 'options'], 0);
      expect(result.welcome?.roleMenu?.options).toHaveLength(0);
    });

    it('handles empty array gracefully', () => {
      const config: GuildConfig = { welcome: { roleMenu: { options: [] } } };
      const result = removeArrayItem(config, 'welcome', ['roleMenu', 'options'], 0);
      expect(result.welcome?.roleMenu?.options).toHaveLength(0);
    });
  });

  describe('appendArrayItem', () => {
    it('appends item to array', () => {
      const newOption = { id: '3', label: 'Option 3', roleId: 'role-3' };
      const result = appendArrayItem(baseConfig, 'welcome', ['roleMenu', 'options'], newOption);
      expect(result.welcome?.roleMenu?.options).toHaveLength(3);
      expect(result.welcome?.roleMenu?.options?.[2]).toEqual(newOption);
    });

    it('creates array if it does not exist', () => {
      const config: GuildConfig = { welcome: { enabled: true } };
      const newOption = { id: '1', label: 'First', roleId: 'role-1' };
      const result = appendArrayItem(config, 'welcome', ['roleMenu', 'options'], newOption);
      expect(result.welcome?.roleMenu?.options).toHaveLength(1);
      expect(result.welcome?.roleMenu?.options?.[0]).toEqual(newOption);
    });

    it('preserves existing items', () => {
      const newOption = { id: '3', label: 'Option 3', roleId: 'role-3' };
      const result = appendArrayItem(baseConfig, 'welcome', ['roleMenu', 'options'], newOption);
      expect(result.welcome?.roleMenu?.options?.[0]).toEqual(baseConfig.welcome?.roleMenu?.options?.[0]);
      expect(result.welcome?.roleMenu?.options?.[1]).toEqual(baseConfig.welcome?.roleMenu?.options?.[1]);
    });
  });
});
