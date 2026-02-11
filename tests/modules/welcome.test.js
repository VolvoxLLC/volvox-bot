import { describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

import {
  recordCommunityActivity,
  renderWelcomeMessage,
  sendWelcomeMessage,
} from '../../src/modules/welcome.js';

describe('renderWelcomeMessage', () => {
  it('should replace {user} with mention', () => {
    const result = renderWelcomeMessage(
      'Hello {user}!',
      { id: '123' },
      { name: 'Test', memberCount: 10 },
    );
    expect(result).toBe('Hello <@123>!');
  });

  it('should replace {username} with username', () => {
    const result = renderWelcomeMessage(
      'Hello {username}!',
      { id: '123', username: 'testuser' },
      { name: 'Test', memberCount: 10 },
    );
    expect(result).toBe('Hello testuser!');
  });

  it('should replace {server} with guild name', () => {
    const result = renderWelcomeMessage(
      'Welcome to {server}!',
      { id: '123' },
      { name: 'My Server', memberCount: 10 },
    );
    expect(result).toBe('Welcome to My Server!');
  });

  it('should replace {memberCount}', () => {
    const result = renderWelcomeMessage(
      'You are member #{memberCount}!',
      { id: '123' },
      { name: 'Test', memberCount: 42 },
    );
    expect(result).toBe('You are member #42!');
  });

  it('should handle multiple replacements', () => {
    const result = renderWelcomeMessage(
      'Welcome {user} ({username}) to {server}! Member #{memberCount}',
      { id: '123', username: 'bob' },
      { name: 'Cool Server', memberCount: 100 },
    );
    expect(result).toBe('Welcome <@123> (bob) to Cool Server! Member #100');
  });

  it('should handle missing username', () => {
    const result = renderWelcomeMessage(
      '{username}',
      { id: '123' },
      { name: 'Test', memberCount: 1 },
    );
    expect(result).toBe('Unknown');
  });
});

describe('recordCommunityActivity', () => {
  it('should not crash on null message', () => {
    recordCommunityActivity(null, {});
  });

  it('should not record for bot messages', () => {
    const message = {
      guild: { id: 'g1' },
      channel: { id: 'c1', isTextBased: () => true },
      author: { bot: true },
    };
    recordCommunityActivity(message, {});
  });

  it('should not record for non-text channels', () => {
    const message = {
      guild: { id: 'g1' },
      channel: { id: 'c1', isTextBased: () => false },
      author: { bot: false },
    };
    recordCommunityActivity(message, {});
  });

  it('should not record for excluded channels', () => {
    const message = {
      guild: { id: 'g1' },
      channel: { id: 'excluded-ch', isTextBased: () => true },
      author: { bot: false },
    };
    const config = {
      welcome: {
        dynamic: { excludeChannels: ['excluded-ch'] },
      },
    };
    recordCommunityActivity(message, config);
  });

  it('should record activity for valid messages', () => {
    const message = {
      guild: { id: 'g1' },
      channel: { id: 'c1', isTextBased: () => true },
      author: { bot: false },
    };
    const config = { welcome: { dynamic: {} } };
    // Should not throw
    recordCommunityActivity(message, config);
  });

  it('should handle messages with no guild', () => {
    const message = {
      guild: null,
      channel: { id: 'c1', isTextBased: () => true },
      author: { bot: false },
    };
    recordCommunityActivity(message, {});
  });

  it('should handle empty dynamic config', () => {
    const message = {
      guild: { id: 'g1' },
      channel: { id: 'c1', isTextBased: () => true },
      author: { bot: false },
    };
    recordCommunityActivity(message, {});
  });
});

describe('sendWelcomeMessage', () => {
  it('should not send if welcome is disabled', async () => {
    const member = { user: { tag: 'user#1234' }, guild: { name: 'Test' } };
    const client = { channels: { fetch: vi.fn() } };
    const config = { welcome: { enabled: false } };
    await sendWelcomeMessage(member, client, config);
    expect(client.channels.fetch).not.toHaveBeenCalled();
  });

  it('should not send if no channelId configured', async () => {
    const member = { user: { tag: 'user#1234' }, guild: { name: 'Test' } };
    const client = { channels: { fetch: vi.fn() } };
    const config = { welcome: { enabled: true } };
    await sendWelcomeMessage(member, client, config);
    expect(client.channels.fetch).not.toHaveBeenCalled();
  });

  it('should not send if channel cannot be fetched', async () => {
    const member = {
      id: '123',
      user: { tag: 'user#1234', username: 'user' },
      guild: { name: 'Test', memberCount: 10 },
    };
    const client = { channels: { fetch: vi.fn().mockResolvedValue(null) } };
    const config = { welcome: { enabled: true, channelId: 'ch1' } };
    await sendWelcomeMessage(member, client, config);
  });

  it('should send static welcome message', async () => {
    const mockSend = vi.fn();
    const member = {
      id: '123',
      user: { tag: 'user#1234', username: 'testuser' },
      guild: { name: 'Test Server', memberCount: 50 },
    };
    const client = { channels: { fetch: vi.fn().mockResolvedValue({ send: mockSend }) } };
    const config = {
      welcome: {
        enabled: true,
        channelId: 'ch1',
        message: 'Welcome {user} to {server}!',
      },
    };
    await sendWelcomeMessage(member, client, config);
    expect(mockSend).toHaveBeenCalledWith('Welcome <@123> to Test Server!');
  });

  it('should send dynamic welcome message when enabled', async () => {
    const mockSend = vi.fn();
    const member = {
      id: '123',
      user: { tag: 'user#1234', username: 'testuser' },
      guild: {
        name: 'Test Server',
        memberCount: 50,
        channels: {
          cache: {
            filter: vi.fn().mockReturnValue({ size: 0, values: () => [] }),
            has: vi.fn().mockReturnValue(false),
          },
        },
      },
    };
    const client = { channels: { fetch: vi.fn().mockResolvedValue({ send: mockSend }) } };
    const config = {
      welcome: {
        enabled: true,
        channelId: 'ch1',
        dynamic: {
          enabled: true,
          timezone: 'America/New_York',
        },
      },
    };
    await sendWelcomeMessage(member, client, config);
    expect(mockSend).toHaveBeenCalled();
    const sentMessage = mockSend.mock.calls[0][0];
    expect(sentMessage).toContain('<@123>');
  });

  it('should handle errors gracefully', async () => {
    const member = {
      id: '123',
      user: { tag: 'user#1234', username: 'testuser' },
      guild: { name: 'Test', memberCount: 10 },
    };
    const client = { channels: { fetch: vi.fn().mockRejectedValue(new Error('channel error')) } };
    const config = { welcome: { enabled: true, channelId: 'ch1' } };

    // Should not throw
    await sendWelcomeMessage(member, client, config);
  });

  it('should send dynamic message with milestone', async () => {
    const mockSend = vi.fn();
    const member = {
      id: '123',
      user: { tag: 'user#1234', username: 'testuser' },
      guild: {
        name: 'Test Server',
        memberCount: 100, // Notable milestone
        channels: {
          cache: {
            filter: vi.fn().mockReturnValue({ size: 0, values: () => [] }),
            has: vi.fn().mockReturnValue(false),
          },
        },
      },
    };
    const client = { channels: { fetch: vi.fn().mockResolvedValue({ send: mockSend }) } };
    const config = {
      welcome: {
        enabled: true,
        channelId: 'ch1',
        dynamic: {
          enabled: true,
          timezone: 'UTC',
        },
      },
    };
    await sendWelcomeMessage(member, client, config);
    const sentMessage = mockSend.mock.calls[0][0];
    expect(sentMessage).toContain('#100');
    expect(sentMessage).toContain('milestone');
  });

  it('should use default welcome message if not configured', async () => {
    const mockSend = vi.fn();
    const member = {
      id: '123',
      user: { tag: 'user#1234', username: 'testuser' },
      guild: { name: 'Test', memberCount: 10 },
    };
    const client = { channels: { fetch: vi.fn().mockResolvedValue({ send: mockSend }) } };
    const config = { welcome: { enabled: true, channelId: 'ch1' } };
    await sendWelcomeMessage(member, client, config);
    expect(mockSend).toHaveBeenCalledWith('Welcome, <@123>!');
  });

  it('should send dynamic message with highlight channels', async () => {
    const mockSend = vi.fn();
    const member = {
      id: '123',
      user: { tag: 'user#1234', username: 'testuser' },
      guild: {
        name: 'Test Server',
        memberCount: 51,
        channels: {
          cache: {
            filter: vi.fn().mockReturnValue({ size: 0, values: () => [] }),
            has: vi.fn().mockReturnValue(true),
          },
        },
      },
    };
    const client = { channels: { fetch: vi.fn().mockResolvedValue({ send: mockSend }) } };
    const config = {
      welcome: {
        enabled: true,
        channelId: 'ch1',
        message: 'Hello <#111> and <#222>',
        dynamic: {
          enabled: true,
          timezone: 'UTC',
          highlightChannels: ['ch-intro', 'ch-general'],
        },
      },
    };
    await sendWelcomeMessage(member, client, config);
    expect(mockSend).toHaveBeenCalled();
  });

  it('should send dynamic message with active voice channels', async () => {
    const mockSend = vi.fn();
    const voiceChannel = {
      isVoiceBased: () => true,
      members: { size: 3 },
    };
    const member = {
      id: '123',
      user: { tag: 'user#1234', username: 'testuser' },
      guild: {
        name: 'Test Server',
        memberCount: 51,
        channels: {
          cache: {
            filter: vi.fn().mockReturnValue({
              size: 1,
              values: () => [voiceChannel][Symbol.iterator](),
            }),
            has: vi.fn().mockReturnValue(false),
          },
        },
      },
    };
    const client = { channels: { fetch: vi.fn().mockResolvedValue({ send: mockSend }) } };
    const config = {
      welcome: {
        enabled: true,
        channelId: 'ch1',
        dynamic: { enabled: true, timezone: 'UTC' },
      },
    };

    // Record some light activity to get "light" level with voice
    for (let i = 0; i < 2; i++) {
      recordCommunityActivity(
        {
          guild: { id: member.guild.id || 'test-guild' },
          channel: { id: `voice-test-ch-${i}`, isTextBased: () => true },
          author: { bot: false },
        },
        config,
      );
    }

    await sendWelcomeMessage(member, client, config);
    expect(mockSend).toHaveBeenCalled();
  });

  it('should send dynamic message with 3 suggested channels (3-channel CTA)', async () => {
    const mockSend = vi.fn();
    const member = {
      id: '123',
      user: { tag: 'user#1234', username: 'testuser' },
      guild: {
        name: 'Test Server',
        memberCount: 51,
        channels: {
          cache: {
            filter: vi.fn().mockReturnValue({ size: 0, values: () => [][Symbol.iterator]() }),
            has: vi.fn().mockReturnValue(true),
          },
        },
      },
    };
    const client = { channels: { fetch: vi.fn().mockResolvedValue({ send: mockSend }) } };
    const config = {
      welcome: {
        enabled: true,
        channelId: 'ch1',
        message: 'Hello <#111> and <#222> and <#333>',
        dynamic: {
          enabled: true,
          timezone: 'UTC',
          highlightChannels: ['ch-intro', 'ch-general', 'ch-projects'],
        },
      },
    };
    await sendWelcomeMessage(member, client, config);
    expect(mockSend).toHaveBeenCalled();
  });

  it('should handle dynamic message with milestone interval', async () => {
    const mockSend = vi.fn();
    const member = {
      id: '123',
      user: { tag: 'user#1234', username: 'testuser' },
      guild: {
        name: 'Test',
        memberCount: 75, // 75 % 25 === 0 → milestone
        channels: {
          cache: {
            filter: vi.fn().mockReturnValue({ size: 0, values: () => [] }),
            has: vi.fn().mockReturnValue(false),
          },
        },
      },
    };
    const client = { channels: { fetch: vi.fn().mockResolvedValue({ send: mockSend }) } };
    const config = {
      welcome: {
        enabled: true,
        channelId: 'ch1',
        dynamic: { enabled: true, timezone: 'UTC', milestoneInterval: 25 },
      },
    };
    await sendWelcomeMessage(member, client, config);
    const msg = mockSend.mock.calls[0][0];
    expect(msg).toContain('milestone');
  });
});
