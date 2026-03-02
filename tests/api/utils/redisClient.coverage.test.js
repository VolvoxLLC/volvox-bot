/**
 * Coverage tests for src/api/utils/redisClient.js
 * Tests: connection failure, reconnect, fallback behavior, error events
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockOn = vi.fn();
const mockQuit = vi.fn().mockResolvedValue('OK');
let mockRedisConstructorImpl = vi.fn(() => ({ on: mockOn, quit: mockQuit }));

vi.mock('ioredis', () => ({
  default: class MockRedis {
    constructor(...args) {
      const instance = mockRedisConstructorImpl(...args);
      Object.assign(this, instance);
    }
  },
}));

vi.mock('../../../src/logger.js', () => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
}));

import {
  _resetRedisClient,
  closeRedis,
  getRedisClient,
} from '../../../src/api/utils/redisClient.js';
import { error as logError, warn } from '../../../src/logger.js';

describe('redisClient coverage', () => {
  const originalRedisUrl = process.env.REDIS_URL;

  beforeEach(() => {
    _resetRedisClient();
    vi.clearAllMocks();
    mockRedisConstructorImpl = vi.fn(() => ({ on: mockOn, quit: mockQuit }));
    delete process.env.REDIS_URL;
  });

  afterEach(() => {
    _resetRedisClient();
    if (originalRedisUrl !== undefined) {
      process.env.REDIS_URL = originalRedisUrl;
    } else {
      delete process.env.REDIS_URL;
    }
  });

  describe('getRedisClient', () => {
    it('returns null when REDIS_URL is not set', () => {
      const client = getRedisClient();
      expect(client).toBeNull();
    });

    it('creates Redis client when REDIS_URL is set', () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      const client = getRedisClient();
      expect(client).not.toBeNull();
      expect(mockRedisConstructorImpl).toHaveBeenCalledWith(
        'redis://localhost:6379',
        expect.any(Object),
      );
    });

    it('returns cached client on subsequent calls (already initialized)', () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      const client1 = getRedisClient();
      const client2 = getRedisClient();
      expect(mockRedisConstructorImpl).toHaveBeenCalledTimes(1);
      expect(client1).toBe(client2);
    });

    it('returns null on second call when first returned null (no REDIS_URL)', () => {
      getRedisClient(); // first: sets initialized=true, client=null
      const client2 = getRedisClient(); // second: returns cached null
      expect(client2).toBeNull();
      expect(mockRedisConstructorImpl).not.toHaveBeenCalled();
    });

    it('logs error and returns null when Redis constructor throws', () => {
      process.env.REDIS_URL = 'redis://bad-host:6379';
      mockRedisConstructorImpl = vi.fn(() => {
        throw new Error('Connection refused');
      });
      const client = getRedisClient();
      expect(client).toBeNull();
      expect(logError).toHaveBeenCalledWith(
        'Failed to initialize Redis client',
        expect.objectContaining({ error: 'Connection refused' }),
      );
    });

    it('registers error handler on Redis client', () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      getRedisClient();
      expect(mockOn).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('error handler logs Redis connection errors', () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      getRedisClient();
      const errorHandler = mockOn.mock.calls.find(([event]) => event === 'error')?.[1];
      expect(errorHandler).toBeDefined();
      errorHandler(new Error('ECONNRESET'));
      expect(logError).toHaveBeenCalledWith(
        'Redis connection error',
        expect.objectContaining({ error: 'ECONNRESET' }),
      );
    });
  });

  describe('closeRedis', () => {
    it('is a no-op when no client exists', async () => {
      await expect(closeRedis()).resolves.toBeUndefined();
      expect(mockQuit).not.toHaveBeenCalled();
    });

    it('calls quit on the Redis client', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      getRedisClient();
      await closeRedis();
      expect(mockQuit).toHaveBeenCalled();
    });

    it('resets state after close so next call reinitializes', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      getRedisClient();
      await closeRedis();
      getRedisClient();
      expect(mockRedisConstructorImpl).toHaveBeenCalledTimes(2);
    });

    it('logs warn when quit throws', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      mockQuit.mockRejectedValueOnce(new Error('quit failed'));
      getRedisClient();
      await closeRedis();
      expect(warn).toHaveBeenCalledWith(
        'Redis quit error during shutdown',
        expect.objectContaining({ error: 'quit failed' }),
      );
    });

    it('resets client to null even when quit throws', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      mockQuit.mockRejectedValueOnce(new Error('quit failed'));
      getRedisClient();
      await closeRedis();
      // After failed quit, reinitializes on next call
      getRedisClient();
      expect(mockRedisConstructorImpl).toHaveBeenCalledTimes(2);
    });
  });
});
