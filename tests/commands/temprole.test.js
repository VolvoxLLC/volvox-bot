import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/safeSend.js', () => ({
  safeSend: vi.fn(),
  safeReply: vi.fn(),
  safeFollowUp: vi.fn(),
  safeEditReply: (t, opts) => t.editReply(opts),
}));

vi.mock('../../src/modules/tempRoleHandler.js', () => ({
  assignTempRole: vi.fn().mockResolvedValue({ id: 1 }),
  revokeTempRole: vi.fn().mockResolvedValue({ id: 1, removed: true }),
  listTempRoles: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
}));

vi.mock('../../src/utils/duration.js', () => ({
  parseDuration: vi.fn().mockReturnValue(86400000),
  formatDuration: vi.fn().mockReturnValue('1 day'),
}));

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import { adminOnly, data, execute } from '../../src/commands/temprole.js';
import {
  assignTempRole,
  listTempRoles,
  revokeTempRole,
} from '../../src/modules/tempRoleHandler.js';
import { parseDuration } from '../../src/utils/duration.js';

// Minimal Discord mock helpers
const mockRole = { id: 'role1', name: 'VIP', position: 3 };
const mockUser = { id: 'user1', tag: 'User#0001' };
const mockMember = {
  id: 'user1',
  user: mockUser,
  roles: {
    add: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    highest: { position: 5 },
  },
};

function createInteraction(subcommand, overrides = {}) {
  return {
    options: {
      getSubcommand: vi.fn().mockReturnValue(subcommand),
      getUser: vi.fn().mockReturnValue(mockUser),
      getRole: vi.fn().mockReturnValue(mockRole),
      getString: vi.fn().mockImplementation((name) => {
        if (name === 'duration') return '1d';
        if (name === 'reason') return 'test reason';
        return null;
      }),
    },
    guild: {
      id: 'guild1',
      name: 'Test Server',
      members: {
        fetch: vi.fn().mockResolvedValue(mockMember),
        me: { roles: { highest: { position: 10 } } },
      },
    },
    member: { roles: { highest: { position: 10 } } },
    user: { id: 'mod1', tag: 'Mod#0001' },
    guildId: 'guild1',
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('temprole command', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('exports name "temprole"', () => {
    expect(data.name).toBe('temprole');
  });

  it('exports adminOnly = true', () => {
    expect(adminOnly).toBe(true);
  });

  // ── assign ──────────────────────────────────────────────────────────────

  describe('assign subcommand', () => {
    it('assigns a role successfully', async () => {
      const interaction = createInteraction('assign');
      await execute(interaction);

      expect(interaction.guild.members.fetch).toHaveBeenCalledWith(mockUser.id);
      expect(mockMember.roles.add).toHaveBeenCalledWith('role1', expect.any(String));
      expect(assignTempRole).toHaveBeenCalledWith(
        expect.objectContaining({
          guildId: 'guild1',
          userId: 'user1',
          roleId: 'role1',
          roleName: 'VIP',
        }),
      );
      expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('✅'));
    });

    it('rejects invalid duration', async () => {
      parseDuration.mockReturnValueOnce(null);
      const interaction = createInteraction('assign');
      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining('Invalid duration'),
      );
      expect(assignTempRole).not.toHaveBeenCalled();
    });

    it('rejects when user is not in guild', async () => {
      const interaction = createInteraction('assign');
      interaction.guild.members.fetch = vi.fn().mockRejectedValue(new Error('Unknown Member'));

      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining('not in this server'),
      );
    });

    it('rejects when role is too high for bot', async () => {
      const interaction = createInteraction('assign');
      // Role position 10 >= bot highest position 10
      interaction.options.getRole = vi.fn().mockReturnValue({ ...mockRole, position: 10 });

      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining('cannot assign that role'),
      );
    });

    it('rejects when role is too high for moderator', async () => {
      const interaction = createInteraction('assign');
      // Role position 10 >= moderator highest position 10
      interaction.member.roles.highest.position = 5;
      interaction.options.getRole = vi.fn().mockReturnValue({ ...mockRole, position: 5 });

      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining('cannot assign a role equal to or higher'),
      );
    });
  });

  // ── revoke ──────────────────────────────────────────────────────────────

  describe('revoke subcommand', () => {
    it('revokes a temp role successfully', async () => {
      const interaction = createInteraction('revoke');
      await execute(interaction);

      expect(revokeTempRole).toHaveBeenCalledWith('guild1', 'user1', 'role1');
      expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('✅'));
    });

    it('returns error when no active assignment found', async () => {
      revokeTempRole.mockResolvedValueOnce(null);
      const interaction = createInteraction('revoke');
      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining('No active temporary role assignment'),
      );
    });
  });

  // ── list ────────────────────────────────────────────────────────────────

  describe('list subcommand', () => {
    it('shows empty message when no assignments', async () => {
      const interaction = createInteraction('list');
      interaction.options.getUser = vi.fn().mockReturnValue(null);
      await execute(interaction);

      expect(listTempRoles).toHaveBeenCalled();
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining('No active temporary role'),
      );
    });

    it('shows embed when assignments exist', async () => {
      listTempRoles.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            user_id: 'u1',
            role_id: 'r1',
            expires_at: new Date(Date.now() + 86400000).toISOString(),
            reason: null,
          },
        ],
        total: 1,
      });

      const interaction = createInteraction('list');
      interaction.options.getUser = vi.fn().mockReturnValue(null);
      await execute(interaction);

      // editReply called with an embed object (not a string)
      const call = interaction.editReply.mock.calls[0][0];
      expect(call).toHaveProperty('embeds');
    });
  });
});
