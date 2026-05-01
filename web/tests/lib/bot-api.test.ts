import { afterEach, describe, expect, it } from 'vitest';
import { getBotApiBaseUrl } from '@/lib/bot-api';

describe('bot-api', () => {
  const originalBotApiUrl = process.env.BOT_API_URL;

  afterEach(() => {
    if (originalBotApiUrl === undefined) {
      delete process.env.BOT_API_URL;
    } else {
      process.env.BOT_API_URL = originalBotApiUrl;
    }
  });

  it('returns null when BOT_API_URL is missing', () => {
    delete process.env.BOT_API_URL;

    expect(getBotApiBaseUrl()).toBeNull();
  });

  it('preserves an already-normalized api base url', () => {
    process.env.BOT_API_URL = 'https://bot.internal/api/v1/';

    expect(getBotApiBaseUrl()).toBe('https://bot.internal/api/v1');
  });

  it('uses the provided fallback when BOT_API_URL is missing', () => {
    delete process.env.BOT_API_URL;

    expect(getBotApiBaseUrl('http://localhost:3001')).toBe('http://localhost:3001/api/v1');
  });

  it('uses the provided fallback when BOT_API_URL is empty', () => {
    process.env.BOT_API_URL = '';

    expect(getBotApiBaseUrl('http://localhost:3001')).toBe('http://localhost:3001/api/v1');
  });
});
