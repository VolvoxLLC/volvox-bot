import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    moderation: {
      logging: {
        channels: {
          default: '111',
          warns: '222',
          bans: null,
          kicks: null,
          timeouts: null,
          purges: null,
          locks: null,
        },
      },
    },
  }),
  setConfigValue: vi.fn().mockResolvedValue({}),
}));
vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}));

import { adminOnly, data, execute } from '../../src/commands/modlog.js';
import { getConfig, setConfigValue } from '../../src/modules/config.js';

function createInteraction(subcommand) {
  const collectHandlers = {};
  return {
    options: {
      getSubcommand: vi.fn().mockReturnValue(subcommand),
    },
    user: { id: 'mod1', tag: 'Mod#0001' },
    reply: vi.fn().mockResolvedValue({
      createMessageComponentCollector: vi.fn().mockReturnValue({
        on: vi.fn().mockImplementation((event, handler) => {
          collectHandlers[event] = handler;
        }),
        stop: vi.fn(),
      }),
    }),
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    _collectHandlers: collectHandlers,
  };
}

describe('modlog command', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should export data with correct name', () => {
    expect(data.name).toBe('modlog');
  });

  it('should export adminOnly flag', () => {
    expect(adminOnly).toBe(true);
  });

  it('should reply for unknown subcommand', async () => {
    const interaction = createInteraction('wat');
    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Unknown subcommand') }),
    );
  });

  describe('view subcommand', () => {
    it('should display current log routing config', async () => {
      const interaction = createInteraction('view');
      await execute(interaction);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
          ephemeral: true,
        }),
      );
    });

    it('should handle missing logging config', async () => {
      getConfig.mockReturnValueOnce({ moderation: {} });
      const interaction = createInteraction('view');
      await execute(interaction);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
          ephemeral: true,
        }),
      );
    });
  });

  describe('disable subcommand', () => {
    it('should clear all log channels', async () => {
      const interaction = createInteraction('disable');
      await execute(interaction);

      expect(setConfigValue).toHaveBeenCalledTimes(7);
      expect(setConfigValue).toHaveBeenCalledWith('moderation.logging.channels.default', null);
      expect(setConfigValue).toHaveBeenCalledWith('moderation.logging.channels.warns', null);
      expect(setConfigValue).toHaveBeenCalledWith('moderation.logging.channels.bans', null);
      expect(setConfigValue).toHaveBeenCalledWith('moderation.logging.channels.kicks', null);
      expect(setConfigValue).toHaveBeenCalledWith('moderation.logging.channels.timeouts', null);
      expect(setConfigValue).toHaveBeenCalledWith('moderation.logging.channels.purges', null);
      expect(setConfigValue).toHaveBeenCalledWith('moderation.logging.channels.locks', null);

      expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('disabled'));
    });
  });

  describe('setup subcommand', () => {
    it('should send reply with components and create collector', async () => {
      const interaction = createInteraction('setup');
      await execute(interaction);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
          components: expect.any(Array),
          ephemeral: true,
          fetchReply: true,
        }),
      );
    });

    it('should handle "done" button click', async () => {
      const interaction = createInteraction('setup');
      await execute(interaction);

      const collectHandler = interaction._collectHandlers.collect;
      expect(collectHandler).toBeDefined();

      const doneInteraction = {
        customId: 'modlog_done',
        update: vi.fn().mockResolvedValue(undefined),
      };
      await collectHandler(doneInteraction);
      expect(doneInteraction.update).toHaveBeenCalledWith(
        expect.objectContaining({ components: [] }),
      );
    });

    it('should handle category selection', async () => {
      const interaction = createInteraction('setup');
      await execute(interaction);

      const collectHandler = interaction._collectHandlers.collect;

      const categoryInteraction = {
        customId: 'modlog_category',
        values: ['warns'],
        update: vi.fn().mockResolvedValue(undefined),
      };
      await collectHandler(categoryInteraction);
      expect(categoryInteraction.update).toHaveBeenCalledWith(
        expect.objectContaining({ components: expect.any(Array) }),
      );
    });

    it('should handle channel selection after category', async () => {
      const interaction = createInteraction('setup');
      await execute(interaction);

      const collectHandler = interaction._collectHandlers.collect;

      // First select category
      const categoryInteraction = {
        customId: 'modlog_category',
        values: ['warns'],
        update: vi.fn().mockResolvedValue(undefined),
      };
      await collectHandler(categoryInteraction);

      // Then select channel
      const channelInteraction = {
        customId: 'modlog_channel',
        values: ['999'],
        update: vi.fn().mockResolvedValue(undefined),
      };
      await collectHandler(channelInteraction);

      expect(setConfigValue).toHaveBeenCalledWith('moderation.logging.channels.warns', '999');
      expect(channelInteraction.update).toHaveBeenCalled();
    });

    it('should ignore channel selection without prior category', async () => {
      const interaction = createInteraction('setup');
      await execute(interaction);

      const collectHandler = interaction._collectHandlers.collect;

      // Channel selection without prior category selection
      const channelInteraction = {
        customId: 'modlog_channel',
        values: ['999'],
        update: vi.fn().mockResolvedValue(undefined),
      };
      await collectHandler(channelInteraction);

      expect(setConfigValue).not.toHaveBeenCalled();
    });

    it('should handle collector timeout', async () => {
      const interaction = createInteraction('setup');
      await execute(interaction);

      const endHandler = interaction._collectHandlers.end;
      expect(endHandler).toBeDefined();

      await endHandler([], 'time');
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ components: [] }),
      );
    });

    it('should not edit reply on non-timeout end', async () => {
      const interaction = createInteraction('setup');
      await execute(interaction);

      const endHandler = interaction._collectHandlers.end;
      await endHandler([], 'user');

      // editReply should NOT be called since reason is not 'time'
      expect(interaction.editReply).not.toHaveBeenCalled();
    });
  });
});
