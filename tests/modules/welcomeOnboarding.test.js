import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../../src/utils/discordCache.js', () => ({
  fetchChannelCached: vi.fn().mockImplementation((client, channelId) => {
    if (!channelId) return Promise.resolve(null);
    // Use client.channels.cache if available
    if (client?.channels?.cache?.get?.(channelId)) {
      return Promise.resolve(client.channels.cache.get(channelId));
    }
    return client?.channels?.fetch?.(channelId).catch(() => null) ?? Promise.resolve(null);
  }),
  invalidateGuildCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/utils/safeSend.js', () => ({
  safeSend: vi.fn(async (target, payload) => {
    if (typeof target?.send === 'function') return target.send(payload);
    return undefined;
  }),
  safeReply: vi.fn(async (target, payload) => {
    if (typeof target?.reply === 'function') return target.reply(payload);
    return undefined;
  }),
  safeEditReply: vi.fn(async () => {}),
}));

import {
  buildRoleMenuMessage,
  handleRoleMenuSelection,
  handleRulesAcceptButton,
  normalizeWelcomeOnboardingConfig,
} from '../../src/modules/welcomeOnboarding.js';
import { safeEditReply, safeSend } from '../../src/utils/safeSend.js';

describe('welcomeOnboarding module', () => {
  it('applies safe defaults when welcome onboarding fields are missing', () => {
    const result = normalizeWelcomeOnboardingConfig({});

    expect(result).toEqual({
      rulesChannel: null,
      verifiedRole: null,
      introChannel: null,
      roleMenu: { enabled: false, options: [] },
      dmSequence: { enabled: false, steps: [] },
    });
  });

  it('buildRoleMenuMessage enforces max 25 options', () => {
    const options = Array.from({ length: 30 }, (_, i) => ({
      label: `Role ${i + 1}`,
      roleId: `r${i + 1}`,
    }));

    const message = buildRoleMenuMessage({ roleMenu: { enabled: true, options } });
    const builtOptions = message?.components?.[0]?.components?.[0]?.options;

    expect(builtOptions).toHaveLength(25);
  });

  it('handles rules acceptance by granting verified role and posting intro prompt', async () => {
    const role = { id: 'verified-role', editable: true };
    const member = {
      id: 'member-1',
      roles: {
        cache: new Map(),
        add: vi.fn(async () => {}),
      },
    };
    const introChannel = {
      id: 'intro-ch',
      isTextBased: () => true,
      send: vi.fn(async () => {}),
    };

    const interaction = {
      guildId: 'guild-1',
      user: { id: 'user-1', send: vi.fn(async () => {}) },
      member,
      guild: {
        roles: {
          cache: new Map([['verified-role', role]]),
          fetch: vi.fn(async () => role),
        },
        channels: {
          cache: new Map([['intro-ch', introChannel]]),
          fetch: vi.fn(async () => introChannel),
        },
      },
      client: {
        channels: {
          cache: new Map([['intro-ch', introChannel]]),
          fetch: vi.fn(async () => introChannel),
        },
      },
      reply: vi.fn(async () => {}),
      deferReply: vi.fn(async () => {}),
      editReply: vi.fn(async () => {}),
      deferred: false,
      replied: false,
    };

    await handleRulesAcceptButton(interaction, {
      welcome: {
        verifiedRole: 'verified-role',
        introChannel: 'intro-ch',
        dmSequence: { enabled: false, steps: [] },
      },
    });

    expect(member.roles.add).toHaveBeenCalled();
    expect(safeSend).toHaveBeenCalledWith(introChannel, expect.stringContaining('<@member-1>'));
    expect(safeEditReply).toHaveBeenCalledWith(
      interaction,
      expect.objectContaining({ content: expect.stringContaining('Rules accepted') }),
    );
  });

  it('updates self-assignable roles by adding selected and removing deselected', async () => {
    const roleA = { id: 'role-a', editable: true };
    const roleB = { id: 'role-b', editable: true };

    const member = {
      roles: {
        cache: new Map([['role-a', roleA]]),
        add: vi.fn(async () => {}),
        remove: vi.fn(async () => {}),
      },
    };

    const interaction = {
      user: { id: 'user-2' },
      member,
      values: ['role-b'],
      guild: {
        roles: {
          cache: new Map([
            ['role-a', roleA],
            ['role-b', roleB],
          ]),
          fetch: vi.fn(async (id) => (id === 'role-a' ? roleA : roleB)),
        },
      },
      reply: vi.fn(async () => {}),
      deferReply: vi.fn(async () => {}),
      editReply: vi.fn(async () => {}),
      deferred: false,
      replied: false,
    };

    await handleRoleMenuSelection(interaction, {
      welcome: {
        roleMenu: {
          enabled: true,
          options: [
            { label: 'Role A', roleId: 'role-a' },
            { label: 'Role B', roleId: 'role-b' },
          ],
        },
      },
    });

    expect(member.roles.remove).toHaveBeenCalledWith(
      ['role-a'],
      'Updated self-assignable onboarding roles',
    );
    expect(member.roles.add).toHaveBeenCalledWith(
      ['role-b'],
      'Updated self-assignable onboarding roles',
    );
  });
});
