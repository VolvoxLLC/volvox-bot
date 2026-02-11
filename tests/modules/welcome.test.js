import { describe, expect, it, vi } from 'vitest';
import {
  recordCommunityActivity,
  renderWelcomeMessage,
  sendWelcomeMessage,
} from '../../src/modules/welcome.js';

describe('renderWelcomeMessage', () => {
  it('should replace {user} placeholder with mention', () => {
    const template = 'Welcome {user}!';
    const member = { id: '123456789', username: 'TestUser' };
    const guild = { name: 'Test Server', memberCount: 100 };

    const result = renderWelcomeMessage(template, member, guild);

    expect(result).toBe('Welcome <@123456789>!');
  });

  it('should replace {username} placeholder', () => {
    const template = 'Hello {username}!';
    const member = { id: '123', username: 'TestUser' };
    const guild = { name: 'Test Server', memberCount: 100 };

    const result = renderWelcomeMessage(template, member, guild);

    expect(result).toBe('Hello TestUser!');
  });

  it('should replace {server} placeholder', () => {
    const template = 'Welcome to {server}!';
    const member = { id: '123', username: 'TestUser' };
    const guild = { name: 'My Cool Server', memberCount: 100 };

    const result = renderWelcomeMessage(template, member, guild);

    expect(result).toBe('Welcome to My Cool Server!');
  });

  it('should replace {memberCount} placeholder', () => {
    const template = 'You are member #{memberCount}!';
    const member = { id: '123', username: 'TestUser' };
    const guild = { name: 'Test Server', memberCount: 42 };

    const result = renderWelcomeMessage(template, member, guild);

    expect(result).toBe('You are member #42!');
  });

  it('should replace all placeholders', () => {
    const template = 'Welcome {user} ({username}) to {server}! Member #{memberCount}';
    const member = { id: '123', username: 'TestUser' };
    const guild = { name: 'Test Server', memberCount: 100 };

    const result = renderWelcomeMessage(template, member, guild);

    expect(result).toBe('Welcome <@123> (TestUser) to Test Server! Member #100');
  });

  it('should replace multiple occurrences of same placeholder', () => {
    const template = '{user} {user} {user}';
    const member = { id: '123', username: 'TestUser' };
    const guild = { name: 'Test Server', memberCount: 100 };

    const result = renderWelcomeMessage(template, member, guild);

    expect(result).toBe('<@123> <@123> <@123>');
  });

  it('should handle missing username gracefully', () => {
    const template = 'Welcome {username}!';
    const member = { id: '123' };
    const guild = { name: 'Test Server', memberCount: 100 };

    const result = renderWelcomeMessage(template, member, guild);

    expect(result).toBe('Welcome Unknown!');
  });

  it('should handle template with no placeholders', () => {
    const template = 'Welcome to the server!';
    const member = { id: '123', username: 'TestUser' };
    const guild = { name: 'Test Server', memberCount: 100 };

    const result = renderWelcomeMessage(template, member, guild);

    expect(result).toBe('Welcome to the server!');
  });
});

describe('recordCommunityActivity', () => {
  it('should not record activity for bot messages', () => {
    const message = {
      guild: { id: 'guild1' },
      channel: { id: 'channel1', isTextBased: () => true },
      author: { bot: true },
    };
    const config = { welcome: { dynamic: {} } };

    // Should not throw
    expect(() => recordCommunityActivity(message, config)).not.toThrow();
  });

  it('should not record activity for DM messages', () => {
    const message = {
      guild: null,
      channel: { id: 'dm1', isTextBased: () => true },
      author: { bot: false },
    };
    const config = { welcome: { dynamic: {} } };

    expect(() => recordCommunityActivity(message, config)).not.toThrow();
  });

  it('should not record activity for non-text channels', () => {
    const message = {
      guild: { id: 'guild1' },
      channel: { id: 'voice1', isTextBased: () => false },
      author: { bot: false },
    };
    const config = { welcome: { dynamic: {} } };

    expect(() => recordCommunityActivity(message, config)).not.toThrow();
  });

  it('should record activity for valid guild text messages', () => {
    const message = {
      guild: { id: 'guild1' },
      channel: { id: 'channel1', isTextBased: () => true },
      author: { bot: false },
    };
    const config = { welcome: { dynamic: {} } };

    expect(() => recordCommunityActivity(message, config)).not.toThrow();
  });

  it('should not record activity for excluded channels', () => {
    const message = {
      guild: { id: 'guild1' },
      channel: { id: 'excluded1', isTextBased: () => true },
      author: { bot: false },
    };
    const config = {
      welcome: {
        dynamic: {
          excludeChannels: ['excluded1'],
        },
      },
    };

    expect(() => recordCommunityActivity(message, config)).not.toThrow();
  });

  it('should handle missing config gracefully', () => {
    const message = {
      guild: { id: 'guild1' },
      channel: { id: 'channel1', isTextBased: () => true },
      author: { bot: false },
    };

    expect(() => recordCommunityActivity(message, {})).not.toThrow();
    expect(() => recordCommunityActivity(message, null)).not.toThrow();
  });
});

describe('sendWelcomeMessage', () => {
  it('should not send message if welcome is disabled', async () => {
    const member = {
      id: '123',
      user: { username: 'TestUser' },
      guild: { name: 'Test Server', memberCount: 100 },
    };
    const client = {
      channels: {
        fetch: vi.fn(),
      },
    };
    const config = {
      welcome: {
        enabled: false,
      },
    };

    await sendWelcomeMessage(member, client, config);

    expect(client.channels.fetch).not.toHaveBeenCalled();
  });

  it('should not send message if channelId is not configured', async () => {
    const member = {
      id: '123',
      user: { username: 'TestUser' },
      guild: { name: 'Test Server', memberCount: 100 },
    };
    const client = {
      channels: {
        fetch: vi.fn(),
      },
    };
    const config = {
      welcome: {
        enabled: true,
      },
    };

    await sendWelcomeMessage(member, client, config);

    expect(client.channels.fetch).not.toHaveBeenCalled();
  });

  it('should send static welcome message when dynamic is disabled', async () => {
    const mockSend = vi.fn().mockResolvedValue({});
    const member = {
      id: '123',
      user: { username: 'TestUser' },
      guild: { name: 'Test Server', memberCount: 100 },
    };
    const client = {
      channels: {
        fetch: vi.fn().mockResolvedValue({
          send: mockSend,
        }),
      },
    };
    const config = {
      welcome: {
        enabled: true,
        channelId: '789',
        message: 'Welcome {user} to {server}!',
        dynamic: {
          enabled: false,
        },
      },
    };

    await sendWelcomeMessage(member, client, config);

    expect(client.channels.fetch).toHaveBeenCalledWith('789');
    expect(mockSend).toHaveBeenCalledWith('Welcome <@123> to Test Server!');
  });

  it('should send dynamic welcome message when enabled', async () => {
    const mockSend = vi.fn().mockResolvedValue({});
    const member = {
      id: '123',
      user: { username: 'TestUser' },
      guild: {
        name: 'Test Server',
        memberCount: 100,
        channels: {
          cache: new Map(),
        },
      },
    };
    const client = {
      channels: {
        fetch: vi.fn().mockResolvedValue({
          send: mockSend,
        }),
      },
    };
    const config = {
      welcome: {
        enabled: true,
        channelId: '789',
        message: 'Static message',
        dynamic: {
          enabled: true,
          timezone: 'America/New_York',
        },
      },
    };

    await sendWelcomeMessage(member, client, config);

    expect(mockSend).toHaveBeenCalled();
    const sentMessage = mockSend.mock.calls[0][0];
    // Dynamic message should contain the user mention
    expect(sentMessage).toContain('<@123>');
  });

  it('should handle channel fetch errors gracefully', async () => {
    const member = {
      id: '123',
      user: { username: 'TestUser' },
      guild: { name: 'Test Server', memberCount: 100 },
    };
    const client = {
      channels: {
        fetch: vi.fn().mockRejectedValue(new Error('Channel not found')),
      },
    };
    const config = {
      welcome: {
        enabled: true,
        channelId: '789',
        message: 'Welcome!',
      },
    };

    await expect(sendWelcomeMessage(member, client, config)).resolves.not.toThrow();
  });

  it('should handle null channel gracefully', async () => {
    const member = {
      id: '123',
      user: { username: 'TestUser' },
      guild: { name: 'Test Server', memberCount: 100 },
    };
    const client = {
      channels: {
        fetch: vi.fn().mockResolvedValue(null),
      },
    };
    const config = {
      welcome: {
        enabled: true,
        channelId: '789',
        message: 'Welcome!',
      },
    };

    await expect(sendWelcomeMessage(member, client, config)).resolves.not.toThrow();
  });

  it('should use default message if not configured', async () => {
    const mockSend = vi.fn().mockResolvedValue({});
    const member = {
      id: '123',
      user: { username: 'TestUser' },
      guild: { name: 'Test Server', memberCount: 100 },
    };
    const client = {
      channels: {
        fetch: vi.fn().mockResolvedValue({
          send: mockSend,
        }),
      },
    };
    const config = {
      welcome: {
        enabled: true,
        channelId: '789',
      },
    };

    await sendWelcomeMessage(member, client, config);

    expect(mockSend).toHaveBeenCalled();
    const sentMessage = mockSend.mock.calls[0][0];
    expect(sentMessage).toContain('<@123>');
  });
});