import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock discord.js
vi.mock('discord.js', () => {
  class MockSlashCommandBuilder {
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
    toJSON() {
      return { name: this.name, description: this.description };
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

  return { SlashCommandBuilder: MockSlashCommandBuilder };
});

// Mock memory module
vi.mock('../../src/modules/memory.js', () => ({
  isMemoryAvailable: vi.fn(() => true),
  getMemories: vi.fn(() => Promise.resolve([])),
  deleteAllMemories: vi.fn(() => Promise.resolve(true)),
  searchMemories: vi.fn(() => Promise.resolve({ memories: [], relations: [] })),
  deleteMemory: vi.fn(() => Promise.resolve(true)),
}));

// Mock logger
vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

import { data, execute } from '../../src/commands/memory.js';
import {
  deleteAllMemories,
  deleteMemory,
  getMemories,
  isMemoryAvailable,
  searchMemories,
} from '../../src/modules/memory.js';

/**
 * Create a mock interaction for memory command tests.
 * @param {Object} options - Override options
 * @returns {Object} Mock interaction
 */
function createMockInteraction({
  subcommand = 'view',
  topic = null,
  userId = '123456',
  username = 'testuser',
} = {}) {
  return {
    options: {
      getSubcommand: () => subcommand,
      getString: (name) => (name === 'topic' ? topic : null),
    },
    user: { id: userId, username },
    reply: vi.fn(),
    deferReply: vi.fn(),
    editReply: vi.fn(),
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

  describe('/memory forget (all)', () => {
    it('should delete all memories and confirm', async () => {
      deleteAllMemories.mockResolvedValue(true);
      const interaction = createMockInteraction({ subcommand: 'forget' });

      await execute(interaction);

      expect(deleteAllMemories).toHaveBeenCalledWith('123456');
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('cleared'),
        }),
      );
    });

    it('should show error when deletion fails', async () => {
      deleteAllMemories.mockResolvedValue(false);
      const interaction = createMockInteraction({ subcommand: 'forget' });

      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Failed'),
        }),
      );
    });
  });

  describe('/memory forget <topic>', () => {
    it('should search and delete matching memories', async () => {
      searchMemories.mockResolvedValue({
        memories: [{ memory: 'User is learning Rust', score: 0.95 }],
        relations: [],
      });
      getMemories.mockResolvedValue([
        { id: 'mem-1', memory: 'User is learning Rust' },
        { id: 'mem-2', memory: 'User works at Google' },
      ]);
      deleteMemory.mockResolvedValue(true);

      const interaction = createMockInteraction({
        subcommand: 'forget',
        topic: 'Rust',
      });

      await execute(interaction);

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

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('No memories found'),
        }),
      );
    });

    it('should handle deletion failure for matched memories', async () => {
      searchMemories.mockResolvedValue({
        memories: [{ memory: 'Test memory', score: 0.9 }],
        relations: [],
      });
      getMemories.mockResolvedValue([{ id: 'mem-1', memory: 'Test memory' }]);
      deleteMemory.mockResolvedValue(false);

      const interaction = createMockInteraction({
        subcommand: 'forget',
        topic: 'test',
      });

      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("couldn't delete"),
        }),
      );
    });

    it('should report correct count for multiple deletions', async () => {
      searchMemories.mockResolvedValue({
        memories: [
          { memory: 'Rust project A', score: 0.95 },
          { memory: 'Rust project B', score: 0.9 },
        ],
        relations: [],
      });
      getMemories.mockResolvedValue([
        { id: 'mem-1', memory: 'Rust project A' },
        { id: 'mem-2', memory: 'Rust project B' },
      ]);
      deleteMemory.mockResolvedValue(true);

      const interaction = createMockInteraction({
        subcommand: 'forget',
        topic: 'Rust',
      });

      await execute(interaction);

      expect(deleteMemory).toHaveBeenCalledTimes(2);
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('2 memories'),
        }),
      );
    });
  });
});
