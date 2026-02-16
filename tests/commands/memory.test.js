import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock discord.js
vi.mock('discord.js', () => {
  class MockSlashCommandBuilder {
    constructor() {
      this.name = '';
      this.description = '';
      this._subcommands = [];
      this._subcommandGroups = [];
    }
    setName(name) {
      this.name = name;
      return this;
    }
    setDescription(desc) {
      this.description = desc;
      return this;
    }
    addSubcommand(fn) {
      const sub = new MockSubcommandBuilder();
      fn(sub);
      this._subcommands.push(sub);
      return this;
    }
    addSubcommandGroup(fn) {
      const group = new MockSubcommandGroupBuilder();
      fn(group);
      this._subcommandGroups.push(group);
      return this;
    }
    toJSON() {
      return { name: this.name, description: this.description };
    }
  }

  class MockSubcommandGroupBuilder {
    constructor() {
      this.name = '';
      this.description = '';
      this._subcommands = [];
    }
    setName(name) {
      this.name = name;
      return this;
    }
    setDescription(desc) {
      this.description = desc;
      return this;
    }
    addSubcommand(fn) {
      const sub = new MockSubcommandBuilder();
      fn(sub);
      this._subcommands.push(sub);
      return this;
    }
  }

  class MockSubcommandBuilder {
    constructor() {
      this.name = '';
      this.description = '';
      this._options = [];
    }
    setName(name) {
      this.name = name;
      return this;
    }
    setDescription(desc) {
      this.description = desc;
      return this;
    }
    addStringOption(fn) {
      const opt = new MockStringOption();
      fn(opt);
      this._options.push(opt);
      return this;
    }
    addUserOption(fn) {
      const opt = new MockUserOption();
      fn(opt);
      this._options.push(opt);
      return this;
    }
  }

  class MockStringOption {
    constructor() {
      this.name = '';
      this.description = '';
      this.required = false;
    }
    setName(name) {
      this.name = name;
      return this;
    }
    setDescription(desc) {
      this.description = desc;
      return this;
    }
    setRequired(req) {
      this.required = req;
      return this;
    }
  }

  class MockUserOption {
    constructor() {
      this.name = '';
      this.description = '';
      this.required = false;
    }
    setName(name) {
      this.name = name;
      return this;
    }
    setDescription(desc) {
      this.description = desc;
      return this;
    }
    setRequired(req) {
      this.required = req;
      return this;
    }
  }

  class MockButtonBuilder {
    constructor() {
      this._customId = '';
      this._label = '';
      this._style = null;
    }
    setCustomId(id) {
      this._customId = id;
      return this;
    }
    setLabel(label) {
      this._label = label;
      return this;
    }
    setStyle(style) {
      this._style = style;
      return this;
    }
  }

  class MockActionRowBuilder {
    constructor() {
      this._components = [];
    }
    addComponents(...components) {
      this._components.push(...components);
      return this;
    }
  }

  return {
    SlashCommandBuilder: MockSlashCommandBuilder,
    ButtonBuilder: MockButtonBuilder,
    ActionRowBuilder: MockActionRowBuilder,
    ButtonStyle: { Danger: 4, Secondary: 2 },
    ComponentType: { Button: 2 },
    PermissionFlagsBits: {
      ManageGuild: 1n << 5n,
      Administrator: 1n << 3n,
    },
  };
});

// Mock splitMessage utility
vi.mock('../../src/utils/splitMessage.js', () => ({
  splitMessage: vi.fn((text, maxLength) => {
    if (!text || text.length <= (maxLength || 1990)) return text ? [text] : [];
    return [text.slice(0, maxLength || 1990), text.slice(maxLength || 1990)];
  }),
}));

// Mock memory module
vi.mock('../../src/modules/memory.js', () => ({
  isMemoryAvailable: vi.fn(() => true),
  getMemories: vi.fn(() => Promise.resolve([])),
  deleteAllMemories: vi.fn(() => Promise.resolve(true)),
  searchMemories: vi.fn(() => Promise.resolve({ memories: [], relations: [] })),
  deleteMemory: vi.fn(() => Promise.resolve(true)),
}));

// Mock optout module
vi.mock('../../src/modules/optout.js', () => ({
  isOptedOut: vi.fn(() => false),
  toggleOptOut: vi.fn(() => ({ optedOut: true })),
}));

// Mock safeSend wrappers — spies that delegate to the interaction methods
vi.mock('../../src/utils/safeSend.js', () => ({
  safeReply: vi.fn((target, options) => target.reply(options)),
  safeEditReply: vi.fn((interaction, options) => interaction.editReply(options)),
  safeFollowUp: vi.fn((interaction, options) => interaction.followUp(options)),
}));

// Mock logger
vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

import { PermissionFlagsBits } from 'discord.js';
import { data, execute } from '../../src/commands/memory.js';
import {
  deleteAllMemories,
  deleteMemory,
  getMemories,
  isMemoryAvailable,
  searchMemories,
} from '../../src/modules/memory.js';
import { isOptedOut, toggleOptOut } from '../../src/modules/optout.js';
import { safeEditReply, safeReply } from '../../src/utils/safeSend.js';

/**
 * Create a mock interaction for memory command tests.
 * @param {Object} options - Override options
 * @returns {Object} Mock interaction
 */
function createMockInteraction({
  subcommand = 'view',
  subcommandGroup = null,
  topic = null,
  userId = '123456',
  username = 'testuser',
  targetUser = null,
  hasManageGuild = false,
  hasAdmin = false,
} = {}) {
  const mockResponse = {
    awaitMessageComponent: vi.fn(),
  };

  return {
    options: {
      getSubcommand: () => subcommand,
      getSubcommandGroup: () => subcommandGroup,
      getString: (name) => (name === 'topic' ? topic : null),
      getUser: () => targetUser,
    },
    user: { id: userId, username },
    memberPermissions: {
      has: (perm) => {
        if (perm === PermissionFlagsBits.ManageGuild) return hasManageGuild;
        if (perm === PermissionFlagsBits.Administrator) return hasAdmin;
        return false;
      },
    },
    reply: vi.fn().mockResolvedValue(mockResponse),
    deferReply: vi.fn(),
    editReply: vi.fn(),
    _mockResponse: mockResponse,
  };
}

describe('memory command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isMemoryAvailable.mockReturnValue(true);
    getMemories.mockResolvedValue([]);
    deleteAllMemories.mockResolvedValue(true);
    searchMemories.mockResolvedValue({ memories: [], relations: [] });
    deleteMemory.mockResolvedValue(true);
    toggleOptOut.mockReturnValue({ optedOut: true });
    isOptedOut.mockReturnValue(false);
  });

  describe('data export', () => {
    it('should export command data with name "memory"', () => {
      expect(data.name).toBe('memory');
      expect(data.description).toBeTruthy();
    });
  });

  describe('unavailable state', () => {
    it('should reply with unavailable message when memory is not available', async () => {
      isMemoryAvailable.mockReturnValue(false);
      const interaction = createMockInteraction();

      await execute(interaction);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('unavailable'),
          ephemeral: true,
        }),
      );
    });
  });

  describe('/memory view', () => {
    it('should show empty message when no memories exist', async () => {
      getMemories.mockResolvedValue([]);
      const interaction = createMockInteraction({ subcommand: 'view' });

      await execute(interaction);

      expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("don't have any memories"),
        }),
      );
    });

    it('should display formatted memories', async () => {
      getMemories.mockResolvedValue([
        { id: 'mem-1', memory: 'Loves Rust' },
        { id: 'mem-2', memory: 'Works at Google' },
      ]);
      const interaction = createMockInteraction({ subcommand: 'view' });

      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Loves Rust'),
        }),
      );
      expect(interaction.editReply.mock.calls[0][0].content).toContain('Works at Google');
      expect(interaction.editReply.mock.calls[0][0].content).toContain(
        'What I remember about testuser',
      );
    });

    it('should truncate long memory lists', async () => {
      // Create many long memories to exceed 2000 chars
      const memories = Array.from({ length: 50 }, (_, i) => ({
        id: `mem-${i}`,
        memory: `This is a long memory entry number ${i} with lots of detail about the user's preferences and interests that takes up space`,
      }));
      getMemories.mockResolvedValue(memories);
      const interaction = createMockInteraction({ subcommand: 'view' });

      await execute(interaction);

      const content = interaction.editReply.mock.calls[0][0].content;
      expect(content.length).toBeLessThanOrEqual(2000);
      expect(content).toContain('...and more');
    });
  });

  describe('/memory optout', () => {
    it('should toggle opt-out and reply with opted-out message', async () => {
      toggleOptOut.mockReturnValue({ optedOut: true });
      const interaction = createMockInteraction({ subcommand: 'optout' });

      await execute(interaction);

      expect(toggleOptOut).toHaveBeenCalledWith('123456');
      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('opted out'),
          ephemeral: true,
        }),
      );
    });

    it('should toggle opt-in and reply with opted-in message', async () => {
      toggleOptOut.mockReturnValue({ optedOut: false });
      const interaction = createMockInteraction({ subcommand: 'optout' });

      await execute(interaction);

      expect(toggleOptOut).toHaveBeenCalledWith('123456');
      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('opted back in'),
          ephemeral: true,
        }),
      );
    });

    it('should work even when memory system is unavailable', async () => {
      isMemoryAvailable.mockReturnValue(false);
      toggleOptOut.mockReturnValue({ optedOut: true });
      const interaction = createMockInteraction({ subcommand: 'optout' });

      await execute(interaction);

      expect(toggleOptOut).toHaveBeenCalledWith('123456');
      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('opted out'),
          ephemeral: true,
        }),
      );
    });
  });

  describe('/memory forget (all) — confirmation flow', () => {
    it('should show confirmation buttons when forgetting all', async () => {
      const interaction = createMockInteraction({ subcommand: 'forget' });
      interaction._mockResponse.awaitMessageComponent.mockResolvedValue({
        customId: 'memory_forget_confirm',
        update: vi.fn(),
      });

      await execute(interaction);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Are you sure'),
          components: expect.any(Array),
          ephemeral: true,
        }),
      );
    });

    it('should delete memories on confirm', async () => {
      deleteAllMemories.mockResolvedValue(true);
      const mockUpdate = vi.fn();
      const interaction = createMockInteraction({ subcommand: 'forget' });
      interaction._mockResponse.awaitMessageComponent.mockResolvedValue({
        customId: 'memory_forget_confirm',
        update: mockUpdate,
      });

      await execute(interaction);

      expect(deleteAllMemories).toHaveBeenCalledWith('123456');
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('cleared'),
          components: [],
        }),
      );
    });

    it('should show error when deletion fails on confirm', async () => {
      deleteAllMemories.mockResolvedValue(false);
      const mockUpdate = vi.fn();
      const interaction = createMockInteraction({ subcommand: 'forget' });
      interaction._mockResponse.awaitMessageComponent.mockResolvedValue({
        customId: 'memory_forget_confirm',
        update: mockUpdate,
      });

      await execute(interaction);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Failed'),
          components: [],
        }),
      );
    });

    it('should cancel on cancel button', async () => {
      const mockUpdate = vi.fn();
      const interaction = createMockInteraction({ subcommand: 'forget' });
      interaction._mockResponse.awaitMessageComponent.mockResolvedValue({
        customId: 'memory_forget_cancel',
        update: mockUpdate,
      });

      await execute(interaction);

      expect(deleteAllMemories).not.toHaveBeenCalled();
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('cancelled'),
          components: [],
        }),
      );
    });

    it('should timeout after 30 seconds', async () => {
      const interaction = createMockInteraction({ subcommand: 'forget' });
      interaction._mockResponse.awaitMessageComponent.mockRejectedValue(
        new Error('Collector received no interactions before ending with reason: time'),
      );

      await execute(interaction);

      expect(deleteAllMemories).not.toHaveBeenCalled();
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('timed out'),
          components: [],
        }),
      );
    });

    it('should pass correct filter to awaitMessageComponent', async () => {
      const interaction = createMockInteraction({ subcommand: 'forget', userId: 'user789' });
      interaction._mockResponse.awaitMessageComponent.mockResolvedValue({
        customId: 'memory_forget_cancel',
        update: vi.fn(),
      });

      await execute(interaction);

      const awaitCall = interaction._mockResponse.awaitMessageComponent.mock.calls[0][0];
      expect(awaitCall.time).toBe(30_000);

      // Test the filter function
      expect(awaitCall.filter({ user: { id: 'user789' } })).toBe(true);
      expect(awaitCall.filter({ user: { id: 'other_user' } })).toBe(false);
    });
  });

  describe('/memory forget <topic>', () => {
    it('should search and delete matching memories using IDs from search results', async () => {
      searchMemories.mockResolvedValue({
        memories: [{ id: 'mem-1', memory: 'User is learning Rust', score: 0.95 }],
        relations: [],
      });
      deleteMemory.mockResolvedValue(true);

      const interaction = createMockInteraction({
        subcommand: 'forget',
        topic: 'Rust',
      });

      await execute(interaction);

      expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
      expect(searchMemories).toHaveBeenCalledWith('123456', 'Rust', 10);
      expect(deleteMemory).toHaveBeenCalledWith('mem-1');
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('1 memory'),
        }),
      );
    });

    it('should handle no matching memories', async () => {
      searchMemories.mockResolvedValue({ memories: [], relations: [] });
      const interaction = createMockInteraction({
        subcommand: 'forget',
        topic: 'nonexistent',
      });

      await execute(interaction);

      expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('No memories found'),
        }),
      );
    });

    it('should handle deletion failure for matched memories', async () => {
      searchMemories.mockResolvedValue({
        memories: [{ id: 'mem-1', memory: 'Test memory', score: 0.9 }],
        relations: [],
      });
      deleteMemory.mockResolvedValue(false);

      const interaction = createMockInteraction({
        subcommand: 'forget',
        topic: 'test',
      });

      await execute(interaction);

      expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("couldn't delete"),
        }),
      );
    });

    it('should report correct count for multiple parallel deletions', async () => {
      searchMemories.mockResolvedValue({
        memories: [
          { id: 'mem-1', memory: 'Rust project A', score: 0.95 },
          { id: 'mem-2', memory: 'Rust project B', score: 0.9 },
        ],
        relations: [],
      });
      deleteMemory.mockResolvedValue(true);

      const interaction = createMockInteraction({
        subcommand: 'forget',
        topic: 'Rust',
      });

      await execute(interaction);

      expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
      expect(deleteMemory).toHaveBeenCalledTimes(2);
      expect(deleteMemory).toHaveBeenCalledWith('mem-1');
      expect(deleteMemory).toHaveBeenCalledWith('mem-2');
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('2 memories'),
        }),
      );
    });
  });

  describe('/memory admin view', () => {
    it('should reject without proper permissions', async () => {
      const interaction = createMockInteraction({
        subcommand: 'view',
        subcommandGroup: 'admin',
        targetUser: { id: '999', username: 'targetuser' },
        hasManageGuild: false,
        hasAdmin: false,
      });

      await execute(interaction);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Manage Server'),
          ephemeral: true,
        }),
      );
    });

    it('should allow with ManageGuild permission', async () => {
      getMemories.mockResolvedValue([{ id: 'mem-1', memory: 'Target loves coding' }]);
      const interaction = createMockInteraction({
        subcommand: 'view',
        subcommandGroup: 'admin',
        targetUser: { id: '999', username: 'targetuser' },
        hasManageGuild: true,
      });

      await execute(interaction);

      expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
      expect(getMemories).toHaveBeenCalledWith('999');
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('targetuser'),
        }),
      );
    });

    it('should allow with Administrator permission', async () => {
      getMemories.mockResolvedValue([]);
      const interaction = createMockInteraction({
        subcommand: 'view',
        subcommandGroup: 'admin',
        targetUser: { id: '999', username: 'targetuser' },
        hasAdmin: true,
      });

      await execute(interaction);

      expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('No memories found'),
        }),
      );
    });

    it('should show opted-out status for target user', async () => {
      isOptedOut.mockReturnValue(true);
      getMemories.mockResolvedValue([]);
      const interaction = createMockInteraction({
        subcommand: 'view',
        subcommandGroup: 'admin',
        targetUser: { id: '999', username: 'targetuser' },
        hasManageGuild: true,
      });

      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('opted out'),
        }),
      );
    });

    it('should show memories for target user', async () => {
      getMemories.mockResolvedValue([
        { id: 'mem-1', memory: 'Loves TypeScript' },
        { id: 'mem-2', memory: 'Works remotely' },
      ]);
      const interaction = createMockInteraction({
        subcommand: 'view',
        subcommandGroup: 'admin',
        targetUser: { id: '999', username: 'targetuser' },
        hasManageGuild: true,
      });

      await execute(interaction);

      const content = interaction.editReply.mock.calls[0][0].content;
      expect(content).toContain('Loves TypeScript');
      expect(content).toContain('Works remotely');
      expect(content).toContain('targetuser');
    });

    it('should reply unavailable when memory system is down', async () => {
      isMemoryAvailable.mockReturnValue(false);
      const interaction = createMockInteraction({
        subcommand: 'view',
        subcommandGroup: 'admin',
        targetUser: { id: '999', username: 'targetuser' },
        hasManageGuild: true,
      });

      await execute(interaction);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('unavailable'),
          ephemeral: true,
        }),
      );
    });
  });

  describe('/memory admin clear', () => {
    it('should reject without proper permissions', async () => {
      const interaction = createMockInteraction({
        subcommand: 'clear',
        subcommandGroup: 'admin',
        targetUser: { id: '999', username: 'targetuser' },
        hasManageGuild: false,
        hasAdmin: false,
      });

      await execute(interaction);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Manage Server'),
          ephemeral: true,
        }),
      );
    });

    it('should show confirmation with target username', async () => {
      const interaction = createMockInteraction({
        subcommand: 'clear',
        subcommandGroup: 'admin',
        targetUser: { id: '999', username: 'targetuser' },
        hasManageGuild: true,
      });
      interaction._mockResponse.awaitMessageComponent.mockResolvedValue({
        customId: 'memory_admin_clear_cancel',
        update: vi.fn(),
      });

      await execute(interaction);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('targetuser'),
          components: expect.any(Array),
          ephemeral: true,
        }),
      );
    });

    it('should delete target memories on confirm', async () => {
      deleteAllMemories.mockResolvedValue(true);
      const mockUpdate = vi.fn();
      const interaction = createMockInteraction({
        subcommand: 'clear',
        subcommandGroup: 'admin',
        targetUser: { id: '999', username: 'targetuser' },
        hasManageGuild: true,
      });
      interaction._mockResponse.awaitMessageComponent.mockResolvedValue({
        customId: 'memory_admin_clear_confirm',
        update: mockUpdate,
      });

      await execute(interaction);

      expect(deleteAllMemories).toHaveBeenCalledWith('999');
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('targetuser'),
          components: [],
        }),
      );
    });

    it('should show error when admin clear fails', async () => {
      deleteAllMemories.mockResolvedValue(false);
      const mockUpdate = vi.fn();
      const interaction = createMockInteraction({
        subcommand: 'clear',
        subcommandGroup: 'admin',
        targetUser: { id: '999', username: 'targetuser' },
        hasManageGuild: true,
      });
      interaction._mockResponse.awaitMessageComponent.mockResolvedValue({
        customId: 'memory_admin_clear_confirm',
        update: mockUpdate,
      });

      await execute(interaction);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Failed'),
          components: [],
        }),
      );
    });

    it('should cancel on cancel button', async () => {
      const mockUpdate = vi.fn();
      const interaction = createMockInteraction({
        subcommand: 'clear',
        subcommandGroup: 'admin',
        targetUser: { id: '999', username: 'targetuser' },
        hasManageGuild: true,
      });
      interaction._mockResponse.awaitMessageComponent.mockResolvedValue({
        customId: 'memory_admin_clear_cancel',
        update: mockUpdate,
      });

      await execute(interaction);

      expect(deleteAllMemories).not.toHaveBeenCalled();
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('cancelled'),
          components: [],
        }),
      );
    });

    it('should timeout after 30 seconds', async () => {
      const interaction = createMockInteraction({
        subcommand: 'clear',
        subcommandGroup: 'admin',
        targetUser: { id: '999', username: 'targetuser' },
        hasManageGuild: true,
      });
      interaction._mockResponse.awaitMessageComponent.mockRejectedValue(
        new Error('Collector received no interactions before ending with reason: time'),
      );

      await execute(interaction);

      expect(deleteAllMemories).not.toHaveBeenCalled();
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('timed out'),
          components: [],
        }),
      );
    });

    it('should only allow admin user to click buttons', async () => {
      const interaction = createMockInteraction({
        subcommand: 'clear',
        subcommandGroup: 'admin',
        targetUser: { id: '999', username: 'targetuser' },
        hasManageGuild: true,
        userId: 'admin123',
      });
      interaction._mockResponse.awaitMessageComponent.mockResolvedValue({
        customId: 'memory_admin_clear_cancel',
        update: vi.fn(),
      });

      await execute(interaction);

      const awaitCall = interaction._mockResponse.awaitMessageComponent.mock.calls[0][0];
      expect(awaitCall.filter({ user: { id: 'admin123' } })).toBe(true);
      expect(awaitCall.filter({ user: { id: 'other_user' } })).toBe(false);
    });

    it('should handle null memberPermissions', async () => {
      const interaction = createMockInteraction({
        subcommand: 'clear',
        subcommandGroup: 'admin',
        targetUser: { id: '999', username: 'targetuser' },
      });
      interaction.memberPermissions = null;

      await execute(interaction);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Manage Server'),
          ephemeral: true,
        }),
      );
    });
  });

  describe('safeSend wrapper usage verification', () => {
    it('should use safeReply for memory unavailable response', async () => {
      isMemoryAvailable.mockReturnValue(false);
      const interaction = createMockInteraction();

      await execute(interaction);

      expect(safeReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({
          content: expect.stringContaining('unavailable'),
          ephemeral: true,
        }),
      );
    });

    it('should use safeReply for optout response', async () => {
      toggleOptOut.mockReturnValue({ optedOut: true });
      const interaction = createMockInteraction({ subcommand: 'optout' });

      await execute(interaction);

      expect(safeReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({
          content: expect.stringContaining('opted out'),
          ephemeral: true,
        }),
      );
    });

    it('should use safeEditReply for /memory view response', async () => {
      getMemories.mockResolvedValue([{ id: 'mem-1', memory: 'Likes pizza' }]);
      const interaction = createMockInteraction({ subcommand: 'view' });

      await execute(interaction);

      expect(safeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({
          content: expect.stringContaining('Likes pizza'),
        }),
      );
    });

    it('should use safeReply for forget confirmation prompt', async () => {
      const interaction = createMockInteraction({ subcommand: 'forget' });
      interaction._mockResponse.awaitMessageComponent.mockResolvedValue({
        customId: 'memory_forget_cancel',
        update: vi.fn(),
      });

      await execute(interaction);

      expect(safeReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({
          content: expect.stringContaining('Are you sure'),
          components: expect.any(Array),
          ephemeral: true,
        }),
      );
    });

    it('should use safeEditReply for forget topic response', async () => {
      searchMemories.mockResolvedValue({
        memories: [{ id: 'mem-1', memory: 'Test', score: 0.9 }],
        relations: [],
      });
      deleteMemory.mockResolvedValue(true);
      const interaction = createMockInteraction({ subcommand: 'forget', topic: 'test' });

      await execute(interaction);

      expect(safeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({
          content: expect.stringContaining('1 memory'),
        }),
      );
    });

    it('should use safeReply for admin permission denial', async () => {
      const interaction = createMockInteraction({
        subcommand: 'view',
        subcommandGroup: 'admin',
        targetUser: { id: '999', username: 'targetuser' },
      });

      await execute(interaction);

      expect(safeReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({
          content: expect.stringContaining('Manage Server'),
          ephemeral: true,
        }),
      );
    });

    it('should use safeEditReply for admin view response', async () => {
      getMemories.mockResolvedValue([{ id: 'mem-1', memory: 'Admin test' }]);
      const interaction = createMockInteraction({
        subcommand: 'view',
        subcommandGroup: 'admin',
        targetUser: { id: '999', username: 'targetuser' },
        hasManageGuild: true,
      });

      await execute(interaction);

      expect(safeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({
          content: expect.stringContaining('Admin test'),
        }),
      );
    });
  });
});
