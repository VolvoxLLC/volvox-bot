import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/logger.js', () => ({
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

const configMocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
}));

const voiceModuleMocks = vi.hoisted(() => ({
  exportVoiceSessions: vi.fn(),
  formatDuration: vi.fn(),
  getUserVoiceStats: vi.fn(),
  getVoiceLeaderboard: vi.fn(),
}));

const safeSendMocks = vi.hoisted(() => ({
  safeEditReply: vi.fn(),
}));

vi.mock('../../src/modules/config.js', () => configMocks);
vi.mock('../../src/modules/voice.js', () => voiceModuleMocks);
vi.mock('../../src/utils/safeSend.js', () => safeSendMocks);

import { data, execute } from '../../src/commands/voice.js';
import { error as logError } from '../../src/logger.js';
import { getConfig } from '../../src/modules/config.js';
import {
  exportVoiceSessions,
  formatDuration,
  getUserVoiceStats,
  getVoiceLeaderboard,
} from '../../src/modules/voice.js';
import { safeEditReply } from '../../src/utils/safeSend.js';

function createInteraction(subcommand) {
  const member = {
    user: { tag: 'Member#0001' },
    roles: {
      add: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    },
    displayName: 'Member Display',
  };

  return {
    deferReply: vi.fn().mockResolvedValue(undefined),
    guildId: 'guild1',
    user: {
      id: 'self-user',
      username: 'SelfUser',
      displayName: 'SelfUser Display',
      displayAvatarURL: vi.fn().mockReturnValue('https://cdn.example.com/avatar.png'),
    },
    guild: {
      members: {
        fetch: vi.fn().mockResolvedValue(
          new Map([
            ['user-1', { displayName: 'Alice' }],
            ['user-2', { displayName: 'Bob' }],
          ]),
        ),
      },
      roles: { cache: new Map() },
    },
    memberPermissions: {
      has: vi.fn().mockReturnValue(true),
    },
    options: {
      getSubcommand: vi.fn().mockReturnValue(subcommand),
      getString: vi.fn().mockImplementation((name) => {
        if (name === 'period') return null;
        return null;
      }),
      getUser: vi.fn().mockReturnValue(null),
    },
    member,
  };
}

describe('voice command', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getConfig.mockReturnValue({
      voice: { enabled: true },
    });
    safeEditReply.mockResolvedValue(undefined);
    formatDuration.mockImplementation((seconds) => `${seconds}s`);
    getVoiceLeaderboard.mockResolvedValue([]);
    getUserVoiceStats.mockResolvedValue({
      total_seconds: 120,
      session_count: 2,
      favorite_channel: null,
    });
    exportVoiceSessions.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exports the expected slash command name', () => {
    expect(data.name).toBe('voice');
  });

  it('returns disabled message when voice tracking is disabled', async () => {
    getConfig.mockReturnValueOnce({ voice: { enabled: false } });
    const interaction = createInteraction('leaderboard');

    await execute(interaction);

    expect(safeEditReply).toHaveBeenCalledWith(
      interaction,
      expect.objectContaining({
        content: expect.stringContaining('not enabled'),
      }),
    );
  });

  it('handles leaderboard with no activity', async () => {
    const interaction = createInteraction('leaderboard');

    await execute(interaction);

    expect(getVoiceLeaderboard).toHaveBeenCalledWith('guild1', { limit: 10, period: 'week' });
    expect(safeEditReply).toHaveBeenCalledWith(
      interaction,
      expect.objectContaining({
        content: expect.stringContaining('No voice activity'),
      }),
    );
  });

  it('renders leaderboard embed with fetched member names', async () => {
    getVoiceLeaderboard.mockResolvedValueOnce([
      { user_id: 'user-1', total_seconds: 3600, session_count: 1 },
      { user_id: 'user-2', total_seconds: 1800, session_count: 2 },
    ]);
    const interaction = createInteraction('leaderboard');
    interaction.options.getString.mockReturnValue('month');

    await execute(interaction);

    const payload = safeEditReply.mock.calls.at(-1)?.[1];
    const description = payload?.embeds?.[0]?.data?.description ?? '';
    expect(description).toContain('🥇 Alice');
    expect(description).toContain('🥈 Bob');
    expect(description).toContain('session');
  });

  it('falls back to mention format when member fetch fails', async () => {
    getVoiceLeaderboard.mockResolvedValueOnce([
      { user_id: 'user-3', total_seconds: 3600, session_count: 3 },
    ]);
    const interaction = createInteraction('leaderboard');
    interaction.guild.members.fetch.mockRejectedValueOnce(new Error('no cache'));

    await execute(interaction);

    const payload = safeEditReply.mock.calls.at(-1)?.[1];
    const description = payload?.embeds?.[0]?.data?.description ?? '';
    expect(description).toContain('<@user-3>');
  });

  it('handles leaderboard errors', async () => {
    getVoiceLeaderboard.mockRejectedValueOnce(new Error('query failed'));
    const interaction = createInteraction('leaderboard');

    await execute(interaction);

    expect(logError).toHaveBeenCalledWith(
      'Voice leaderboard failed',
      expect.objectContaining({ error: 'query failed' }),
    );
    expect(safeEditReply).toHaveBeenCalledWith(
      interaction,
      expect.objectContaining({
        content: expect.stringContaining('Something went wrong fetching the voice leaderboard'),
      }),
    );
  });

  it('renders stats for selected user', async () => {
    getUserVoiceStats.mockResolvedValueOnce({
      total_seconds: 7200,
      session_count: 9,
      favorite_channel: 'channel-123',
    });
    const interaction = createInteraction('stats');
    interaction.options.getUser.mockReturnValue({
      id: 'target-user',
      username: 'Target',
      displayName: 'Target Display',
      displayAvatarURL: vi.fn().mockReturnValue('https://cdn.example.com/target.png'),
    });

    await execute(interaction);

    expect(getUserVoiceStats).toHaveBeenCalledWith('guild1', 'target-user');
    const payload = safeEditReply.mock.calls.at(-1)?.[1];
    const fields = payload?.embeds?.[0]?.data?.fields ?? [];
    expect(fields.find((field) => field.name === 'Favourite Channel')?.value).toBe(
      '<#channel-123>',
    );
  });

  it('handles stats errors', async () => {
    getUserVoiceStats.mockRejectedValueOnce(new Error('stats failed'));
    const interaction = createInteraction('stats');

    await execute(interaction);

    expect(logError).toHaveBeenCalledWith(
      'Voice stats failed',
      expect.objectContaining({ error: 'stats failed' }),
    );
    expect(safeEditReply).toHaveBeenCalledWith(
      interaction,
      expect.objectContaining({
        content: expect.stringContaining('Something went wrong fetching voice stats'),
      }),
    );
  });

  it('denies export when member lacks permission', async () => {
    const interaction = createInteraction('export');
    interaction.memberPermissions.has.mockReturnValue(false);

    await execute(interaction);

    expect(safeEditReply).toHaveBeenCalledWith(
      interaction,
      expect.objectContaining({
        content: expect.stringContaining('Manage Server'),
      }),
    );
    expect(exportVoiceSessions).not.toHaveBeenCalled();
  });

  it('returns no-sessions message on empty export result', async () => {
    const interaction = createInteraction('export');
    interaction.options.getString.mockReturnValue('all');
    exportVoiceSessions.mockResolvedValueOnce([]);

    await execute(interaction);

    expect(safeEditReply).toHaveBeenCalledWith(
      interaction,
      expect.objectContaining({
        content: expect.stringContaining('No voice sessions'),
      }),
    );
  });

  it('returns CSV file payload for export', async () => {
    const interaction = createInteraction('export');
    interaction.options.getString.mockReturnValue('week');
    exportVoiceSessions.mockResolvedValueOnce([
      {
        id: 1,
        user_id: 'user-1',
        channel_id: 'channel-1',
        joined_at: new Date('2026-03-01T12:00:00.000Z'),
        left_at: new Date('2026-03-01T12:30:00.000Z'),
        duration_seconds: 1800,
      },
    ]);

    await execute(interaction);

    const payload = safeEditReply.mock.calls.at(-1)?.[1];
    expect(payload.content).toContain('Voice session export');
    expect(payload.files?.[0]?.name).toBe('voice-sessions-guild1-week.csv');
  });

  it('handles export errors', async () => {
    const interaction = createInteraction('export');
    exportVoiceSessions.mockRejectedValueOnce(new Error('export failed'));

    await execute(interaction);

    expect(logError).toHaveBeenCalledWith(
      'Voice export failed',
      expect.objectContaining({ error: 'export failed' }),
    );
    expect(safeEditReply).toHaveBeenCalledWith(
      interaction,
      expect.objectContaining({
        content: expect.stringContaining('Something went wrong exporting voice data'),
      }),
    );
  });
});
