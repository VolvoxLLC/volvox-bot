import { describe, expect, it } from 'vitest';

import {
  getDynamicInterval,
  isChannelEligible,
  isRoleEligible,
  resolveTriageConfig,
} from '../../src/modules/triage-config.js';

describe('triage-config', () => {
  describe('resolveTriageConfig', () => {
    it('should return defaults for an empty config', () => {
      const result = resolveTriageConfig({});
      expect(result.classifyModel).toBe('claude-haiku-4-5');
      expect(result.respondModel).toBe('claude-sonnet-4-6');
      expect(result.classifyBudget).toBe(0.05);
      expect(result.respondBudget).toBe(0.2);
      expect(result.timeout).toBe(30000);
    });

    it('should resolve PR #68 flat format as fallback', () => {
      const result = resolveTriageConfig({ model: 'my-model', budget: 0.5, timeout: 10000 });
      expect(result.respondModel).toBe('my-model');
      expect(result.respondBudget).toBe(0.5);
      expect(result.timeout).toBe(10000);
    });

    it('should resolve original nested format as last fallback', () => {
      const result = resolveTriageConfig({
        models: { default: 'nested-model' },
        budget: { response: 0.3 },
        timeouts: { response: 5000 },
      });
      expect(result.respondModel).toBe('nested-model');
      expect(result.respondBudget).toBe(0.3);
      expect(result.timeout).toBe(5000);
    });

    it('should prefer new split format over legacy formats', () => {
      const result = resolveTriageConfig({
        respondModel: 'new-model',
        respondBudget: 0.99,
        model: 'legacy-model',
        budget: 0.1,
      });
      expect(result.respondModel).toBe('new-model');
      expect(result.respondBudget).toBe(0.99);
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

    it('should ignore @everyone role in role checks', () => {
      // Member only has @everyone (guild-1), no other roles
      const member = makeMember([]);
      // allowedRoles contains the guild ID (@everyone) — should NOT match
      expect(isRoleEligible(member, { allowedRoles: ['guild-1'] })).toBe(false);
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
});
