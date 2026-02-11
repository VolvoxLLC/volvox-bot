import { describe, expect, it, vi } from 'vitest';

// Mock discord.js with proper class mocks
vi.mock('discord.js', () => {
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
    toJSON() {
      return { name: this.name, description: this.description };
    }
  }
  return { SlashCommandBuilder: MockSlashCommandBuilder };
});

import { data, execute } from '../../src/commands/ping.js';

/**
 * Create a mock Discord interaction for ping command tests.
 * @param {Object} overrides - Properties to override on the default mock
 * @returns {Object} Mock interaction object
 */
function createMockInteraction(overrides = {}) {
  return {
    reply: vi.fn().mockResolvedValue({
      resource: {
        message: { createdTimestamp: 1000 },
      },
    }),
    createdTimestamp: 900,
    client: { ws: { ping: 42 } },
    editReply: vi.fn(),
    ...overrides,
  };
}

describe('ping command', () => {
  it('should export data with name and description', () => {
    expect(data.name).toBe('ping');
    expect(data.description).toBeTruthy();
  });

  it('should reply with pong and latency info', async () => {
    const interaction = createMockInteraction();

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: 'Pinging...',
      withResponse: true,
    });

    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('Pong'));
    const editArg = interaction.editReply.mock.calls[0][0];
    expect(editArg).toContain('100ms'); // 1000 - 900
    expect(editArg).toContain('42ms');
  });
});
