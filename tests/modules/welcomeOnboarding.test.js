import { GuildMemberFlagsBitField } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  buildRulesAgreementMessage,
  handleRoleMenuSelection,
  handleRulesAcceptButton,
  isReturningMember,
  normalizeWelcomeOnboardingConfig,
  ROLE_MENU_SELECT_ID,
  RULES_ACCEPT_BUTTON_ID,
} from '../../src/modules/welcomeOnboarding.js';
import { safeEditReply, safeSend } from '../../src/utils/safeSend.js';

describe('welcomeOnboarding module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies safe defaults when welcome onboarding fields are missing', () => {
    const result = normalizeWelcomeOnboardingConfig({});

    expect(result).toEqual({
      rulesChannel: null,
      roleMenuChannel: null,
      verifiedRole: null,
      introChannel: null,
      rulesMessage: 'Read the server rules, then click below to verify your access.',
      roleMenu: {
        enabled: false,
        message: 'Pick your roles below. You can update them anytime.',
        options: [],
      },
      introMessage: 'Welcome {{user}}! Drop a quick intro so we can meet you.',
      dmSequence: { enabled: false, steps: [] },
    });
  });

  it('normalizes onboarding config by trimming values and dropping junk options', () => {
    const result = normalizeWelcomeOnboardingConfig({
      rulesChannel: '  rules-1  ',
      roleMenuChannel: ' role-menu-1 ',
      verifiedRole: ' verified-role ',
      introChannel: ' intro-1 ',
      rulesMessage: ' Custom rules ',
      introMessage: ' Say hi {{username}} ',
      roleMenu: {
        enabled: true,
        message: ' Choose roles ',
        options: [
          { label: '  Gamer ', roleId: ' role-1 ', description: '  likes games  ' },
          { label: '', roleId: 'role-2' },
          null,
        ],
      },
      dmSequence: {
        enabled: true,
        steps: ['  welcome  ', '', '  read the rules '],
      },
    });

    expect(result).toEqual({
      rulesChannel: 'rules-1',
      roleMenuChannel: 'role-menu-1',
      verifiedRole: 'verified-role',
      introChannel: 'intro-1',
      rulesMessage: 'Custom rules',
      roleMenu: {
        enabled: true,
        message: 'Choose roles',
        options: [{ label: 'Gamer', roleId: 'role-1', description: 'likes games' }],
      },
      introMessage: 'Say hi {{username}}',
      dmSequence: {
        enabled: true,
        steps: ['welcome', 'read the rules'],
      },
    });
  });

  it('falls back to the welcome message channel for legacy role menu configs', () => {
    const result = normalizeWelcomeOnboardingConfig({
      channelId: ' legacy-welcome-channel ',
      roleMenuChannel: null,
    });

    expect(result.roleMenuChannel).toBe('legacy-welcome-channel');
  });

  it('builds the rules agreement message with accept button', () => {
    const message = buildRulesAgreementMessage();
    const button = message.components[0].components[0].toJSON();

    expect(message.content).toContain('Read the server rules');
    expect(message.components).toHaveLength(1);
    expect(button.label).toBe('Accept Rules');
    expect(button.custom_id).toBe(RULES_ACCEPT_BUTTON_ID);
  });

  it('uses configurable rules and role menu messages', () => {
    expect(buildRulesAgreementMessage({ rulesMessage: 'Custom rules panel' }).content).toBe(
      'Custom rules panel',
    );
    expect(
      buildRoleMenuMessage({
        roleMenu: {
          enabled: true,
          message: 'Custom roles panel',
          options: [{ label: 'Role A', roleId: 'role-a' }],
        },
      })?.content,
    ).toBe('Custom roles panel');
  });

  it('detects returning members via the DidRejoin flag', () => {
    const hasDidRejoin = vi.fn().mockReturnValue(true);
    expect(isReturningMember({ flags: { has: hasDidRejoin } })).toBe(true);
    expect(hasDidRejoin).toHaveBeenCalledWith(GuildMemberFlagsBitField.Flags.DidRejoin);

    const hasNotRejoined = vi.fn().mockReturnValue(false);
    expect(isReturningMember({ flags: { has: hasNotRejoined } })).toBe(false);
    expect(hasNotRejoined).toHaveBeenCalledWith(GuildMemberFlagsBitField.Flags.DidRejoin);
  });

  it('returns null when role menu is disabled or empty', () => {
    expect(
      buildRoleMenuMessage({
        roleMenu: { enabled: false, options: [{ label: 'A', roleId: '1' }] },
      }),
    ).toBeNull();
    expect(buildRoleMenuMessage({ roleMenu: { enabled: true, options: [] } })).toBeNull();
  });

  it('buildRoleMenuMessage enforces max 25 options', () => {
    const options = Array.from({ length: 30 }, (_, i) => ({
      label: `Role ${i + 1}`,
      roleId: `r${i + 1}`,
    }));

    const message = buildRoleMenuMessage({ roleMenu: { enabled: true, options } });
    const select = message?.components?.[0]?.components?.[0]?.toJSON();

    expect(select?.custom_id).toBe(ROLE_MENU_SELECT_ID);
    expect(select?.options).toHaveLength(25);
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

  it('rejects rules acceptance when no verified role is configured', async () => {
    const interaction = {
      guildId: 'guild-1',
      user: { id: 'user-1', send: vi.fn(async () => {}) },
      deferReply: vi.fn(async () => {}),
    };

    await handleRulesAcceptButton(interaction, { welcome: {} });

    expect(safeEditReply).toHaveBeenCalledWith(
      interaction,
      expect.objectContaining({ content: expect.stringContaining('not configured') }),
    );
  });

  it('rejects rules acceptance when the configured role is missing or not editable', async () => {
    const missingRoleInteraction = {
      guildId: 'guild-1',
      user: { id: 'user-1', send: vi.fn(async () => {}) },
      member: { roles: { cache: new Map() } },
      guild: {
        roles: {
          cache: new Map(),
          fetch: vi.fn(async () => null),
        },
      },
      deferReply: vi.fn(async () => {}),
    };

    await handleRulesAcceptButton(missingRoleInteraction, {
      welcome: { verifiedRole: 'verified-role' },
    });

    expect(safeEditReply).toHaveBeenCalledWith(
      missingRoleInteraction,
      expect.objectContaining({ content: expect.stringContaining('cannot find') }),
    );

    const nonEditableRole = { id: 'verified-role', editable: false };
    const lockedRoleInteraction = {
      guildId: 'guild-1',
      user: { id: 'user-1', send: vi.fn(async () => {}) },
      member: { roles: { cache: new Map() } },
      guild: {
        roles: {
          cache: new Map([['verified-role', nonEditableRole]]),
          fetch: vi.fn(async () => nonEditableRole),
        },
      },
      deferReply: vi.fn(async () => {}),
    };

    await handleRulesAcceptButton(lockedRoleInteraction, {
      welcome: { verifiedRole: 'verified-role' },
    });

    expect(safeEditReply).toHaveBeenCalledWith(
      lockedRoleInteraction,
      expect.objectContaining({ content: expect.stringContaining('above my highest role') }),
    );
  });

  it('handles already-verified members and role assignment failures', async () => {
    const role = { id: 'verified-role', editable: true };
    const alreadyVerified = {
      guildId: 'guild-1',
      user: { id: 'user-1', send: vi.fn(async () => {}) },
      member: {
        roles: {
          cache: new Map([['verified-role', role]]),
          add: vi.fn(async () => {}),
        },
      },
      guild: {
        roles: {
          cache: new Map([['verified-role', role]]),
          fetch: vi.fn(async () => role),
        },
      },
      deferReply: vi.fn(async () => {}),
    };

    await handleRulesAcceptButton(alreadyVerified, {
      welcome: { verifiedRole: 'verified-role' },
    });

    expect(safeEditReply).toHaveBeenCalledWith(
      alreadyVerified,
      expect.objectContaining({ content: expect.stringContaining('already verified') }),
    );

    const failingMember = {
      roles: {
        cache: new Map(),
        add: vi.fn().mockRejectedValue(new Error('role add failed')),
      },
    };
    const failingInteraction = {
      guildId: 'guild-1',
      user: { id: 'user-1', send: vi.fn(async () => {}) },
      member: failingMember,
      guild: {
        roles: {
          cache: new Map([['verified-role', role]]),
          fetch: vi.fn(async () => role),
        },
      },
      deferReply: vi.fn(async () => {}),
    };

    await handleRulesAcceptButton(failingInteraction, {
      welcome: { verifiedRole: 'verified-role' },
    });

    expect(safeEditReply).toHaveBeenCalledWith(
      failingInteraction,
      expect.objectContaining({ content: expect.stringContaining('Failed to assign') }),
    );
  });

  it('fetches the member when interaction.member is missing and stops the DM sequence on failure', async () => {
    const role = { id: 'verified-role', editable: true };
    const fetchedMember = {
      id: 'member-2',
      roles: {
        cache: new Map(),
        add: vi.fn(async () => {}),
      },
    };

    const interaction = {
      guildId: 'guild-1',
      user: {
        id: 'user-2',
        send: vi
          .fn()
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(new Error('dm blocked')),
      },
      guild: {
        members: {
          fetch: vi.fn(async () => fetchedMember),
        },
        roles: {
          cache: new Map([['verified-role', role]]),
          fetch: vi.fn(async () => role),
        },
      },
      client: {
        channels: {
          cache: new Map(),
          fetch: vi.fn(async () => null),
        },
      },
      deferReply: vi.fn(async () => {}),
    };

    await handleRulesAcceptButton(interaction, {
      welcome: {
        verifiedRole: 'verified-role',
        dmSequence: { enabled: true, steps: ['one', 'two', 'three'] },
      },
    });

    expect(interaction.guild.members.fetch).toHaveBeenCalledWith('user-2');
    expect(interaction.user.send).toHaveBeenCalledTimes(2);
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

  it('handles unconfigured role menus and no-op updates', async () => {
    const interaction = {
      user: { id: 'user-3' },
      values: [],
      member: {
        roles: {
          cache: new Map(),
          add: vi.fn(async () => {}),
          remove: vi.fn(async () => {}),
        },
      },
      guild: {
        roles: {
          cache: new Map(),
          fetch: vi.fn(async () => null),
        },
      },
      deferReply: vi.fn(async () => {}),
    };

    await handleRoleMenuSelection(interaction, { welcome: { roleMenu: { enabled: false } } });
    expect(safeEditReply).toHaveBeenCalledWith(
      interaction,
      expect.objectContaining({ content: expect.stringContaining('not configured') }),
    );

    const role = { id: 'role-a', editable: true };
    const noChangeInteraction = {
      ...interaction,
      values: ['role-a'],
      member: {
        roles: {
          cache: new Map([['role-a', role]]),
          add: vi.fn(async () => {}),
          remove: vi.fn(async () => {}),
        },
      },
      guild: {
        roles: {
          cache: new Map([['role-a', role]]),
          fetch: vi.fn(async () => role),
        },
      },
    };

    await handleRoleMenuSelection(noChangeInteraction, {
      welcome: {
        roleMenu: { enabled: true, options: [{ label: 'Role A', roleId: 'role-a' }] },
      },
    });

    expect(safeEditReply).toHaveBeenCalledWith(
      noChangeInteraction,
      expect.objectContaining({ content: '✅ No role changes were needed.' }),
    );
  });
});
