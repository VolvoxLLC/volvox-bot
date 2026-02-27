import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    tldr: { enabled: true, defaultMessages: 50, maxMessages: 200, cooldownSeconds: 300 },
  }),
}));

vi.mock('../../src/utils/safeSend.js', () => ({
  safeEditReply: vi.fn((interaction, opts) => interaction.editReply(opts)),
}));

// Mock @anthropic-ai/sdk
const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => {
  const MockAnthropic = function MockAnthropic() {
    return { messages: { create: mockCreate } };
  };
  return { default: MockAnthropic };
});

// Mock discord.js builders
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
    setName(n) {
      this.name = n;
      return this;
    }
    setDescription(d) {
      this.description = d;
      return this;
    }
    addIntegerOption(fn) {
      fn(chainable());
      return this;
    }
    toJSON() {
      return { name: this.name, description: this.description };
    }
  }

  class MockEmbedBuilder {
    constructor() {
      this._data = { fields: [] };
    }
    setColor(c) {
      this._data.color = c;
      return this;
    }
    setTitle(t) {
      this._data.title = t;
      return this;
    }
    setDescription(d) {
      this._data.description = d;
      return this;
    }
    addFields(...fields) {
      this._data.fields.push(...fields.flat());
      return this;
    }
    setTimestamp() {
      return this;
    }
    setFooter(f) {
      this._data.footer = f;
      return this;
    }
    getData() {
      return this._data;
    }
  }

  return {
    SlashCommandBuilder: MockSlashCommandBuilder,
    EmbedBuilder: MockEmbedBuilder,
  };
});

// ── Helpers ────────────────────────────────────────────────────────────────

import { getConfig } from '../../src/modules/config.js';

/**
 * Build a fake Discord message.
 */
function makeMessage(content, username = 'TestUser', createdAt = new Date()) {
  return {
    content,
    author: { username, bot: false },
    createdAt,
    createdTimestamp: createdAt.getTime(),
  };
}

/**
 * Build a mock interaction.
 */
function createInteraction({ count = null, hours = null } = {}) {
  const now = Date.now();
  const messages = new Map();
  for (let i = 0; i < 60; i++) {
    const id = String(i);
    messages.set(id, makeMessage(`Message ${i}`, 'User', new Date(now - i * 60_000)));
  }

  return {
    guildId: 'guild-1',
    channelId: 'channel-1',
    channel: {
      name: 'general',
      messages: {
        fetch: vi.fn().mockResolvedValue(messages),
      },
    },
    options: {
      getInteger: vi.fn((name) => (name === 'count' ? count : name === 'hours' ? hours : null)),
    },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

import { cooldownMap, data, execute } from '../../src/commands/tldr.js';

beforeEach(() => {
  cooldownMap.clear();
  vi.clearAllMocks();

  // Reset config mock to enabled
  getConfig.mockReturnValue({
    tldr: { enabled: true, defaultMessages: 50, maxMessages: 200, cooldownSeconds: 300 },
  });

  // Default AI response
  mockCreate.mockResolvedValue({
    content: [
      {
        text: 'Key Topics\nSome topic\n\nDecisions Made\nSome decision\n\nAction Items\nSome action\n\nNotable Links\nhttp://example.com',
      },
    ],
  });
});

afterEach(() => {
  cooldownMap.clear();
});

describe('tldr command data', () => {
  it('has correct name and description', () => {
    expect(data.name).toBe('tldr');
    expect(data.description).toContain('Summarize');
  });
});

describe('execute — default 50 message fetch', () => {
  it('fetches with limit 50 by default', async () => {
    const interaction = createInteraction();
    await execute(interaction);

    expect(interaction.channel.messages.fetch).toHaveBeenCalledWith({ limit: 50 });
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: expect.any(Array) }),
    );
  });
});

describe('execute — count option', () => {
  it('fetches with specified count', async () => {
    const interaction = createInteraction({ count: 100 });
    await execute(interaction);

    expect(interaction.channel.messages.fetch).toHaveBeenCalledWith({ limit: 100 });
  });

  it('caps count at maxMessages', async () => {
    getConfig.mockReturnValue({
      tldr: { enabled: true, defaultMessages: 50, maxMessages: 200, cooldownSeconds: 300 },
    });
    const interaction = createInteraction({ count: 999 });
    // getInteger for 'count' returns 999, but buildEmbed should use 200
    // The command clamps to maxMessages
    await execute(interaction);
    expect(interaction.channel.messages.fetch).toHaveBeenCalledWith({ limit: 200 });
  });
});

describe('execute — hours option', () => {
  it('filters messages by time window', async () => {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    // 10 recent messages (within 1h) + 10 old messages
    const messages = new Map();
    for (let i = 0; i < 10; i++) {
      messages.set(`new-${i}`, makeMessage(`New ${i}`, 'U', new Date(now - i * 60_000)));
    }
    for (let i = 0; i < 10; i++) {
      messages.set(
        `old-${i}`,
        makeMessage(`Old ${i}`, 'U', new Date(oneHourAgo - (i + 1) * 60_000)),
      );
    }

    const interaction = createInteraction({ hours: 1 });
    interaction.channel.messages.fetch = vi.fn().mockResolvedValue(messages);

    await execute(interaction);

    // Embed should be called; only 10 new messages should be used
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: expect.any(Array) }),
    );

    // Verify AI was called (only triggered when messages > 0)
    expect(mockCreate).toHaveBeenCalled();

    // The conversation text sent to AI should only contain "New" messages
    const aiCallArg = mockCreate.mock.calls[0][0];
    const userContent = aiCallArg.messages[0].content;
    expect(userContent).toContain('New 0');
    expect(userContent).not.toContain('Old 0');
  });
});

describe('execute — cooldown', () => {
  it('enforces cooldown on second call within window', async () => {
    const interaction = createInteraction();
    await execute(interaction);

    // Second call in same channel — should be rate-limited
    interaction.deferReply.mockClear();
    interaction.editReply.mockClear();

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('Please wait'));
  });

  it('allows second call after cooldown expires', async () => {
    const interaction = createInteraction();

    // Manually put a stale timestamp
    cooldownMap.set('channel-1', Date.now() - 400_000); // 400s ago (> 300s cooldown)

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: expect.any(Array) }),
    );
  });
});

describe('execute — disabled config', () => {
  it('returns error when tldr is disabled', async () => {
    getConfig.mockReturnValue({
      tldr: { enabled: false },
    });
    const interaction = createInteraction();
    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('not enabled'));
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('execute — empty channel', () => {
  it('handles channel with no user messages gracefully', async () => {
    const interaction = createInteraction();
    // All bot messages — filtered out
    const botMessages = new Map([
      [
        '1',
        {
          content: 'bot msg',
          author: { username: 'Bot', bot: true },
          createdAt: new Date(),
          createdTimestamp: Date.now(),
        },
      ],
    ]);
    interaction.channel.messages.fetch = vi.fn().mockResolvedValue(botMessages);

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('No messages found'),
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('handles empty fetch result gracefully', async () => {
    const interaction = createInteraction();
    interaction.channel.messages.fetch = vi.fn().mockResolvedValue(new Map());

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('No messages found'),
    );
  });
});

describe('execute — null/empty AI response', () => {
  it('returns error message when summarizeWithAI returns null', async () => {
    mockCreate.mockResolvedValue({
      content: [], // empty content → null summary
    });

    const interaction = createInteraction();
    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('Failed to generate summary'),
    );
  });

  it('uses channelId when channel.name is null', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          text: '1) Key Topics\n- Test\n\n2) Decisions Made\n- None\n\n3) Action Items\n- None\n\n4) Notable Links\n- None',
        },
      ],
    });

    const interaction = createInteraction();
    interaction.channel.name = null; // force channelId fallback

    await execute(interaction);

    const call = interaction.editReply.mock.calls[0][0];
    const embed = call.embeds?.[0];
    // Should still build embed with channelId as title
    expect(embed).toBeDefined();
  });
});

describe('execute — AI response formatted into embed', () => {
  it('builds embed with all four sections', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          text: '1) Key Topics\n- Deployment pipeline\n- CI/CD fixes\n\n2) Decisions Made\n- Use GitHub Actions\n\n3) Action Items\n- Set up workflow\n\n4) Notable Links\n- https://github.com/actions',
        },
      ],
    });

    const interaction = createInteraction();
    await execute(interaction);

    const call = interaction.editReply.mock.calls[0][0];
    expect(call).toHaveProperty('embeds');
    const embed = call.embeds[0];
    expect(embed).toBeDefined();

    // Check that fields contain expected content
    const fields = embed._data?.fields ?? embed.data?.fields ?? [];
    const names = fields.map((f) => f.name);
    expect(names.some((n) => n.includes('Key Topics'))).toBe(true);
    expect(names.some((n) => n.includes('Decisions'))).toBe(true);
    expect(names.some((n) => n.includes('Action Items'))).toBe(true);
    expect(names.some((n) => n.includes('Notable Links'))).toBe(true);
  });
});
