import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/db.js', () => ({
  getPool: vi.fn(),
}));

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn(),
  setConfigValue: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/utils/permissions.js', () => ({
  isAdmin: vi.fn().mockReturnValue(true),
}));

vi.mock('../../src/utils/safeSend.js', () => ({
  safeSend: vi.fn(),
  safeReply: (t, opts) => t.reply(opts),
  safeEditReply: (t, opts) => t.editReply(opts),
}));

vi.mock('discord.js', () => {
  function chainable() {
    const proxy = new Proxy(() => proxy, {
      get: () => () => proxy,
      apply: () => proxy,
    });
    return proxy;
  }

  class MockSlashCommandBuilder {
    constructor() {
      this.name = '';
      this.description = '';
    }
    setName(name) {
      this.name = name;
      return this;
    }
    setDescription(desc) {
      this.description = desc;
      return this;
    }
    addSubcommandGroup(fn) {
      const group = {
        setName: () => ({
          setDescription: () => ({
            addSubcommand: function self(fn2) {
              const sub = {
                setName: () => ({
                  setDescription: () => ({
                    addStringOption: function opt(fn3) {
                      fn3(chainable());
                      return { addStringOption: opt, addChannelOption: opt };
                    },
                    addChannelOption: function opt(fn3) {
                      fn3(chainable());
                      return { addStringOption: opt, addChannelOption: opt };
                    },
                  }),
                }),
              };
              fn2(sub);
              return { addSubcommand: self };
            },
          }),
        }),
      };
      fn(group);
      return this;
    }
    toJSON() {
      return { name: this.name };
    }
  }

  return {
    SlashCommandBuilder: MockSlashCommandBuilder,
    ChannelType: { GuildText: 0 },
  };
});

import { data, execute, isValidRepo } from '../../src/commands/github.js';
import { getPool } from '../../src/db.js';
import { getConfig, setConfigValue } from '../../src/modules/config.js';
import { isAdmin } from '../../src/utils/permissions.js';

/** Build a mock interaction */
function makeInteraction(subcommandGroup, subcommand, options = {}) {
  return {
    guildId: 'guild-123',
    user: { id: 'user-456' },
    member: {
      id: 'user-456',
      permissions: { has: vi.fn().mockReturnValue(true) },
      roles: { cache: { has: vi.fn().mockReturnValue(false) } },
    },
    options: {
      getSubcommandGroup: vi.fn().mockReturnValue(subcommandGroup),
      getSubcommand: vi.fn().mockReturnValue(subcommand),
      getString: vi.fn((name) => options[name] ?? null),
      getChannel: vi.fn(() => options.channel ?? null),
    },
    reply: vi.fn(),
    editReply: vi.fn(),
    deferReply: vi.fn(),
  };
}

describe('isValidRepo', () => {
  it('accepts valid owner/repo', () => {
    expect(isValidRepo('VolvoxLLC/volvox-bot')).toBe(true);
    expect(isValidRepo('bill/my-project')).toBe(true);
  });

  it('rejects missing slash', () => {
    expect(isValidRepo('noslash')).toBe(false);
  });

  it('rejects too many slashes', () => {
    expect(isValidRepo('too/many/parts')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidRepo('')).toBe(false);
  });

  it('rejects null / undefined', () => {
    expect(isValidRepo(null)).toBe(false);
    expect(isValidRepo(undefined)).toBe(false);
  });
});

describe('github command', () => {
  let mockPool;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };
    getPool.mockReturnValue(mockPool);
    isAdmin.mockReturnValue(true);

    getConfig.mockReturnValue({
      github: {
        feed: {
          enabled: true,
          channelId: 'ch-1',
          repos: [],
          events: ['pr', 'issue', 'release', 'push'],
          pollIntervalMinutes: 5,
        },
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should export data with name "github"', () => {
    expect(data.name).toBe('github');
  });

  describe('when feed is disabled', () => {
    it('should reply with disabled message', async () => {
      getConfig.mockReturnValue({ github: { feed: { enabled: false } } });
      const interaction = makeInteraction('feed', 'list');
      await execute(interaction);
      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('not enabled'),
          ephemeral: true,
        }),
      );
    });
  });

  describe('admin-only subcommands', () => {
    it('should deny non-admins for add', async () => {
      isAdmin.mockReturnValue(false);
      const interaction = makeInteraction('feed', 'add', { repo: 'owner/repo' });
      await execute(interaction);
      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Administrator permission'),
          ephemeral: true,
        }),
      );
    });

    it('should deny non-admins for remove', async () => {
      isAdmin.mockReturnValue(false);
      const interaction = makeInteraction('feed', 'remove', { repo: 'owner/repo' });
      await execute(interaction);
      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Administrator permission'),
          ephemeral: true,
        }),
      );
    });

    it('should deny non-admins for channel', async () => {
      isAdmin.mockReturnValue(false);
      const interaction = makeInteraction('feed', 'channel', {
        channel: { id: 'ch-2' },
      });
      await execute(interaction);
      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Administrator permission'),
          ephemeral: true,
        }),
      );
    });

    it('should allow non-admins to use list', async () => {
      isAdmin.mockReturnValue(false);
      const interaction = makeInteraction('feed', 'list');
      await execute(interaction);
      // Should reach list handler (deferReply called, not blocked)
      expect(interaction.deferReply).toHaveBeenCalled();
    });
  });

  describe('feed add', () => {
    it('should add a valid repo', async () => {
      const interaction = makeInteraction('feed', 'add', { repo: 'VolvoxLLC/volvox-bot' });
      await execute(interaction);
      expect(setConfigValue).toHaveBeenCalledWith(
        'github.feed.repos',
        expect.arrayContaining(['VolvoxLLC/volvox-bot']),
        'guild-123',
      );
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Now tracking') }),
      );
    });

    it('should reject invalid repo format', async () => {
      const interaction = makeInteraction('feed', 'add', { repo: 'notarepo' });
      await execute(interaction);
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Invalid repo format'),
        }),
      );
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should warn if repo already tracked', async () => {
      getConfig.mockReturnValue({
        github: {
          feed: {
            enabled: true,
            channelId: 'ch-1',
            repos: ['VolvoxLLC/volvox-bot'],
            events: ['pr'],
            pollIntervalMinutes: 5,
          },
        },
      });
      const interaction = makeInteraction('feed', 'add', { repo: 'VolvoxLLC/volvox-bot' });
      await execute(interaction);
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('already being tracked') }),
      );
    });
  });

  describe('feed remove', () => {
    it('should remove a tracked repo', async () => {
      getConfig.mockReturnValue({
        github: {
          feed: {
            enabled: true,
            channelId: 'ch-1',
            repos: ['VolvoxLLC/volvox-bot'],
            events: ['pr'],
            pollIntervalMinutes: 5,
          },
        },
      });
      const interaction = makeInteraction('feed', 'remove', { repo: 'VolvoxLLC/volvox-bot' });
      await execute(interaction);
      expect(setConfigValue).toHaveBeenCalledWith('github.feed.repos', [], 'guild-123');
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Stopped tracking') }),
      );
    });

    it('should warn if repo not tracked', async () => {
      const interaction = makeInteraction('feed', 'remove', { repo: 'nobody/nothing' });
      await execute(interaction);
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('not currently tracked') }),
      );
    });
  });

  describe('feed list', () => {
    it('should list tracked repos', async () => {
      getConfig.mockReturnValue({
        github: {
          feed: {
            enabled: true,
            channelId: 'ch-1',
            repos: ['VolvoxLLC/volvox-bot', 'bill/other'],
            events: ['pr'],
            pollIntervalMinutes: 5,
          },
        },
      });
      const interaction = makeInteraction('feed', 'list');
      await execute(interaction);
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('VolvoxLLC/volvox-bot'),
        }),
      );
    });

    it('should show empty message when no repos', async () => {
      const interaction = makeInteraction('feed', 'list');
      await execute(interaction);
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('No repos'),
        }),
      );
    });
  });

  describe('feed channel', () => {
    it('should set the feed channel', async () => {
      const interaction = makeInteraction('feed', 'channel', {
        channel: { id: 'ch-new' },
      });
      await execute(interaction);
      expect(setConfigValue).toHaveBeenCalledWith('github.feed.channelId', 'ch-new', 'guild-123');
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('ch-new'),
        }),
      );
    });
  });
});
