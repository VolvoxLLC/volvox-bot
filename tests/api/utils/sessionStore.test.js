import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

// Mock redisClient so we can control getRedisClient()'s return value
// without spinning up a real Redis connection.
vi.mock('../../../src/api/utils/redisClient.js', () => ({
  getRedisClient: vi.fn().mockReturnValue(null), // default: no Redis
  closeRedis: vi.fn().mockResolvedValue(undefined),
  _resetRedisClient: vi.fn(),
}));

/**
 * Build a minimal ioredis-compatible mock with inspectable vi.fn() methods.
 */
function buildRedisMock() {
  return {
    setex: vi.fn().mockResolvedValue('OK'),
    get: vi.fn().mockResolvedValue(null),
    exists: vi.fn().mockResolvedValue(0),
    del: vi.fn().mockResolvedValue(1),
    quit: vi.fn().mockResolvedValue('OK'),
    on: vi.fn(),
  };
}

// ──────────────────────────────────────────────
// In-memory (no Redis) path
// ──────────────────────────────────────────────

describe('SessionStore — in-memory fallback (no REDIS_URL)', () => {
  // Import after mock is registered (mocks are hoisted, so this is fine)
  let sessionStore;
  let getSessionToken;

  beforeEach(async () => {
    vi.resetModules();
    // Ensure getRedisClient returns null (in-memory path)
    const redisClientMod = await import('../../../src/api/utils/redisClient.js');
    redisClientMod.getRedisClient.mockReturnValue(null);

    const mod = await import('../../../src/api/utils/sessionStore.js');
    sessionStore = mod.sessionStore;
    getSessionToken = mod.getSessionToken;
  });

  afterEach(() => {
    sessionStore.clear();
    vi.clearAllMocks();
  });

  it('set() stores a token and get() returns it', () => {
    sessionStore.set('user1', { accessToken: 'tok1', jti: 'jti1' });
    expect(sessionStore.get('user1')).toEqual({ accessToken: 'tok1', jti: 'jti1' });
  });

  it('get() returns undefined for unknown user', () => {
    expect(sessionStore.get('nobody')).toBeUndefined();
  });

  it('has() returns true when a session exists', () => {
    sessionStore.set('user2', { accessToken: 'tok2', jti: 'jti2' });
    expect(sessionStore.has('user2')).toBe(true);
  });

  it('has() returns false when no session exists', () => {
    expect(sessionStore.has('ghost')).toBe(false);
  });

  it('delete() removes a session', () => {
    sessionStore.set('user3', { accessToken: 'tok3', jti: 'jti3' });
    sessionStore.delete('user3');
    expect(sessionStore.get('user3')).toBeUndefined();
  });

  it('cleanup() purges expired entries', () => {
    vi.useFakeTimers();
    sessionStore.set('expired-user', { accessToken: 'expired-tok', jti: 'jti-exp' });
    // Advance time beyond the session TTL (1 hour = 3600000ms)
    vi.advanceTimersByTime(3_600_001);
    sessionStore.cleanup();
    expect(sessionStore.get('expired-user')).toBeUndefined();
    vi.useRealTimers();
  });

  it('cleanup() leaves non-expired entries intact', () => {
    sessionStore.set('live-user', { accessToken: 'live-tok', jti: 'jti-live' });
    sessionStore.cleanup();
    expect(sessionStore.get('live-user')).toEqual({ accessToken: 'live-tok', jti: 'jti-live' });
  });

  it('getSessionToken() returns the access token', async () => {
    sessionStore.set('user4', { accessToken: 'tok4', jti: 'jti4' });
    expect(await getSessionToken('user4')).toBe('tok4');
  });

  it('getSessionToken() returns undefined for missing session', async () => {
    expect(await getSessionToken('missing')).toBeUndefined();
  });
});

// ──────────────────────────────────────────────
// Redis path
// ──────────────────────────────────────────────

describe('SessionStore — Redis backend (REDIS_URL configured)', () => {
  let sessionStore;
  let getSessionToken;
  let redisMock;

  beforeEach(async () => {
    redisMock = buildRedisMock();

    vi.resetModules();

    // Make getRedisClient() return our mock Redis instance
    const redisClientMod = await import('../../../src/api/utils/redisClient.js');
    redisClientMod.getRedisClient.mockReturnValue(redisMock);

    const mod = await import('../../../src/api/utils/sessionStore.js');
    sessionStore = mod.sessionStore;
    getSessionToken = mod.getSessionToken;
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('set() calls redis.setex with the correct key and TTL', async () => {
    await sessionStore.set('u1', { accessToken: 'access-tok', jti: 'jti-u1' });
    expect(redisMock.setex).toHaveBeenCalledWith(
      'session:u1',
      3600,
      JSON.stringify({ accessToken: 'access-tok', jti: 'jti-u1' }),
    );
  });

  it('get() calls redis.get and returns the session data', async () => {
    redisMock.get.mockResolvedValue(JSON.stringify({ accessToken: 'stored-tok', jti: 'jti-u2' }));
    const result = await sessionStore.get('u2');
    expect(redisMock.get).toHaveBeenCalledWith('session:u2');
    expect(result).toEqual({ accessToken: 'stored-tok', jti: 'jti-u2' });
  });

  it('get() returns null for a missing key', async () => {
    redisMock.get.mockResolvedValue(null);
    const result = await sessionStore.get('nobody');
    expect(result).toBeNull();
  });

  it('has() returns true when Redis reports the key exists', async () => {
    redisMock.exists.mockResolvedValue(1);
    const result = await sessionStore.has('u3');
    expect(redisMock.exists).toHaveBeenCalledWith('session:u3');
    expect(result).toBe(true);
  });

  it('has() returns false when Redis reports the key is absent', async () => {
    redisMock.exists.mockResolvedValue(0);
    const result = await sessionStore.has('ghost');
    expect(result).toBe(false);
  });

  it('delete() calls redis.del with the correct key', async () => {
    await sessionStore.delete('u4');
    expect(redisMock.del).toHaveBeenCalledWith('session:u4');
  });

  it('cleanup() is a no-op when Redis is active', () => {
    expect(() => sessionStore.cleanup()).not.toThrow();
    expect(redisMock.setex).not.toHaveBeenCalled();
    expect(redisMock.del).not.toHaveBeenCalled();
  });

  it('getSessionToken() returns the token from Redis', async () => {
    redisMock.get.mockResolvedValue(JSON.stringify({ accessToken: 'redis-tok', jti: 'jti-u5' }));
    const result = await getSessionToken('u5');
    expect(result).toBe('redis-tok');
  });
});
