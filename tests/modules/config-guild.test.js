/**
 * Per-Guild Configuration Tests
 * Tests guild isolation, deep merge, fallback to global, and multi-tenancy behavior
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

// Mock db module
vi.mock('../../src/db.js', () => ({
  getPool: vi.fn(),
}));

// Mock fs
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

describe('per-guild configuration', () => {
  let configModule;

  beforeEach(async () => {
    vi.resetModules();

    const { existsSync: mockExists, readFileSync: mockRead } = await import('node:fs');
    mockExists.mockReturnValue(true);
    mockRead.mockReturnValue(
      JSON.stringify({
        ai: { enabled: true, model: 'claude-3', historyLength: 20 },
        spam: { enabled: false, threshold: 5 },
        moderation: { enabled: true, logging: { channels: {} } },
        welcome: { enabled: false, channelId: null },
      }),
    );

    // DB not available — in-memory only
    const { getPool: mockGetPool } = await import('../../src/db.js');
    mockGetPool.mockImplementation(() => {
      throw new Error('no db');
    });

    configModule = await import('../../src/modules/config.js');
    await configModule.loadConfig();
  });

  afterEach(() => {
    configModule.clearConfigListeners();
    vi.restoreAllMocks();
  });

  describe('getConfig backward compatibility', () => {
    it('should return global config when called with no arguments', () => {
      const config = configModule.getConfig();
      expect(config).toBeDefined();
      expect(config.ai.model).toBe('claude-3');
      expect(config.ai.enabled).toBe(true);
    });

    it('should return global config when called with "global"', () => {
      const config = configModule.getConfig('global');
      expect(config.ai.model).toBe('claude-3');
    });

    it('should return global config when called with undefined', () => {
      const config = configModule.getConfig(undefined);
      expect(config.ai.model).toBe('claude-3');
    });

    it('should return mutable cache reference for global path (intentional)', () => {
      const config1 = configModule.getConfig();
      config1.ai.model = 'mutated-model';

      const config2 = configModule.getConfig();
      // Global returns live reference — mutations are visible (documented contract)
      expect(config2.ai.model).toBe('mutated-model');
    });
  });

  describe('merged cache generation tracking', () => {
    it('should invalidate guild merged cache when global config changes via setConfigValue', async () => {
      // Populate merged cache for guild-x
      const before = configModule.getConfig('guild-x');
      expect(before.ai.model).toBe('claude-3');

      // Change global config through the proper API
      await configModule.setConfigValue('ai.model', 'claude-4');

      // Guild merged cache should reflect the new global value
      const after = configModule.getConfig('guild-x');
      expect(after.ai.model).toBe('claude-4');
    });

    it('should invalidate guild merged cache when global config is reset', async () => {
      await configModule.setConfigValue('ai.model', 'temporary-model');
      // Populate merged cache
      const before = configModule.getConfig('guild-y');
      expect(before.ai.model).toBe('temporary-model');

      // Reset global to defaults
      await configModule.resetConfig('ai');

      // Guild should see the reset value
      const after = configModule.getConfig('guild-y');
      expect(after.ai.model).toBe('claude-3');
    });
  });

  describe('guild isolation', () => {
    it('should isolate changes between guilds', async () => {
      await configModule.setConfigValue('ai.model', 'guild-a-model', 'guild-a');
      await configModule.setConfigValue('ai.model', 'guild-b-model', 'guild-b');

      const configA = configModule.getConfig('guild-a');
      const configB = configModule.getConfig('guild-b');
      const configGlobal = configModule.getConfig();

      expect(configA.ai.model).toBe('guild-a-model');
      expect(configB.ai.model).toBe('guild-b-model');
      expect(configGlobal.ai.model).toBe('claude-3');
    });

    it('should not leak guild changes to global config', async () => {
      await configModule.setConfigValue('ai.maxTokens', '2048', 'guild-a');

      const global = configModule.getConfig();
      expect(global.ai.maxTokens).toBeUndefined();

      const guildA = configModule.getConfig('guild-a');
      expect(guildA.ai.maxTokens).toBe(2048);
    });

    it('should not leak guild changes to other guilds', async () => {
      await configModule.setConfigValue('spam.threshold', '10', 'guild-a');

      const guildB = configModule.getConfig('guild-b');
      expect(guildB.spam.threshold).toBe(5); // Global default
    });
  });

  describe('deep merge behavior', () => {
    it('should deep merge guild overrides with global defaults', async () => {
      // Set only one key in the ai section for guild-a
      await configModule.setConfigValue('ai.model', 'guild-model', 'guild-a');

      const config = configModule.getConfig('guild-a');
      // Overridden key
      expect(config.ai.model).toBe('guild-model');
      // Non-overridden keys from global
      expect(config.ai.enabled).toBe(true);
      expect(config.ai.historyLength).toBe(20);
    });

    it('should not replace entire sections with guild overrides', async () => {
      await configModule.setConfigValue('moderation.logging.channels.default', '12345', 'guild-a');

      const config = configModule.getConfig('guild-a');
      // The moderation section should still have enabled from global
      expect(config.moderation.enabled).toBe(true);
    });

    it('should return a new object for each getConfig call (no shared refs)', async () => {
      await configModule.setConfigValue('ai.model', 'guild-model', 'guild-a');

      const config1 = configModule.getConfig('guild-a');
      const config2 = configModule.getConfig('guild-a');

      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2);
    });
  });

  describe('prototype pollution protection', () => {
    it('should skip dangerous keys during deep merge', async () => {
      const guildId = 'guild-proto-pollution';
      delete Object.prototype.polluted;

      try {
        // Directly inject a guild override with __proto__ key into the cache
        // to simulate a malicious value that bypassed path validation
        await configModule.setConfigValue('ai.model', 'safe-model', guildId);

        // Set a value whose parsed JSON contains __proto__ — this is the attack vector.
        // When deepMerge iterates the guild override, it must skip __proto__.
        await configModule.setConfigValue(
          'ai.threadMode',
          '{"__proto__":{"polluted":"yes"}}',
          guildId,
        );

        // Trigger deepMerge by requesting guild config
        configModule.getConfig(guildId);

        // Object.prototype should NOT be polluted
        expect(Object.prototype.polluted).toBeUndefined();
      } finally {
        await configModule.resetConfig('ai', guildId);
        delete Object.prototype.polluted;
      }
    });

    it('should skip constructor and prototype keys during deep merge', async () => {
      const guildId = 'guild-constructor-pollution';

      try {
        const dangerousJson = '{"constructor":{"polluted":true},"prototype":{"evil":true}}';
        await configModule.setConfigValue('ai.threadMode', dangerousJson, guildId);

        const config = configModule.getConfig(guildId);

        // The dangerous keys should not appear in the merged result's ai section
        expect(config.ai.constructor).toBe(Object); // Should be the native constructor, not overridden
        expect(config.ai.prototype).toBeUndefined();
      } finally {
        await configModule.resetConfig('ai', guildId);
      }
    });

    it('should filter dangerous nested keys in recursive deepMerge branches', async () => {
      const guildId = 'guild-recursive-pollution';
      delete Object.prototype.polluted;

      try {
        await configModule.setConfigValue(
          'ai.threadMode',
          '{"nested":{"baseline":"global","safeGlobal":true}}',
        );
        await configModule.setConfigValue(
          'ai.threadMode',
          '{"nested":{"safeGuild":true,"__proto__":{"polluted":"yes"},"constructor":{"prototype":{"polluted":"yes"}},"prototype":{"polluted":true}}}',
          guildId,
        );

        const config = configModule.getConfig(guildId);
        const nested = config.ai.threadMode.nested;

        expect(nested.baseline).toBe('global');
        expect(nested.safeGlobal).toBe(true);
        expect(nested.safeGuild).toBe(true);

        expect(Object.hasOwn(nested, '__proto__')).toBe(false);
        expect(nested.constructor).toBe(Object);
        expect(nested.prototype).toBeUndefined();
        expect(Object.prototype.polluted).toBeUndefined();
      } finally {
        await configModule.resetConfig('ai', guildId);
        await configModule.resetConfig('ai');
        delete Object.prototype.polluted;
      }
    });
  });

  describe('fallback to global defaults', () => {
    it('should return global defaults for unknown guild', () => {
      const config = configModule.getConfig('unknown-guild');
      expect(config.ai.model).toBe('claude-3');
      expect(config.spam.threshold).toBe(5);
    });

    it('should return cloned global for guild with no overrides', () => {
      const guildConfig = configModule.getConfig('no-overrides-guild');
      const globalConfig = configModule.getConfig();

      expect(guildConfig).toEqual(globalConfig);
      // Should be a clone, not the same reference
      expect(guildConfig).not.toBe(globalConfig);
    });
  });

  describe('setConfigValue with guildId', () => {
    it('should default to global when no guildId provided', async () => {
      await configModule.setConfigValue('ai.model', 'new-global-model');

      const global = configModule.getConfig();
      expect(global.ai.model).toBe('new-global-model');
    });

    it('should write to guild-specific config', async () => {
      await configModule.setConfigValue('ai.model', 'guild-model', 'guild-123');

      const guildConfig = configModule.getConfig('guild-123');
      expect(guildConfig.ai.model).toBe('guild-model');
    });

    it('should emit config change events with guildId', async () => {
      const cb = vi.fn();
      configModule.onConfigChange('ai.model', cb);

      await configModule.setConfigValue('ai.model', 'new-model', 'guild-123');

      expect(cb).toHaveBeenCalledWith('new-model', undefined, 'ai.model', 'guild-123');
    });

    it('should emit global guildId for global changes', async () => {
      const cb = vi.fn();
      configModule.onConfigChange('ai.model', cb);

      await configModule.setConfigValue('ai.model', 'new-model');

      expect(cb).toHaveBeenCalledWith('new-model', 'claude-3', 'ai.model', 'global');
    });
  });

  describe('resetConfig with guildId', () => {
    it('should reset guild section overrides', async () => {
      await configModule.setConfigValue('ai.model', 'guild-model', 'guild-a');
      await configModule.setConfigValue('ai.maxTokens', '2048', 'guild-a');

      await configModule.resetConfig('ai', 'guild-a');

      const config = configModule.getConfig('guild-a');
      // Should fall back to global defaults
      expect(config.ai.model).toBe('claude-3');
      expect(config.ai.maxTokens).toBeUndefined();
    });

    it('should reset all guild overrides', async () => {
      await configModule.setConfigValue('ai.model', 'guild-model', 'guild-a');
      await configModule.setConfigValue('spam.threshold', '10', 'guild-a');

      await configModule.resetConfig(undefined, 'guild-a');

      const config = configModule.getConfig('guild-a');
      expect(config.ai.model).toBe('claude-3');
      expect(config.spam.threshold).toBe(5);
    });

    it('should not affect other guilds when resetting one guild', async () => {
      await configModule.setConfigValue('ai.model', 'guild-a-model', 'guild-a');
      await configModule.setConfigValue('ai.model', 'guild-b-model', 'guild-b');

      await configModule.resetConfig(undefined, 'guild-a');

      const configA = configModule.getConfig('guild-a');
      const configB = configModule.getConfig('guild-b');

      expect(configA.ai.model).toBe('claude-3'); // Reset to global
      expect(configB.ai.model).toBe('guild-b-model'); // Unchanged
    });

    it('should reset global config to config.json defaults', async () => {
      await configModule.setConfigValue('ai.model', 'modified-model');

      await configModule.resetConfig('ai');

      const config = configModule.getConfig();
      expect(config.ai.model).toBe('claude-3');
    });

    it('should emit path-level events for guild section reset', async () => {
      await configModule.setConfigValue('ai.model', 'guild-model', 'guild-a');
      await configModule.setConfigValue('ai.historyLength', '30', 'guild-a');

      const exactCb = vi.fn();
      const prefixCb = vi.fn();
      configModule.onConfigChange('ai.model', exactCb);
      configModule.onConfigChange('ai.*', prefixCb);

      await configModule.resetConfig('ai', 'guild-a');

      expect(exactCb).toHaveBeenCalledWith('claude-3', 'guild-model', 'ai.model', 'guild-a');
      expect(prefixCb).toHaveBeenCalledWith('claude-3', 'guild-model', 'ai.model', 'guild-a');
      expect(prefixCb).toHaveBeenCalledWith(20, 30, 'ai.historyLength', 'guild-a');
    });

    it('should emit path-level events for global full reset', async () => {
      await configModule.setConfigValue('ai.model', 'modified-model');
      await configModule.setConfigValue('spam.threshold', '99');

      const aiCb = vi.fn();
      const spamCb = vi.fn();
      configModule.onConfigChange('ai.*', aiCb);
      configModule.onConfigChange('spam.threshold', spamCb);

      await configModule.resetConfig();

      expect(aiCb).toHaveBeenCalledWith('claude-3', 'modified-model', 'ai.model', 'global');
      expect(spamCb).toHaveBeenCalledWith(5, 99, 'spam.threshold', 'global');
    });
  });

  describe('multiple guilds simultaneously', () => {
    it('should handle many guilds without interference', async () => {
      const guildIds = Array.from({ length: 10 }, (_, i) => `guild-${i}`);

      // Set different models for each guild
      for (const guildId of guildIds) {
        await configModule.setConfigValue('ai.model', `model-${guildId}`, guildId);
      }

      // Verify each guild has its own model
      for (const guildId of guildIds) {
        const config = configModule.getConfig(guildId);
        expect(config.ai.model).toBe(`model-${guildId}`);
      }

      // Verify global is untouched
      expect(configModule.getConfig().ai.model).toBe('claude-3');
    });
  });
});
