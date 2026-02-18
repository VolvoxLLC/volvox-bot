import { describe, expect, it, vi } from 'vitest';

import { isSpam, sendSpamAlert } from '../../src/modules/spam.js';

describe('isSpam', () => {
  it('should detect "free crypto" spam', () => {
    expect(isSpam('Get FREE CRYPTO now!')).toBe(true);
  });

  it('should detect "free bitcoin" spam', () => {
    expect(isSpam('Free Bitcoin for everyone')).toBe(true);
  });

  it('should detect "free btc" spam', () => {
    expect(isSpam('Free BTC giveaway')).toBe(true);
  });

  it('should detect "free eth" spam', () => {
    expect(isSpam('Free ETH airdrop')).toBe(true);
  });

  it('should detect "free nft" spam', () => {
    expect(isSpam('Free NFT mint now')).toBe(true);
  });

  it('should detect airdrop claim spam', () => {
    expect(isSpam('Claim your airdrop claim now')).toBe(true);
  });

  it('should detect discord nitro free spam', () => {
    expect(isSpam('Discord Nitro free giveaway')).toBe(true);
  });

  it('should detect nitro gift claim spam', () => {
    expect(isSpam('Nitro gift please claim it')).toBe(true);
  });

  it('should detect click verify account spam', () => {
    expect(isSpam('Click here to verify your account')).toBe(true);
  });

  it('should detect guaranteed profit spam', () => {
    expect(isSpam('Guaranteed profit every day')).toBe(true);
  });

  it('should detect invest double money spam', () => {
    expect(isSpam('Invest and double your money')).toBe(true);
  });

  it('should detect DM me for free spam', () => {
    expect(isSpam('DM me for free crypto')).toBe(true);
  });

  it('should detect make money claims', () => {
    expect(isSpam('Make $5000 daily with this')).toBe(true);
    expect(isSpam('Make 10k+ weekly from home')).toBe(true);
    expect(isSpam('Make $500 monthly easy')).toBe(true);
  });

  it('should NOT flag normal messages', () => {
    expect(isSpam('Hello everyone!')).toBe(false);
    expect(isSpam('Can someone help me with JavaScript?')).toBe(false);
    expect(isSpam('What is the best programming language?')).toBe(false);
    expect(isSpam('I made a new project')).toBe(false);
  });

  it('should NOT flag empty content', () => {
    expect(isSpam('')).toBe(false);
  });
});

describe('sendSpamAlert', () => {
  it('should not send alert if config.moderation is undefined', async () => {
    const message = {
      author: { id: '123' },
      channel: { id: '456' },
      content: 'spam',
      url: 'http://test',
    };
    const client = { channels: { fetch: vi.fn() } };
    const config = {};

    await sendSpamAlert(message, client, config);
    expect(client.channels.fetch).not.toHaveBeenCalled();
  });

  it('should not send alert if no alertChannelId configured', async () => {
    const message = {
      author: { id: '123' },
      channel: { id: '456' },
      content: 'spam',
      url: 'http://test',
    };
    const client = { channels: { fetch: vi.fn() } };
    const config = { moderation: {} };

    await sendSpamAlert(message, client, config);
    expect(client.channels.fetch).not.toHaveBeenCalled();
  });

  it('should not send alert if channel cannot be fetched', async () => {
    const message = {
      author: { id: '123' },
      channel: { id: '456' },
      content: 'spam',
      url: 'http://test',
    };
    const client = { channels: { fetch: vi.fn().mockRejectedValue(new Error('not found')) } };
    const config = { moderation: { alertChannelId: '789' } };

    await sendSpamAlert(message, client, config);
    // Should not throw
  });

  it('should send embed to alert channel', async () => {
    const mockSend = vi.fn();
    const message = {
      author: { id: '123' },
      channel: { id: '456' },
      content: 'spam content',
      url: 'http://discord.com/msg',
      delete: vi.fn(),
    };
    const client = {
      channels: { fetch: vi.fn().mockResolvedValue({ send: mockSend }) },
    };
    const config = { moderation: { alertChannelId: '789' } };

    await sendSpamAlert(message, client, config);
    expect(client.channels.fetch).toHaveBeenCalledWith('789');
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.any(Array) }));
    // autoDelete is not enabled, so message.delete should NOT be called
    expect(message.delete).not.toHaveBeenCalled();
  });

  it('should auto-delete message if autoDelete is enabled', async () => {
    const mockDelete = vi.fn().mockResolvedValue(undefined);
    const mockSend = vi.fn();
    const message = {
      author: { id: '123' },
      channel: { id: '456' },
      content: 'spam',
      url: 'http://test',
      delete: mockDelete,
    };
    const client = {
      channels: { fetch: vi.fn().mockResolvedValue({ send: mockSend }) },
    };
    const config = { moderation: { alertChannelId: '789', autoDelete: true } };

    await sendSpamAlert(message, client, config);
    expect(mockDelete).toHaveBeenCalled();
  });

  it('should not crash if auto-delete fails', async () => {
    const mockDelete = vi.fn().mockRejectedValue(new Error('permission'));
    const mockSend = vi.fn();
    const message = {
      author: { id: '123' },
      channel: { id: '456' },
      content: 'spam',
      url: 'http://test',
      delete: mockDelete,
    };
    const client = {
      channels: { fetch: vi.fn().mockResolvedValue({ send: mockSend }) },
    };
    const config = { moderation: { alertChannelId: '789', autoDelete: true } };

    await sendSpamAlert(message, client, config);
    expect(mockDelete).toHaveBeenCalled();
    // Should not throw
  });
});
