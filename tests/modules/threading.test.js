import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

// Mock config module
vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn(() => ({
    ai: {
      threadMode: {
        enabled: true,
        autoArchiveMinutes: 60,
        reuseWindowMinutes: 30,
      },
    },
  })),
}));

import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { getConfig } from '../../src/modules/config.js';
import {
  buildThreadKey,
  canCreateThread,
  clearActiveThreads,
  createThread,
  findExistingThread,
  generateThreadName,
  getActiveThreads,
  getOrCreateThread,
  getThreadConfig,
  shouldUseThread,
  snapAutoArchiveDuration,
  stopEvictionTimer,
} from '../../src/modules/threading.js';

describe('threading module', () => {
  beforeEach(() => {
    clearActiveThreads();
    vi.clearAllMocks();
    // Reset to enabled by default for most tests
    getConfig.mockReturnValue({
      ai: {
        threadMode: {
          enabled: true,
          autoArchiveMinutes: 60,
          reuseWindowMinutes: 30,
        },
      },
    });
  });

  afterEach(() => {
    clearActiveThreads();
  });

  describe('getThreadConfig', () => {
    it('should return config from bot config', () => {
      const config = getThreadConfig();
      expect(config.enabled).toBe(true);
      expect(config.autoArchiveMinutes).toBe(60);
      expect(config.reuseWindowMs).toBe(30 * 60 * 1000);
    });

    it('should return defaults when config is missing', () => {
      getConfig.mockReturnValue({});
      const config = getThreadConfig();
      expect(config.enabled).toBe(false);
      expect(config.autoArchiveMinutes).toBe(60);
      expect(config.reuseWindowMs).toBe(30 * 60 * 1000);
    });

    it('should return defaults when getConfig throws', () => {
      getConfig.mockImplementation(() => {
        throw new Error('Config not loaded');
      });
      const config = getThreadConfig();
      expect(config.enabled).toBe(false);
      expect(config.autoArchiveMinutes).toBe(60);
    });

    it('should respect custom autoArchiveMinutes', () => {
      getConfig.mockReturnValue({
        ai: {
          threadMode: {
            enabled: true,
            autoArchiveMinutes: 1440,
            reuseWindowMinutes: 15,
          },
        },
      });
      const config = getThreadConfig();
      expect(config.autoArchiveMinutes).toBe(1440);
      expect(config.reuseWindowMs).toBe(15 * 60 * 1000);
    });

    it('should snap invalid autoArchiveMinutes to nearest valid value', () => {
      getConfig.mockReturnValue({
        ai: {
          threadMode: {
            enabled: true,
            autoArchiveMinutes: 100,
            reuseWindowMinutes: 30,
          },
        },
      });
      const config = getThreadConfig();
      expect(config.autoArchiveMinutes).toBe(60);
    });

    it('should fall back to default for NaN autoArchiveMinutes', () => {
      getConfig.mockReturnValue({
        ai: {
          threadMode: {
            enabled: true,
            autoArchiveMinutes: 'invalid',
            reuseWindowMinutes: 30,
          },
        },
      });
      const config = getThreadConfig();
      expect(config.autoArchiveMinutes).toBe(60);
    });

    it('should fall back to default for NaN reuseWindowMinutes', () => {
      getConfig.mockReturnValue({
        ai: {
          threadMode: {
            enabled: true,
            autoArchiveMinutes: 60,
            reuseWindowMinutes: 'bad',
          },
        },
      });
      const config = getThreadConfig();
      expect(config.reuseWindowMs).toBe(30 * 60 * 1000);
    });

    it('should fall back to default for negative reuseWindowMinutes', () => {
      getConfig.mockReturnValue({
        ai: {
          threadMode: {
            enabled: true,
            autoArchiveMinutes: 60,
            reuseWindowMinutes: -5,
          },
        },
      });
      const config = getThreadConfig();
      expect(config.reuseWindowMs).toBe(30 * 60 * 1000);
    });

    it('should fall back to default for zero reuseWindowMinutes', () => {
      getConfig.mockReturnValue({
        ai: {
          threadMode: {
            enabled: true,
            autoArchiveMinutes: 60,
            reuseWindowMinutes: 0,
          },
        },
      });
      const config = getThreadConfig();
      expect(config.reuseWindowMs).toBe(30 * 60 * 1000);
    });
  });

  describe('snapAutoArchiveDuration', () => {
    it('should return 60 for values close to 60', () => {
      expect(snapAutoArchiveDuration(60)).toBe(60);
      expect(snapAutoArchiveDuration(30)).toBe(60);
      expect(snapAutoArchiveDuration(100)).toBe(60);
    });

    it('should return 1440 for values close to 1440', () => {
      expect(snapAutoArchiveDuration(1440)).toBe(1440);
      expect(snapAutoArchiveDuration(1000)).toBe(1440);
    });

    it('should return 4320 for values close to 4320', () => {
      expect(snapAutoArchiveDuration(4320)).toBe(4320);
      expect(snapAutoArchiveDuration(3000)).toBe(4320);
    });

    it('should return 10080 for values close to 10080', () => {
      expect(snapAutoArchiveDuration(10080)).toBe(10080);
      expect(snapAutoArchiveDuration(9000)).toBe(10080);
    });

    it('should return default for NaN', () => {
      expect(snapAutoArchiveDuration(Number.NaN)).toBe(60);
    });

    it('should return default for non-number', () => {
      expect(snapAutoArchiveDuration('bad')).toBe(60);
    });

    it('should return default for negative', () => {
      expect(snapAutoArchiveDuration(-100)).toBe(60);
    });

    it('should return default for zero', () => {
      expect(snapAutoArchiveDuration(0)).toBe(60);
    });
  });

  describe('shouldUseThread', () => {
    it('should return true for regular text channel mention', () => {
      const message = {
        guild: { id: 'g1' },
        channel: {
          type: ChannelType.GuildText,
          isThread: () => false,
        },
      };
      expect(shouldUseThread(message)).toBe(true);
    });

    it('should return true for announcement channel', () => {
      const message = {
        guild: { id: 'g1' },
        channel: {
          type: ChannelType.GuildAnnouncement,
          isThread: () => false,
        },
      };
      expect(shouldUseThread(message)).toBe(true);
    });

    it('should return false when threading is disabled', () => {
      getConfig.mockReturnValue({
        ai: { threadMode: { enabled: false } },
      });
      const message = {
        guild: { id: 'g1' },
        channel: {
          type: ChannelType.GuildText,
          isThread: () => false,
        },
      };
      expect(shouldUseThread(message)).toBe(false);
    });

    it('should return false for DMs', () => {
      const message = {
        guild: null,
        channel: {
          type: ChannelType.DM,
          isThread: () => false,
        },
      };
      expect(shouldUseThread(message)).toBe(false);
    });

    it('should return false when already in a thread', () => {
      const message = {
        guild: { id: 'g1' },
        channel: {
          type: ChannelType.PublicThread,
          isThread: () => true,
        },
      };
      expect(shouldUseThread(message)).toBe(false);
    });

    it('should return false for voice channels', () => {
      const message = {
        guild: { id: 'g1' },
        channel: {
          type: ChannelType.GuildVoice,
          isThread: () => false,
        },
      };
      expect(shouldUseThread(message)).toBe(false);
    });
  });

  describe('canCreateThread', () => {
    it('should return true when bot has required permissions', () => {
      const message = {
        guild: {
          members: {
            me: { id: 'bot-id' },
          },
        },
        channel: {
          permissionsFor: vi.fn().mockReturnValue({
            has: vi.fn().mockReturnValue(true),
          }),
        },
      };
      expect(canCreateThread(message)).toBe(true);
    });

    it('should return false when missing CREATE_PUBLIC_THREADS', () => {
      const message = {
        guild: {
          members: {
            me: { id: 'bot-id' },
          },
        },
        channel: {
          permissionsFor: vi.fn().mockReturnValue({
            has: vi.fn((perm) => perm !== PermissionFlagsBits.CreatePublicThreads),
          }),
        },
      };
      expect(canCreateThread(message)).toBe(false);
    });

    it('should return false when missing SendMessagesInThreads', () => {
      const message = {
        guild: {
          members: {
            me: { id: 'bot-id' },
          },
        },
        channel: {
          permissionsFor: vi.fn().mockReturnValue({
            has: vi.fn((perm) => perm !== PermissionFlagsBits.SendMessagesInThreads),
          }),
        },
      };
      expect(canCreateThread(message)).toBe(false);
    });

    it('should return false for DMs (no guild)', () => {
      const message = { guild: null };
      expect(canCreateThread(message)).toBe(false);
    });

    it('should return false when bot member is not cached', () => {
      const message = {
        guild: {
          members: { me: null },
        },
        channel: {
          permissionsFor: vi.fn(),
        },
      };
      expect(canCreateThread(message)).toBe(false);
    });

    it('should return false when permissionsFor returns null', () => {
      const message = {
        guild: {
          members: {
            me: { id: 'bot-id' },
          },
        },
        channel: {
          permissionsFor: vi.fn().mockReturnValue(null),
        },
      };
      expect(canCreateThread(message)).toBe(false);
    });

    it('should return false and warn when permissionsFor throws', () => {
      const message = {
        guild: {
          members: {
            me: { id: 'bot-id' },
          },
        },
        channel: {
          permissionsFor: vi.fn().mockImplementation(() => {
            throw new Error('Permission check failed');
          }),
        },
      };
      expect(canCreateThread(message)).toBe(false);
    });
  });

  describe('generateThreadName', () => {
    it('should generate name from username and message', () => {
      const name = generateThreadName('Alice', 'How do I use async/await?');
      expect(name).toBe('Alice: How do I use async/await?');
    });

    it('should truncate long messages', () => {
      const longMessage = 'A'.repeat(200);
      const name = generateThreadName('Bob', longMessage);
      expect(name.length).toBeLessThanOrEqual(100);
      expect(name).toContain('Bob: ');
      expect(name.endsWith('…')).toBe(true);
    });

    it('should use first line only for multiline messages', () => {
      const name = generateThreadName('Charlie', 'First line\nSecond line\nThird line');
      expect(name).toBe('Charlie: First line');
    });

    it('should fallback for empty content', () => {
      const name = generateThreadName('Dave', '');
      expect(name).toBe('Chat with Dave');
    });

    it('should fallback for whitespace-only content', () => {
      const name = generateThreadName('Eve', '   ');
      expect(name).toBe('Chat with Eve');
    });

    it('should handle very long username (98+ chars) and stay within 100 chars', () => {
      const longUsername = 'A'.repeat(98);
      const name = generateThreadName(longUsername, 'Hello world');
      expect(name.length).toBeLessThanOrEqual(100);
      // Should truncate the username and still produce a valid name
      expect(name.length).toBeGreaterThan(0);
    });

    it('should handle very long username with empty content', () => {
      const longUsername = 'B'.repeat(120);
      const name = generateThreadName(longUsername, '');
      expect(name.length).toBeLessThanOrEqual(100);
      expect(name).toContain('Chat with');
    });

    it('should handle username exactly at the max length boundary', () => {
      const longUsername = 'C'.repeat(95);
      const name = generateThreadName(longUsername, 'Short msg');
      expect(name.length).toBeLessThanOrEqual(100);
    });
  });

  describe('buildThreadKey', () => {
    it('should combine userId and channelId', () => {
      expect(buildThreadKey('user123', 'channel456')).toBe('user123:channel456');
    });
  });

  describe('findExistingThread', () => {
    it('should return null when no active thread exists', async () => {
      const message = {
        author: { id: 'user1' },
        channel: { id: 'ch1', threads: { fetch: vi.fn() } },
      };
      const thread = await findExistingThread(message);
      expect(thread).toBeNull();
    });

    it('should return thread when found and within reuse window', async () => {
      const key = buildThreadKey('user1', 'ch1');
      const mockThread = { id: 'thread1', archived: false };
      getActiveThreads().set(key, {
        threadId: 'thread1',
        lastActive: Date.now(),
        threadName: 'Test thread',
      });

      const message = {
        author: { id: 'user1' },
        channel: {
          id: 'ch1',
          threads: { fetch: vi.fn().mockResolvedValue(mockThread) },
        },
      };

      const thread = await findExistingThread(message);
      expect(thread).toBe(mockThread);
    });

    it('should delete and return null when thread is expired', async () => {
      const key = buildThreadKey('user1', 'ch1');
      getActiveThreads().set(key, {
        threadId: 'thread1',
        lastActive: Date.now() - 31 * 60 * 1000, // 31 minutes ago
        threadName: 'Old thread',
      });

      const message = {
        author: { id: 'user1' },
        channel: {
          id: 'ch1',
          threads: { fetch: vi.fn() },
        },
      };

      const thread = await findExistingThread(message);
      expect(thread).toBeNull();
      expect(getActiveThreads().has(key)).toBe(false);
    });

    it('should delete and return null when thread fetch returns null', async () => {
      const key = buildThreadKey('user1', 'ch1');
      getActiveThreads().set(key, {
        threadId: 'thread1',
        lastActive: Date.now(),
        threadName: 'Test thread',
      });

      const message = {
        author: { id: 'user1' },
        channel: {
          id: 'ch1',
          threads: { fetch: vi.fn().mockResolvedValue(null) },
        },
      };

      const thread = await findExistingThread(message);
      expect(thread).toBeNull();
      expect(getActiveThreads().has(key)).toBe(false);
    });

    it('should delete and return null when thread fetch throws', async () => {
      const key = buildThreadKey('user1', 'ch1');
      getActiveThreads().set(key, {
        threadId: 'thread1',
        lastActive: Date.now(),
        threadName: 'Test thread',
      });

      const message = {
        author: { id: 'user1' },
        channel: {
          id: 'ch1',
          threads: { fetch: vi.fn().mockRejectedValue(new Error('Unknown Thread')) },
        },
      };

      const thread = await findExistingThread(message);
      expect(thread).toBeNull();
      expect(getActiveThreads().has(key)).toBe(false);
    });

    it('should unarchive an archived thread', async () => {
      const key = buildThreadKey('user1', 'ch1');
      const mockThread = {
        id: 'thread1',
        archived: true,
        setArchived: vi.fn().mockResolvedValue(undefined),
      };
      getActiveThreads().set(key, {
        threadId: 'thread1',
        lastActive: Date.now(),
        threadName: 'Test thread',
      });

      const message = {
        author: { id: 'user1' },
        channel: {
          id: 'ch1',
          threads: { fetch: vi.fn().mockResolvedValue(mockThread) },
        },
      };

      const thread = await findExistingThread(message);
      expect(thread).toBe(mockThread);
      expect(mockThread.setArchived).toHaveBeenCalledWith(false);
    });

    it('should return null if unarchive fails', async () => {
      const key = buildThreadKey('user1', 'ch1');
      const mockThread = {
        id: 'thread1',
        archived: true,
        setArchived: vi.fn().mockRejectedValue(new Error('Missing permissions')),
      };
      getActiveThreads().set(key, {
        threadId: 'thread1',
        lastActive: Date.now(),
        threadName: 'Test thread',
      });

      const message = {
        author: { id: 'user1' },
        channel: {
          id: 'ch1',
          threads: { fetch: vi.fn().mockResolvedValue(mockThread) },
        },
      };

      const thread = await findExistingThread(message);
      expect(thread).toBeNull();
      expect(getActiveThreads().has(key)).toBe(false);
    });
  });

  describe('createThread', () => {
    it('should create a thread and track it', async () => {
      const mockThread = { id: 'new-thread-1' };
      const message = {
        author: { id: 'user1', displayName: 'Alice', username: 'alice' },
        channel: { id: 'ch1' },
        startThread: vi.fn().mockResolvedValue(mockThread),
      };

      const thread = await createThread(message, 'What is JavaScript?');
      expect(thread).toBe(mockThread);
      expect(message.startThread).toHaveBeenCalledWith({
        name: 'Alice: What is JavaScript?',
        autoArchiveDuration: 60,
      });

      const key = buildThreadKey('user1', 'ch1');
      const tracked = getActiveThreads().get(key);
      expect(tracked).toBeDefined();
      expect(tracked.threadId).toBe('new-thread-1');
    });

    it('should use username when displayName is not available', async () => {
      const mockThread = { id: 'new-thread-2' };
      const message = {
        author: { id: 'user2', displayName: undefined, username: 'bob' },
        channel: { id: 'ch1' },
        startThread: vi.fn().mockResolvedValue(mockThread),
      };

      await createThread(message, 'Hello');
      expect(message.startThread).toHaveBeenCalledWith({
        name: 'bob: Hello',
        autoArchiveDuration: 60,
      });
    });
  });

  describe('getOrCreateThread', () => {
    function makeMessage(overrides = {}) {
      return {
        author: { id: 'user1', displayName: 'Alice', username: 'alice' },
        guild: {
          id: 'g1',
          members: { me: { id: 'bot-id' } },
        },
        channel: {
          id: 'ch1',
          permissionsFor: vi.fn().mockReturnValue({
            has: vi.fn().mockReturnValue(true),
          }),
          threads: { fetch: vi.fn().mockResolvedValue(null) },
        },
        startThread: vi.fn().mockResolvedValue({ id: 'new-thread' }),
        ...overrides,
      };
    }

    it('should create a new thread when no existing thread', async () => {
      const message = makeMessage();
      const result = await getOrCreateThread(message, 'Hello world');
      expect(result.thread).toEqual({ id: 'new-thread' });
      expect(result.isNew).toBe(true);
    });

    it('should reuse existing thread', async () => {
      const key = buildThreadKey('user1', 'ch1');
      const existingThread = { id: 'existing-thread', archived: false };
      getActiveThreads().set(key, {
        threadId: 'existing-thread',
        lastActive: Date.now(),
        threadName: 'Previous conversation',
      });

      const message = makeMessage({
        channel: {
          id: 'ch1',
          permissionsFor: vi.fn().mockReturnValue({
            has: vi.fn().mockReturnValue(true),
          }),
          threads: { fetch: vi.fn().mockResolvedValue(existingThread) },
        },
      });

      const result = await getOrCreateThread(message, 'Follow-up question');
      expect(result.thread).toBe(existingThread);
      expect(result.isNew).toBe(false);
    });

    it('should fall back to null when missing permissions', async () => {
      const message = makeMessage({
        guild: {
          id: 'g1',
          members: { me: { id: 'bot-id' } },
        },
        channel: {
          id: 'ch1',
          permissionsFor: vi.fn().mockReturnValue({
            has: vi.fn().mockReturnValue(false),
          }),
          threads: { fetch: vi.fn() },
        },
      });

      const result = await getOrCreateThread(message, 'Hello');
      expect(result.thread).toBeNull();
      expect(result.isNew).toBe(false);
    });

    it('should fall back to null when thread creation throws', async () => {
      const message = makeMessage({
        startThread: vi.fn().mockRejectedValue(new Error('Thread creation failed')),
      });

      const result = await getOrCreateThread(message, 'Hello');
      expect(result.thread).toBeNull();
      expect(result.isNew).toBe(false);
    });

    it('should not create duplicate threads for concurrent calls from the same user+channel', async () => {
      const createdThread = { id: 'single-thread' };
      let callCount = 0;
      const message = makeMessage({
        startThread: vi.fn().mockImplementation(async () => {
          callCount++;
          // Simulate async delay
          await new Promise((r) => setTimeout(r, 50));
          return createdThread;
        }),
        channel: {
          id: 'ch1',
          permissionsFor: vi.fn().mockReturnValue({
            has: vi.fn().mockReturnValue(true),
          }),
          threads: {
            fetch: vi.fn().mockImplementation(async (threadId) => {
              // After first thread is created, subsequent fetches find it
              if (threadId === 'single-thread') {
                return { id: 'single-thread', archived: false };
              }
              return null;
            }),
          },
        },
      });

      // Fire two concurrent calls
      const [result1, result2] = await Promise.all([
        getOrCreateThread(message, 'Hello'),
        getOrCreateThread(message, 'Hello again'),
      ]);

      // Only one thread should have been created via startThread
      expect(callCount).toBe(1);
      // Both should reference the same thread
      expect(result1.thread.id).toBe('single-thread');
      expect(result2.thread.id).toBe('single-thread');
    });
  });

  describe('clearActiveThreads', () => {
    it('should clear all tracked threads', () => {
      getActiveThreads().set('key1', { threadId: 't1', lastActive: Date.now() });
      getActiveThreads().set('key2', { threadId: 't2', lastActive: Date.now() });
      expect(getActiveThreads().size).toBe(2);

      clearActiveThreads();
      expect(getActiveThreads().size).toBe(0);
    });
  });

  describe('sweepExpiredThreads', () => {
    let sweepExpiredThreads;

    beforeEach(async () => {
      // Dynamic import to get the function after mocks are set up
      const mod = await import('../../src/modules/threading.js');
      sweepExpiredThreads = mod.sweepExpiredThreads;
    });

    it('should remove entries older than the reuse window', () => {
      const now = Date.now();
      getActiveThreads().set('expired', {
        threadId: 't1',
        lastActive: now - 31 * 60 * 1000, // 31 min ago (default reuse = 30 min)
        threadName: 'Old',
      });
      getActiveThreads().set('fresh', {
        threadId: 't2',
        lastActive: now,
        threadName: 'New',
      });

      sweepExpiredThreads();

      expect(getActiveThreads().has('expired')).toBe(false);
      expect(getActiveThreads().has('fresh')).toBe(true);
    });

    it('should enforce max-size cap by evicting oldest entries', () => {
      const now = Date.now();
      // Add 1002 entries (over the 1000 cap), all fresh
      for (let i = 0; i < 1002; i++) {
        getActiveThreads().set(`key${i}`, {
          threadId: `t${i}`,
          lastActive: now - (1002 - i), // oldest first
          threadName: `Thread ${i}`,
        });
      }

      sweepExpiredThreads();

      expect(getActiveThreads().size).toBeLessThanOrEqual(1000);
      // Oldest 2 should have been evicted
      expect(getActiveThreads().has('key0')).toBe(false);
      expect(getActiveThreads().has('key1')).toBe(false);
      // Newest should survive
      expect(getActiveThreads().has('key1001')).toBe(true);
    });
  });

  describe('eviction timer', () => {
    it('stopEvictionTimer should not throw when called', () => {
      expect(() => stopEvictionTimer()).not.toThrow();
    });
  });
});
