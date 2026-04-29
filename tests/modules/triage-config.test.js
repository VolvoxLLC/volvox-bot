import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/logger.js', () => ({
  warn: vi.fn(),
}));

import { warn } from '../../src/logger.js';
import {
  getDynamicInterval,
  isChannelEligible,
  isMessageTypeEligible,
  isRoleEligible,
  resolveTriageConfig,
} from '../../src/modules/triage-config.js';

describe('triage-config', () => {
  beforeEach(() => {
    vi.mocked(warn).mockClear();
  });

  describe('resolveTriageConfig', () => {
    it('should return defaults for an empty config', () => {
      const result = resolveTriageConfig({});
      expect(result.classifyModel).toBe('minimax:MiniMax-M2.7');
      expect(result.respondModel).toBe('minimax:MiniMax-M2.7');
      expect(result.classifyBudget).toBe(0.05);
      expect(result.respondBudget).toBe(0.2);
      expect(result.timeout).toBe(30000);
    });

    it('should resolve PR #68 flat format as fallback', () => {
      const result = resolveTriageConfig({
        model: 'moonshot:kimi-k2.6',
        budget: 0.5,
        timeout: 10000,
      });
      expect(result.respondModel).toBe('moonshot:kimi-k2.6');
      expect(result.respondBudget).toBe(0.5);
      expect(result.timeout).toBe(10000);
    });

    it('should resolve original nested format as last fallback', () => {
      const result = resolveTriageConfig({
        models: { default: 'moonshot:kimi-k2.5' },
        budget: { response: 0.3 },
        timeouts: { response: 5000 },
      });
      expect(result.respondModel).toBe('moonshot:kimi-k2.5');
      expect(result.respondBudget).toBe(0.3);
      expect(result.timeout).toBe(5000);
    });

    it('should prefer new split format over legacy formats', () => {
      const result = resolveTriageConfig({
        respondModel: 'openrouter:minimax/minimax-m2.5',
        respondBudget: 0.99,
        model: 'minimax:MiniMax-M2.1',
        budget: 0.1,
      });
      expect(result.respondModel).toBe('openrouter:minimax/minimax-m2.5');
      expect(result.respondBudget).toBe(0.99);
    });

    it('should fall back to the default model when legacy value is a bare string (invalid)', () => {
      const result = resolveTriageConfig({ model: 'legacy-bare-name', budget: 0.5 });
      // Bare string does not parse as provider:model → warn + fall back to default.
      expect(result.respondModel).toBe('minimax:MiniMax-M2.7');
      expect(result.respondBudget).toBe(0.5);
      expect(warn).toHaveBeenCalledWith(
        'Triage config contains an invalid model string — falling back',
        expect.objectContaining({ origin: 'triage.model', value: 'legacy-bare-name' }),
      );
    });

    it('should deduplicate repeated model fallback warnings by origin, value, and reason', () => {
      resolveTriageConfig({ model: 'dedupe-bare-model' });
      resolveTriageConfig({ model: 'dedupe-bare-model' });

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(
        'Triage config contains an invalid model string — falling back',
        expect.objectContaining({ origin: 'triage.model', value: 'dedupe-bare-model' }),
      );
    });

    it('should fall back to supported legacy models when configured models are unsupported', () => {
      const result = resolveTriageConfig({
        classifyModel: 'definitely-fake-classify-provider:not-a-real-model',
        respondModel: 'definitely-fake-respond-provider:not-a-real-model',
        model: 'legacy-bare-name',
        models: {
          triage: 'moonshot:kimi-k2.6',
          default: 'openrouter:minimax/minimax-m2.5',
        },
      });

      expect(result.classifyModel).toBe('moonshot:kimi-k2.6');
      expect(result.respondModel).toBe('openrouter:minimax/minimax-m2.5');
    });

    it('should not warn for stale lower-priority legacy models that are never consulted', () => {
      const result = resolveTriageConfig({
        classifyModel: 'moonshot:kimi-k2.6',
        respondModel: 'openrouter:minimax/minimax-m2.5',
        model: 'legacy-bare-name',
        models: {
          triage: 'also-legacy-bare-name',
          default: 'anthropic:claude-3-5-haiku',
        },
      });

      expect(result.classifyModel).toBe('moonshot:kimi-k2.6');
      expect(result.respondModel).toBe('openrouter:minimax/minimax-m2.5');
      expect(warn).not.toHaveBeenCalled();
    });

    it('should canonicalize supported legacy model casing through resolution', () => {
      const result = resolveTriageConfig({
        classifyModel: 'MINIMAX:minimax-m2.5',
        respondModel: 'MINIMAX:minimax-m2.5',
        models: {
          triage: 'MOONSHOT:KIMI-K2.6',
          default: 'OPENROUTER:MINIMAX/MINIMAX-M2.5',
        },
      });

      expect(result.classifyModel).toBe('minimax:MiniMax-M2.5');
      expect(result.respondModel).toBe('minimax:MiniMax-M2.5');
    });
  });

  describe('isChannelEligible', () => {
    it('should allow any channel when channels list is empty', () => {
      expect(isChannelEligible('ch-1', {})).toBe(true);
    });

    it('should allow only whitelisted channels', () => {
      expect(isChannelEligible('ch-1', { channels: ['ch-1', 'ch-2'] })).toBe(true);
      expect(isChannelEligible('ch-3', { channels: ['ch-1', 'ch-2'] })).toBe(false);
    });

    it('should exclude channels in excludeChannels even if whitelisted', () => {
      expect(isChannelEligible('ch-1', { channels: ['ch-1'], excludeChannels: ['ch-1'] })).toBe(
        false,
      );
    });

    it('should exclude from global pool when excludeChannels set with empty allow-list', () => {
      expect(isChannelEligible('ch-1', { excludeChannels: ['ch-1'] })).toBe(false);
      expect(isChannelEligible('ch-2', { excludeChannels: ['ch-1'] })).toBe(true);
    });
  });

  describe('isRoleEligible', () => {
    /**
     * Create a mock GuildMember with specified role IDs.
     * @param {string[]} roleIds - Array of role IDs the member has
     * @param {string} guildId - Guild ID (used to filter @everyone role)
     */
    function makeMember(roleIds, guildId = 'guild-1') {
      const rolesMap = new Map();
      // Add @everyone role (id === guildId)
      rolesMap.set(guildId, { id: guildId, name: '@everyone' });
      // Add specified roles
      for (const id of roleIds) {
        rolesMap.set(id, { id, name: `role-${id}` });
      }
      return {
        guild: { id: guildId },
        roles: {
          cache: {
            filter: (fn) => {
              const filtered = [];
              for (const [, role] of rolesMap) {
                if (fn(role)) filtered.push(role);
              }
              return {
                map: (mapFn) => filtered.map(mapFn),
              };
            },
          },
        },
      };
    }

    it('should return true when allowedRoles is empty (all allowed)', () => {
      const member = makeMember(['role-1', 'role-2']);
      expect(isRoleEligible(member, {})).toBe(true);
      expect(isRoleEligible(member, { allowedRoles: [] })).toBe(true);
    });

    it('should return false when user has excluded role', () => {
      const member = makeMember(['role-1', 'role-2']);
      expect(isRoleEligible(member, { excludedRoles: ['role-1'] })).toBe(false);
      expect(isRoleEligible(member, { excludedRoles: ['role-2'] })).toBe(false);
    });

    it('should return true when user has allowed role', () => {
      const member = makeMember(['role-1', 'role-2']);
      expect(isRoleEligible(member, { allowedRoles: ['role-1'] })).toBe(true);
      expect(isRoleEligible(member, { allowedRoles: ['role-3', 'role-2'] })).toBe(true);
    });

    it('should return false when user has no allowed roles (allowedRoles non-empty)', () => {
      const member = makeMember(['role-1', 'role-2']);
      expect(isRoleEligible(member, { allowedRoles: ['role-3', 'role-4'] })).toBe(false);
    });

    it('should have exclusion take precedence over inclusion', () => {
      const member = makeMember(['role-1', 'role-2']);
      // role-1 is in both allowed and excluded — should be excluded
      expect(isRoleEligible(member, { allowedRoles: ['role-1'], excludedRoles: ['role-1'] })).toBe(
        false,
      );
      // role-2 is allowed, role-1 is excluded — user has role-1 so should be excluded
      expect(isRoleEligible(member, { allowedRoles: ['role-2'], excludedRoles: ['role-1'] })).toBe(
        false,
      );
    });

    it('should return true when member is null (DM)', () => {
      expect(isRoleEligible(null, { allowedRoles: ['role-1'] })).toBe(true);
      expect(isRoleEligible(null, { excludedRoles: ['role-1'] })).toBe(true);
    });

    it('should ignore @everyone role in allowedRoles check', () => {
      // Member only has @everyone (guild-1), no other roles
      const member = makeMember([]);
      // allowedRoles contains the guild ID (@everyone) — should NOT match
      expect(isRoleEligible(member, { allowedRoles: ['guild-1'] })).toBe(false);
    });

    it('should ignore @everyone role in excludedRoles check', () => {
      // Member only has @everyone (guild-1), no other roles
      const member = makeMember([]);
      // excludedRoles contains the guild ID (@everyone) — should NOT exclude
      expect(isRoleEligible(member, { excludedRoles: ['guild-1'] })).toBe(true);
    });

    it('should return true when user has no roles and no restrictions', () => {
      const member = makeMember([]);
      expect(isRoleEligible(member, {})).toBe(true);
    });
  });

  describe('getDynamicInterval', () => {
    it('should return baseInterval for queueSize <= 1', () => {
      expect(getDynamicInterval(0)).toBe(5000);
      expect(getDynamicInterval(1)).toBe(5000);
    });

    it('should return half for 2-4 messages', () => {
      expect(getDynamicInterval(2)).toBe(2500);
      expect(getDynamicInterval(4)).toBe(2500);
    });

    it('should return fifth for 5+ messages', () => {
      expect(getDynamicInterval(5)).toBe(1000);
      expect(getDynamicInterval(10)).toBe(1000);
    });
  });

  describe('isMessageTypeEligible', () => {
    it('should return true for default messages (type 0)', () => {
      expect(isMessageTypeEligible({ type: 0, webhookId: null })).toBe(true);
    });

    it('should return true for reply messages (type 19)', () => {
      expect(isMessageTypeEligible({ type: 19, webhookId: null })).toBe(true);
    });

    it('should return true when type is undefined (defaults to 0)', () => {
      expect(isMessageTypeEligible({ webhookId: null })).toBe(true);
    });

    it('should return false for system messages (joins, boosts, pins)', () => {
      // Type 7 = GuildMemberJoin
      expect(isMessageTypeEligible({ type: 7, webhookId: null })).toBe(false);
      // Type 8 = UserPremiumGuildSubscription (boost)
      expect(isMessageTypeEligible({ type: 8, webhookId: null })).toBe(false);
      // Type 6 = ChannelPinnedMessage
      expect(isMessageTypeEligible({ type: 6, webhookId: null })).toBe(false);
    });

    it('should return false for webhook messages', () => {
      expect(isMessageTypeEligible({ type: 0, webhookId: '12345' })).toBe(false);
    });

    it('should return false for webhook messages regardless of type', () => {
      expect(isMessageTypeEligible({ type: 19, webhookId: '12345' })).toBe(false);
    });
  });
});
