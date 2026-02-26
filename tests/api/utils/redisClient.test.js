import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

import { _resetRedisClient, closeRedis, getRedisClient } from '../../../src/api/utils/redisClient.js';

describe('redisClient', () => {
  beforeEach(() => {
    _resetRedisClient();
  });

  afterEach(() => {
    _resetRedisClient();
    vi.unstubAllEnvs();
  });

  it('should return null when REDIS_URL is not set', () => {
    vi.stubEnv('REDIS_URL', '');
    const client = getRedisClient();
    expect(client).toBeNull();
  });

  it('should return null on subsequent calls when REDIS_URL is empty', () => {
    vi.stubEnv('REDIS_URL', '');
    getRedisClient();
    const client2 = getRedisClient();
    expect(client2).toBeNull();
  });

  it('should set _initialized flag so second call skips env check', () => {
    vi.stubEnv('REDIS_URL', '');
    getRedisClient(); // sets _initialized = true
    // Even if we now set REDIS_URL, it should still return null (already initialized)
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
    const client2 = getRedisClient();
    expect(client2).toBeNull();
  });

  it('should gracefully handle closeRedis when no client exists', async () => {
    await expect(closeRedis()).resolves.toBeUndefined();
  });

  it('should reset state on _resetRedisClient allowing re-initialization', () => {
    vi.stubEnv('REDIS_URL', '');
    getRedisClient(); // initialized with null
    _resetRedisClient(); // reset
    // Next call should re-read env
    vi.stubEnv('REDIS_URL', '');
    const client = getRedisClient();
    expect(client).toBeNull();
  });
});
