import { describe, expect, it, vi } from 'vitest';
import { isSpam, sendSpamAlert } from '../../src/modules/spam.js';

describe('isSpam', () => {
  it('should detect free crypto spam', () => {
    expect(isSpam('Get free crypto now!')).toBe(true);
    expect(isSpam('FREE BITCOIN FOR ALL')).toBe(true);
    expect(isSpam('Claim your free BTC')).toBe(true);
    expect(isSpam('Free ETH airdrop')).toBe(true);
    expect(isSpam('Get your FREE NFT')).toBe(true);
  });

  it('should detect airdrop scams', () => {
    expect(isSpam('Airdrop! Claim your tokens')).toBe(true);
    expect(isSpam('airdrop now claim bonus')).toBe(true);
  });

  it('should detect Discord nitro scams', () => {
    expect(isSpam('discord nitro free here')).toBe(true);
    expect(isSpam('Discord Nitro FREE for you!')).toBe(true);
    expect(isSpam('Nitro gift get your claim')).toBe(true);
  });

  it('should detect verification phishing', () => {
    expect(isSpam('Click here to verify your account')).toBe(true);
    expect(isSpam('Click to verify account now or be banned')).toBe(true);
  });

  it('should detect profit scams', () => {
    expect(isSpam('Guaranteed profit - invest now!')).toBe(true);
    expect(isSpam('Invest and double your money!')).toBe(true);
  });

  it('should detect DM scams', () => {
    expect(isSpam('DM me for free stuff')).toBe(true);
    expect(isSpam('dm me for a free giveaway')).toBe(true);
  });

  it('should detect income scams', () => {
    expect(isSpam('Make $5k+ daily with this method')).toBe(true);
    expect(isSpam('Make 10k weekly from home')).toBe(true);
    expect(isSpam('Make 3k monthly passive income')).toBe(true);
  });

  it('should not flag legitimate messages', () => {
    expect(isSpam('Hello everyone!')).toBe(false);
    expect(isSpam('Check out my project')).toBe(false);
    expect(isSpam('I need help with crypto development')).toBe(false);
    expect(isSpam('Anyone know about Bitcoin?')).toBe(false);
    expect(isSpam('Just got Discord Nitro!')).toBe(false);
  });

  it('should handle empty or null input', () => {
    expect(isSpam('')).toBe(false);
    expect(isSpam(null)).toBe(false);
    expect(isSpam(undefined)).toBe(false);
  });

  it('should be case-insensitive', () => {
    expect(isSpam('FREE CRYPTO')).toBe(true);
    expect(isSpam('free crypto')).toBe(true);
    expect(isSpam('FrEe CrYpTo')).toBe(true);
  });
});

describe('sendSpamAlert', () => {
  it('should not send alert if moderation channel is not configured', async () => {
    const message = {
      author: { id: '123', tag: 'user#1234' },
      channel: { id: '456' },
      content: 'free crypto',
      url: 'https://discord.com/...',
    };
    const client = {
      channels: {
        fetch: vi.fn(),
      },
    };
    const config = {
      moderation: {},
    };

    await sendSpamAlert(message, client, config);

    expect(client.channels.fetch).not.toHaveBeenCalled();
  });

  it('should send alert to configured moderation channel', async () => {
    const mockSend = vi.fn().mockResolvedValue({});
    const message = {
      author: { id: '123', tag: 'user#1234' },
      channel: { id: '456' },
      content: 'free crypto spam message',
      url: 'https://discord.com/channels/...',
    };
    const client = {
      channels: {
        fetch: vi.fn().mockResolvedValue({
          send: mockSend,
        }),
      },
    };
    const config = {
      moderation: {
        alertChannelId: '789',
      },
    };

    await sendSpamAlert(message, client, config);

    expect(client.channels.fetch).toHaveBeenCalledWith('789');
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: expect.stringContaining('Spam'),
            }),
          }),
        ]),
      }),
    );
  });

  it('should handle missing moderation channel gracefully', async () => {
    const message = {
      author: { id: '123' },
      channel: { id: '456' },
      content: 'spam',
      url: 'https://discord.com/...',
    };
    const client = {
      channels: {
        fetch: vi.fn().mockResolvedValue(null),
      },
    };
    const config = {
      moderation: {
        alertChannelId: '789',
      },
    };

    await expect(sendSpamAlert(message, client, config)).resolves.not.toThrow();
  });

  it('should auto-delete spam if enabled', async () => {
    const mockDelete = vi.fn().mockResolvedValue({});
    const mockSend = vi.fn().mockResolvedValue({});
    const message = {
      author: { id: '123' },
      channel: { id: '456' },
      content: 'spam',
      url: 'https://discord.com/...',
      delete: mockDelete,
    };
    const client = {
      channels: {
        fetch: vi.fn().mockResolvedValue({
          send: mockSend,
        }),
      },
    };
    const config = {
      moderation: {
        alertChannelId: '789',
        autoDelete: true,
      },
    };

    await sendSpamAlert(message, client, config);

    expect(mockDelete).toHaveBeenCalled();
  });

  it('should not auto-delete spam if disabled', async () => {
    const mockDelete = vi.fn().mockResolvedValue({});
    const mockSend = vi.fn().mockResolvedValue({});
    const message = {
      author: { id: '123' },
      channel: { id: '456' },
      content: 'spam',
      url: 'https://discord.com/...',
      delete: mockDelete,
    };
    const client = {
      channels: {
        fetch: vi.fn().mockResolvedValue({
          send: mockSend,
        }),
      },
    };
    const config = {
      moderation: {
        alertChannelId: '789',
        autoDelete: false,
      },
    };

    await sendSpamAlert(message, client, config);

    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('should handle delete errors gracefully', async () => {
    const mockDelete = vi.fn().mockRejectedValue(new Error('Missing permissions'));
    const mockSend = vi.fn().mockResolvedValue({});
    const message = {
      author: { id: '123' },
      channel: { id: '456' },
      content: 'spam',
      url: 'https://discord.com/...',
      delete: mockDelete,
    };
    const client = {
      channels: {
        fetch: vi.fn().mockResolvedValue({
          send: mockSend,
        }),
      },
    };
    const config = {
      moderation: {
        alertChannelId: '789',
        autoDelete: true,
      },
    };

    await expect(sendSpamAlert(message, client, config)).resolves.not.toThrow();
  });

  it('should truncate long spam content in alert', async () => {
    const mockSend = vi.fn().mockResolvedValue({});
    const longContent = 'spam '.repeat(300); // Over 1000 chars
    const message = {
      author: { id: '123' },
      channel: { id: '456' },
      content: longContent,
      url: 'https://discord.com/...',
    };
    const client = {
      channels: {
        fetch: vi.fn().mockResolvedValue({
          send: mockSend,
        }),
      },
    };
    const config = {
      moderation: {
        alertChannelId: '789',
      },
    };

    await sendSpamAlert(message, client, config);

    expect(mockSend).toHaveBeenCalled();
    const embedData = mockSend.mock.calls[0][0].embeds[0].data;
    const contentField = embedData.fields.find((f) => f.name === 'Content');
    expect(contentField.value.length).toBeLessThanOrEqual(1010); // 1000 + formatting
  });
});