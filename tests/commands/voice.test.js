import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../src/utils/safeSend.js', () => ({
  safeEditReply: (interaction, payload) => interaction.editReply(payload),
}));

vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn(),
}));

vi.mock('../../src/modules/voice.js', () => ({
  exportVoiceSessions: vi.fn(),
  formatDuration: vi.fn((seconds) => `${seconds}s`),
  getUserVoiceStats: vi.fn(),
  getVoiceLeaderboard: vi.fn(),
}));

import { data, execute } from '../../src/commands/voice.js';
import { getConfig } from '../../src/modules/config.js';
import {
  exportVoiceSessions,
  getUserVoiceStats,
  getVoiceLeaderboard,
} from '../../src/modules/voice.js';

function createInteraction({
  subcommand = 'leaderboard',
  period = null,
  targetUser = null,
  memberPermissions = { has: vi.fn().mockReturnValue(true) },
  guildMemberFetch = vi.fn(),
} = {}) {
  return {
    guildId: 'guild-1',
    user: {
      id: 'self-user',
      username: 'Self User',
      displayName: 'Self User',
      displayAvatarURL: () => 'https://cdn.example.com/self.png',
    },
    guild: {
      members: { fetch: guildMemberFetch },
    },
    memberPermissions,
    options: {
      getSubcommand: vi.fn().mockReturnValue(subcommand),
      getString: vi.fn((name) => (name === 'period' ? period : null)),
      getUser: vi.fn((name) => (name === 'user' ? targetUser : null)),
    },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
  };
}

describe('voice command', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('exports the expected command name', () => {
    expect(data.name).toBe('voice');
  });

  it('returns early when voice tracking is disabled', async () => {
    getConfig.mockReturnValueOnce({ voice: { enabled: false } });
    const interaction = createInteraction();

    await execute(interaction);

    expect(interaction.deferReply).toHaveBeenCalledOnce();
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: '🔇 Voice tracking is not enabled on this server.',
    });
  });

  it('shows an empty leaderboard message when there is no activity', async () => {
    getConfig.mockReturnValueOnce({ voice: { enabled: true } });
    getVoiceLeaderboard.mockResolvedValueOnce([]);
    const interaction = createInteraction();

    await execute(interaction);

    expect(getVoiceLeaderboard).toHaveBeenCalledWith('guild-1', { limit: 10, period: 'week' });
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: '📭 No voice activity recorded yet.',
    });
  });

  it('renders the leaderboard using fetched member display names', async () => {
    getConfig.mockReturnValueOnce({ voice: { enabled: true } });
    getVoiceLeaderboard.mockResolvedValueOnce([
      { user_id: 'user-1', total_seconds: 300, session_count: 1 },
      { user_id: 'user-2', total_seconds: 120, session_count: 2 },
    ]);

    const guildMemberFetch = vi.fn().mockResolvedValue(
      new Map([
        ['user-1', { displayName: 'Alice' }],
        ['user-2', { displayName: 'Bob' }],
      ]),
    );
    const interaction = createInteraction({ period: 'month', guildMemberFetch });

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: [
          expect.objectContaining({
            data: expect.objectContaining({
              title: '🎙️ Voice Leaderboard — This Month',
              description: expect.stringContaining('🥇 Alice'),
            }),
          }),
        ],
      }),
    );
  });

  it('falls back to mentions when member lookup fails', async () => {
    getConfig.mockReturnValueOnce({ voice: { enabled: true } });
    getVoiceLeaderboard.mockResolvedValueOnce([
      { user_id: 'user-1', total_seconds: 90, session_count: 3 },
    ]);

    const interaction = createInteraction({
      guildMemberFetch: vi.fn().mockRejectedValue(new Error('discord down')),
    });

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: [
          expect.objectContaining({
            data: expect.objectContaining({
              description: expect.stringContaining('<@user-1>'),
            }),
          }),
        ],
      }),
    );
  });

  it('shows a failure message when leaderboard lookup throws', async () => {
    getConfig.mockReturnValueOnce({ voice: { enabled: true } });
    getVoiceLeaderboard.mockRejectedValueOnce(new Error('db down'));
    const interaction = createInteraction();

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: '❌ Something went wrong fetching the voice leaderboard.',
    });
  });

  it('renders voice stats for the requested user', async () => {
    getConfig.mockReturnValueOnce({ voice: { enabled: true } });
    getUserVoiceStats.mockResolvedValueOnce({
      total_seconds: 7200,
      session_count: 4,
      favorite_channel: null,
    });
    const interaction = createInteraction({
      subcommand: 'stats',
      targetUser: {
        id: 'user-2',
        username: 'Target User',
        displayName: 'Target User',
        displayAvatarURL: () => 'https://cdn.example.com/target.png',
      },
    });

    await execute(interaction);

    expect(getUserVoiceStats).toHaveBeenCalledWith('guild-1', 'user-2');
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: [
          expect.objectContaining({
            data: expect.objectContaining({
              title: '🎙️ Voice Stats — Target User',
            }),
          }),
        ],
      }),
    );
  });

  it('shows a failure message when voice stats throw', async () => {
    getConfig.mockReturnValueOnce({ voice: { enabled: true } });
    getUserVoiceStats.mockRejectedValueOnce(new Error('db down'));
    const interaction = createInteraction({ subcommand: 'stats' });

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: '❌ Something went wrong fetching voice stats.',
    });
  });

  it('rejects exports for users without Manage Server', async () => {
    getConfig.mockReturnValueOnce({ voice: { enabled: true } });
    const interaction = createInteraction({
      subcommand: 'export',
      memberPermissions: { has: vi.fn().mockReturnValue(false) },
    });

    await execute(interaction);

    expect(exportVoiceSessions).not.toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: '❌ You need the **Manage Server** permission to export voice data.',
    });
  });

  it('shows an empty export message when no sessions exist', async () => {
    getConfig.mockReturnValueOnce({ voice: { enabled: true } });
    exportVoiceSessions.mockResolvedValueOnce([]);
    const interaction = createInteraction({ subcommand: 'export', period: 'all' });

    await execute(interaction);

    expect(exportVoiceSessions).toHaveBeenCalledWith('guild-1', { period: 'all', limit: 5000 });
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: '📭 No voice sessions found for that period.',
    });
  });

  it('exports voice session data as CSV', async () => {
    getConfig.mockReturnValueOnce({ voice: { enabled: true } });
    exportVoiceSessions.mockResolvedValueOnce([
      {
        id: 1,
        user_id: 'user-1',
        channel_id: 'channel-1',
        joined_at: new Date('2025-01-01T00:00:00Z'),
        left_at: new Date('2025-01-01T01:00:00Z'),
        duration_seconds: 3600,
      },
    ]);
    const interaction = createInteraction({ subcommand: 'export', period: 'month' });

    await execute(interaction);

    const payload = interaction.editReply.mock.calls[0][0];
    const csv = payload.files[0].attachment.toString('utf8');

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: '📊 Voice session export — **1** sessions (month)',
        files: [
          expect.objectContaining({
            name: 'voice-sessions-guild-1-month.csv',
          }),
        ],
      }),
    );
    expect(csv).toContain('id,user_id,channel_id,joined_at,left_at,duration_seconds');
    expect(csv).toContain(
      '1,user-1,channel-1,2025-01-01T00:00:00.000Z,2025-01-01T01:00:00.000Z,3600',
    );
  });

  it('shows a failure message when export throws', async () => {
    getConfig.mockReturnValueOnce({ voice: { enabled: true } });
    exportVoiceSessions.mockRejectedValueOnce(new Error('db down'));
    const interaction = createInteraction({ subcommand: 'export' });

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: '❌ Something went wrong exporting voice data.',
    });
  });

  it('shows an explicit error for an unknown subcommand after deferring', async () => {
    getConfig.mockReturnValueOnce({ voice: { enabled: true } });
    const interaction = createInteraction({ subcommand: 'mystery' });

    await execute(interaction);

    expect(interaction.deferReply).toHaveBeenCalledOnce();
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: '❌ Unknown subcommand: `mystery`',
    });
  });
});
