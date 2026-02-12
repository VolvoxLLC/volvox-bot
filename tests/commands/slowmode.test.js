import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/duration.js', () => ({
  parseDuration: vi.fn(),
  formatDuration: vi.fn().mockImplementation((ms) => {
    if (ms === 300000) return '5 minutes';
    if (ms === 21600000) return '6 hours';
    if (ms === 86400000) return '1 day';
    if (ms === 60000) return '1 minute';
    return 'duration';
  }),
}));
vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({ moderation: { logging: { channels: { default: '123' } } } }),
}));
vi.mock('../../src/modules/moderation.js', () => ({
  createCase: vi.fn().mockResolvedValue({ case_number: 12, action: 'slowmode', id: 12 }),
  sendModLogEmbed: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}));

import { adminOnly, data, execute } from '../../src/commands/slowmode.js';
import { createCase } from '../../src/modules/moderation.js';
import { parseDuration } from '../../src/utils/duration.js';

function createInteraction(duration = '5m', channel = null) {
  const mockChannel = channel || {
    id: 'ch1',
    name: 'general',
    setRateLimitPerUser: vi.fn().mockResolvedValue(undefined),
    toString: () => '<#ch1>',
  };

  return {
    options: {
      getString: vi.fn().mockImplementation((name) => {
        if (name === 'duration') return duration;
        if (name === 'reason') return null;
        return null;
      }),
      getChannel: vi.fn().mockReturnValue(null),
    },
    channel: mockChannel,
    guild: { id: 'guild1' },
    user: { id: 'mod1', tag: 'Mod#0001' },
    client: {},
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
  };
}

describe('slowmode command', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should export data with correct name', () => {
    expect(data.name).toBe('slowmode');
  });

  it('should export adminOnly flag', () => {
    expect(adminOnly).toBe(true);
  });

  it('should set slowmode with valid duration and create case', async () => {
    parseDuration.mockReturnValue(300000); // 5 minutes

    const interaction = createInteraction('5m');
    await execute(interaction);

    expect(interaction.channel.setRateLimitPerUser).toHaveBeenCalledWith(300);
    expect(createCase).toHaveBeenCalledWith(
      'guild1',
      expect.objectContaining({ action: 'slowmode', targetId: 'ch1' }),
    );
    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('Slowmode set to'));
  });

  it('should disable slowmode with "0"', async () => {
    const interaction = createInteraction('0');
    await execute(interaction);

    expect(interaction.channel.setRateLimitPerUser).toHaveBeenCalledWith(0);
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('Slowmode disabled'),
    );
  });

  it('should reject invalid duration', async () => {
    parseDuration.mockReturnValue(null);

    const interaction = createInteraction('abc');
    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('Invalid duration'));
  });

  it('should reject duration exceeding 6 hours', async () => {
    parseDuration.mockReturnValue(7 * 60 * 60 * 1000); // 7 hours

    const interaction = createInteraction('7h');
    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('cannot exceed 6 hours'),
    );
    expect(interaction.channel.setRateLimitPerUser).not.toHaveBeenCalled();
  });

  it('should use specified channel when provided', async () => {
    parseDuration.mockReturnValue(60000); // 1 minute
    const targetChannel = {
      id: 'ch2',
      name: 'other',
      setRateLimitPerUser: vi.fn().mockResolvedValue(undefined),
      toString: () => '<#ch2>',
    };

    const interaction = createInteraction('1m');
    interaction.options.getChannel = vi.fn().mockReturnValue(targetChannel);
    await execute(interaction);

    expect(targetChannel.setRateLimitPerUser).toHaveBeenCalledWith(60);
  });

  it('should handle errors gracefully', async () => {
    parseDuration.mockReturnValue(60000);

    const interaction = createInteraction('1m');
    interaction.channel.setRateLimitPerUser = vi
      .fn()
      .mockRejectedValue(new Error('Missing permissions'));
    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('An error occurred'),
    );
  });
});
