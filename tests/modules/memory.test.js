import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock mem0ai SDK
vi.mock('mem0ai', () => {
  const MockMemoryClient = vi.fn();
  return { default: MockMemoryClient };
});

// Mock config module
vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn(() => ({
    memory: {
      enabled: true,
      maxContextMemories: 5,
      autoExtract: true,
    },
  })),
}));

// Mock optout module
vi.mock('../../src/modules/optout.js', () => ({
  isOptedOut: vi.fn(() => false),
}));

// Mock logger
vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

import { getConfig } from '../../src/modules/config.js';
import {
  _getRecoveryCooldownMs,
  _setClient,
  _setMem0Available,
  addMemory,
  buildMemoryContext,
  checkMem0Health,
  deleteAllMemories,
  deleteMemory,
  extractAndStoreMemories,
  formatRelations,
  getMemories,
  getMemoryConfig,
  isMemoryAvailable,
  searchMemories,
} from '../../src/modules/memory.js';
import { isOptedOut } from '../../src/modules/optout.js';

/**
 * Create a mock mem0 client with all SDK methods stubbed.
 * @param {Object} overrides - Method overrides
 * @returns {Object} Mock client
 */
function createMockClient(overrides = {}) {
  return {
    add: vi.fn().mockResolvedValue({ results: [{ id: 'mem-1' }] }),
    search: vi.fn().mockResolvedValue({ results: [], relations: [] }),
    getAll: vi.fn().mockResolvedValue({ results: [] }),
    delete: vi.fn().mockResolvedValue({ message: 'Memory deleted' }),
    deleteAll: vi.fn().mockResolvedValue({ message: 'Memories deleted' }),
    ...overrides,
  };
}

describe('memory module', () => {
  beforeEach(() => {
    _setMem0Available(false);
    _setClient(null);
    vi.clearAllMocks();
    // Reset config mock to defaults
    getConfig.mockReturnValue({
      memory: {
        enabled: true,
        maxContextMemories: 5,
        autoExtract: true,
      },
    });
    // Reset optout mock
    isOptedOut.mockReturnValue(false);
    // Set up env for tests
    delete process.env.MEM0_API_KEY;
  });

  afterEach(() => {
    _setClient(null);
    delete process.env.MEM0_API_KEY;
  });

  describe('getMemoryConfig', () => {
    it('should return config values from bot config', () => {
      const config = getMemoryConfig();
      expect(config.enabled).toBe(true);
      expect(config.maxContextMemories).toBe(5);
      expect(config.autoExtract).toBe(true);
    });

    it('should return defaults when config is missing', () => {
      getConfig.mockReturnValue({});
      const config = getMemoryConfig();
      expect(config.enabled).toBe(true);
      expect(config.maxContextMemories).toBe(5);
      expect(config.autoExtract).toBe(true);
    });

    it('should return safe disabled fallback when getConfig throws', () => {
      getConfig.mockImplementation(() => {
        throw new Error('not loaded');
      });
      const config = getMemoryConfig();
      expect(config.enabled).toBe(false);
      expect(config.maxContextMemories).toBe(5);
      expect(config.autoExtract).toBe(false);
    });

    it('should respect custom config values', () => {
      getConfig.mockReturnValue({
        memory: {
          enabled: false,
          maxContextMemories: 10,
          autoExtract: false,
        },
      });
      const config = getMemoryConfig();
      expect(config.enabled).toBe(false);
      expect(config.maxContextMemories).toBe(10);
      expect(config.autoExtract).toBe(false);
    });
  });

  describe('isMemoryAvailable', () => {
    it('should return false when mem0 is not available', () => {
      _setMem0Available(false);
      expect(isMemoryAvailable()).toBe(false);
    });

    it('should return true when enabled and available', () => {
      _setMem0Available(true);
      expect(isMemoryAvailable()).toBe(true);
    });

    it('should return false when disabled in config', () => {
      _setMem0Available(true);
      getConfig.mockReturnValue({ memory: { enabled: false } });
      expect(isMemoryAvailable()).toBe(false);
    });

    it('should auto-recover after cooldown period expires', () => {
      _setMem0Available(true);
      const mockClient = createMockClient({
        add: vi.fn().mockRejectedValue(new Error('transient')),
      });
      _setClient(mockClient);

      // Simulate a transient failure by calling addMemory (which will markUnavailable)
      // Instead, manually trigger the unavailable state with a past timestamp
      _setMem0Available(false);

      // Immediately after marking unavailable, should still be false
      expect(isMemoryAvailable()).toBe(false);

      // Simulate the unavailable timestamp being in the past by using vi.useFakeTimers
      vi.useFakeTimers();
      _setMem0Available(true);

      // Now mark unavailable again - this time we can control time
      // We need to trigger markUnavailable through an API call
      const failingClient = createMockClient({
        add: vi.fn().mockRejectedValue(new Error('API error')),
      });
      _setClient(failingClient);
      _setMem0Available(true);

      // This will fail and call markUnavailable()
      addMemory('user123', 'test').then(() => {
        expect(isMemoryAvailable()).toBe(false);

        // Advance time past the cooldown
        vi.advanceTimersByTime(_getRecoveryCooldownMs());

        // Should now auto-recover
        expect(isMemoryAvailable()).toBe(true);

        vi.useRealTimers();
      });
    });

    it('should not auto-recover before cooldown expires', async () => {
      vi.useFakeTimers();
      _setMem0Available(true);
      const failingClient = createMockClient({
        add: vi.fn().mockRejectedValue(new Error('API error')),
      });
      _setClient(failingClient);

      // Trigger a failure to markUnavailable
      await addMemory('user123', 'test');
      expect(isMemoryAvailable()).toBe(false);

      // Advance time but not enough
      vi.advanceTimersByTime(_getRecoveryCooldownMs() - 1000);
      expect(isMemoryAvailable()).toBe(false);

      // Now advance past the cooldown
      vi.advanceTimersByTime(1000);
      expect(isMemoryAvailable()).toBe(true);

      vi.useRealTimers();
    });

    it('should re-disable if recovery attempt also fails', async () => {
      vi.useFakeTimers();
      _setMem0Available(true);
      const failingClient = createMockClient({
        add: vi.fn().mockRejectedValue(new Error('API error')),
        search: vi.fn().mockRejectedValue(new Error('Still down')),
      });
      _setClient(failingClient);

      // Trigger initial failure
      await addMemory('user123', 'test');
      expect(isMemoryAvailable()).toBe(false);

      // Advance past cooldown - auto-recovery kicks in
      vi.advanceTimersByTime(_getRecoveryCooldownMs());
      expect(isMemoryAvailable()).toBe(true);

      // But the next operation also fails
      await searchMemories('user123', 'test');
      expect(isMemoryAvailable()).toBe(false);

      vi.useRealTimers();
    });
  });

  describe('checkMem0Health', () => {
    it('should mark as available when API key is set and SDK connectivity verified', async () => {
      process.env.MEM0_API_KEY = 'test-api-key';
      const mockClient = createMockClient({
        search: vi.fn().mockResolvedValue({ results: [], relations: [] }),
      });
      _setClient(mockClient);

      const result = await checkMem0Health();
      expect(result).toBe(true);
      expect(isMemoryAvailable()).toBe(true);

      // Verify it performed a lightweight search to check connectivity
      expect(mockClient.search).toHaveBeenCalledWith('health-check', {
        user_id: '__health_check__',
        app_id: 'bills-bot',
        limit: 1,
      });
    });

    it('should mark as unavailable when API key is not set', async () => {
      const result = await checkMem0Health();
      expect(result).toBe(false);
      expect(isMemoryAvailable()).toBe(false);
    });

    it('should return false when memory disabled in config', async () => {
      getConfig.mockReturnValue({ memory: { enabled: false } });

      const result = await checkMem0Health();
      expect(result).toBe(false);
      expect(isMemoryAvailable()).toBe(false);
    });

    it('should fail health check when auto-created client cannot connect', async () => {
      process.env.MEM0_API_KEY = 'test-api-key';
      // Don't set a client — getClient will auto-create from mocked constructor
      // The auto-created client has no search method, so health check will fail
      _setClient(null);

      const result = await checkMem0Health();
      expect(result).toBe(false);
      expect(isMemoryAvailable()).toBe(false);
    });

    it('should mark as unavailable when SDK connectivity check fails', async () => {
      process.env.MEM0_API_KEY = 'test-api-key';
      const mockClient = createMockClient({
        search: vi.fn().mockRejectedValue(new Error('Connection refused')),
      });
      _setClient(mockClient);

      const result = await checkMem0Health();
      expect(result).toBe(false);
      expect(isMemoryAvailable()).toBe(false);
    });
  });

  describe('addMemory', () => {
    it('should return false when memory unavailable', async () => {
      _setMem0Available(false);
      const result = await addMemory('user123', 'I love Rust');
      expect(result).toBe(false);
    });

    it('should call client.add with correct params and return true', async () => {
      _setMem0Available(true);
      const mockClient = createMockClient();
      _setClient(mockClient);

      const result = await addMemory('user123', 'I love Rust');
      expect(result).toBe(true);

      expect(mockClient.add).toHaveBeenCalledWith([{ role: 'user', content: 'I love Rust' }], {
        user_id: 'user123',
        app_id: 'bills-bot',
        metadata: {},
        enable_graph: true,
      });
    });

    it('should return false on SDK error and mark unavailable', async () => {
      _setMem0Available(true);
      const mockClient = createMockClient({
        add: vi.fn().mockRejectedValue(new Error('API error')),
      });
      _setClient(mockClient);

      const result = await addMemory('user123', 'test');
      expect(result).toBe(false);
      expect(isMemoryAvailable()).toBe(false);
    });

    it('should pass optional metadata', async () => {
      _setMem0Available(true);
      const mockClient = createMockClient();
      _setClient(mockClient);

      await addMemory('user123', 'test', { source: 'chat' });

      expect(mockClient.add).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ metadata: { source: 'chat' } }),
      );
    });

    it('should return false when client is null', async () => {
      _setMem0Available(true);
      _setClient(null);
      // No API key set, so getClient returns null
      const result = await addMemory('user123', 'test');
      expect(result).toBe(false);
    });
  });

  describe('searchMemories', () => {
    it('should return empty results when unavailable', async () => {
      _setMem0Available(false);
      const result = await searchMemories('user123', 'Rust');
      expect(result).toEqual({ memories: [], relations: [] });
    });

    it('should search and return formatted memories with relations', async () => {
      _setMem0Available(true);
      const mockClient = createMockClient({
        search: vi.fn().mockResolvedValue({
          results: [
            { memory: 'User is learning Rust', score: 0.95 },
            { memory: 'User works at Google', score: 0.8 },
          ],
          relations: [
            {
              source: 'User',
              source_type: 'person',
              relationship: 'works at',
              target: 'Google',
              target_type: 'organization',
            },
          ],
        }),
      });
      _setClient(mockClient);

      const result = await searchMemories('user123', 'What language?');
      expect(result.memories).toEqual([
        { id: '', memory: 'User is learning Rust', score: 0.95 },
        { id: '', memory: 'User works at Google', score: 0.8 },
      ]);
      expect(result.relations).toHaveLength(1);
      expect(result.relations[0].relationship).toBe('works at');

      expect(mockClient.search).toHaveBeenCalledWith('What language?', {
        user_id: 'user123',
        app_id: 'bills-bot',
        limit: 5,
        enable_graph: true,
      });
    });

    it('should handle array response format', async () => {
      _setMem0Available(true);
      const mockClient = createMockClient({
        search: vi.fn().mockResolvedValue([{ memory: 'User loves TypeScript', score: 0.9 }]),
      });
      _setClient(mockClient);

      const result = await searchMemories('user123', 'languages');
      expect(result.memories).toEqual([{ id: '', memory: 'User loves TypeScript', score: 0.9 }]);
      expect(result.relations).toEqual([]);
    });

    it('should respect custom limit parameter', async () => {
      _setMem0Available(true);
      const mockClient = createMockClient({
        search: vi.fn().mockResolvedValue({ results: [], relations: [] }),
      });
      _setClient(mockClient);

      await searchMemories('user123', 'test', 3);

      expect(mockClient.search).toHaveBeenCalledWith('test', expect.objectContaining({ limit: 3 }));
    });

    it('should return empty results on SDK error and mark unavailable', async () => {
      _setMem0Available(true);
      const mockClient = createMockClient({
        search: vi.fn().mockRejectedValue(new Error('API error')),
      });
      _setClient(mockClient);

      const result = await searchMemories('user123', 'test');
      expect(result).toEqual({ memories: [], relations: [] });
      expect(isMemoryAvailable()).toBe(false);
    });

    it('should handle text/content field variants', async () => {
      _setMem0Available(true);
      const mockClient = createMockClient({
        search: vi.fn().mockResolvedValue({
          results: [
            { text: 'via text field' },
            { content: 'via content field' },
            { memory: 'via memory field' },
          ],
        }),
      });
      _setClient(mockClient);

      const result = await searchMemories('user123', 'test');
      expect(result.memories[0]).toEqual({ id: '', memory: 'via text field', score: null });
      expect(result.memories[1]).toEqual({ id: '', memory: 'via content field', score: null });
      expect(result.memories[2]).toEqual({ id: '', memory: 'via memory field', score: null });
    });

    it('should return empty results when client is null', async () => {
      _setMem0Available(true);
      _setClient(null);
      const result = await searchMemories('user123', 'test');
      expect(result).toEqual({ memories: [], relations: [] });
    });
  });

  describe('getMemories', () => {
    it('should return empty array when unavailable', async () => {
      _setMem0Available(false);
      const result = await getMemories('user123');
      expect(result).toEqual([]);
    });

    it('should call client.getAll and return formatted memories', async () => {
      _setMem0Available(true);
      const mockClient = createMockClient({
        getAll: vi.fn().mockResolvedValue({
          results: [
            { id: 'mem-1', memory: 'Loves Rust' },
            { id: 'mem-2', memory: 'Works at Google' },
          ],
        }),
      });
      _setClient(mockClient);

      const result = await getMemories('user123');
      expect(result).toEqual([
        { id: 'mem-1', memory: 'Loves Rust' },
        { id: 'mem-2', memory: 'Works at Google' },
      ]);

      expect(mockClient.getAll).toHaveBeenCalledWith({
        user_id: 'user123',
        app_id: 'bills-bot',
        enable_graph: true,
      });
    });

    it('should handle array response format', async () => {
      _setMem0Available(true);
      const mockClient = createMockClient({
        getAll: vi.fn().mockResolvedValue([{ id: 'mem-1', memory: 'Test' }]),
      });
      _setClient(mockClient);

      const result = await getMemories('user123');
      expect(result).toEqual([{ id: 'mem-1', memory: 'Test' }]);
    });

    it('should return empty array on SDK error and mark unavailable', async () => {
      _setMem0Available(true);
      const mockClient = createMockClient({
        getAll: vi.fn().mockRejectedValue(new Error('API error')),
      });
      _setClient(mockClient);

      const result = await getMemories('user123');
      expect(result).toEqual([]);
      expect(isMemoryAvailable()).toBe(false);
    });

    it('should return empty array when client is null', async () => {
      _setMem0Available(true);
      _setClient(null);
      const result = await getMemories('user123');
      expect(result).toEqual([]);
    });
  });

  describe('deleteAllMemories', () => {
    it('should return false when unavailable', async () => {
      _setMem0Available(false);
      const result = await deleteAllMemories('user123');
      expect(result).toBe(false);
    });

    it('should call client.deleteAll and return true', async () => {
      _setMem0Available(true);
      const mockClient = createMockClient();
      _setClient(mockClient);

      const result = await deleteAllMemories('user123');
      expect(result).toBe(true);

      expect(mockClient.deleteAll).toHaveBeenCalledWith({
        user_id: 'user123',
        app_id: 'bills-bot',
      });
    });

    it('should return false on SDK error', async () => {
      _setMem0Available(true);
      const mockClient = createMockClient({
        deleteAll: vi.fn().mockRejectedValue(new Error('API error')),
      });
      _setClient(mockClient);

      const result = await deleteAllMemories('user123');
      expect(result).toBe(false);
    });

    it('should return false when client is null', async () => {
      _setMem0Available(true);
      _setClient(null);
      const result = await deleteAllMemories('user123');
      expect(result).toBe(false);
    });
  });

  describe('deleteMemory', () => {
    it('should return false when unavailable', async () => {
      _setMem0Available(false);
      const result = await deleteMemory('mem-1');
      expect(result).toBe(false);
    });

    it('should call client.delete with the memory ID', async () => {
      _setMem0Available(true);
      const mockClient = createMockClient();
      _setClient(mockClient);

      const result = await deleteMemory('mem-42');
      expect(result).toBe(true);

      expect(mockClient.delete).toHaveBeenCalledWith('mem-42');
    });

    it('should return false on SDK error', async () => {
      _setMem0Available(true);
      const mockClient = createMockClient({
        delete: vi.fn().mockRejectedValue(new Error('Not found')),
      });
      _setClient(mockClient);

      const result = await deleteMemory('nonexistent');
      expect(result).toBe(false);
    });

    it('should return false when client is null', async () => {
      _setMem0Available(true);
      _setClient(null);
      const result = await deleteMemory('mem-1');
      expect(result).toBe(false);
    });
  });

  describe('formatRelations', () => {
    it('should return empty string for null/undefined/empty relations', () => {
      expect(formatRelations(null)).toBe('');
      expect(formatRelations(undefined)).toBe('');
      expect(formatRelations([])).toBe('');
    });

    it('should format relations as readable lines', () => {
      const relations = [
        {
          source: 'Joseph',
          source_type: 'person',
          relationship: 'works as',
          target: 'software engineer',
          target_type: 'role',
        },
        {
          source: 'Joseph',
          source_type: 'person',
          relationship: 'lives in',
          target: 'New York',
          target_type: 'location',
        },
      ];

      const result = formatRelations(relations);
      expect(result).toContain('Relationships:');
      expect(result).toContain('Joseph → works as → software engineer');
      expect(result).toContain('Joseph → lives in → New York');
    });
  });

  describe('buildMemoryContext', () => {
    it('should return empty string when unavailable', async () => {
      _setMem0Available(false);
      const result = await buildMemoryContext('user123', 'testuser', 'hello');
      expect(result).toBe('');
    });

    it('should return empty string when user has opted out', async () => {
      _setMem0Available(true);
      const mockClient = createMockClient();
      _setClient(mockClient);
      isOptedOut.mockReturnValue(true);

      const result = await buildMemoryContext('user123', 'testuser', 'hello');
      expect(result).toBe('');
      expect(mockClient.search).not.toHaveBeenCalled();
    });

    it('should return formatted context string with memories and relations', async () => {
      _setMem0Available(true);
      const mockClient = createMockClient({
        search: vi.fn().mockResolvedValue({
          results: [
            { memory: 'User is learning Rust', score: 0.95 },
            { memory: 'User works at Google', score: 0.8 },
          ],
          relations: [
            {
              source: 'testuser',
              source_type: 'person',
              relationship: 'works at',
              target: 'Google',
              target_type: 'organization',
            },
          ],
        }),
      });
      _setClient(mockClient);

      const result = await buildMemoryContext('user123', 'testuser', 'tell me about Rust');
      expect(result).toContain('What you know about testuser');
      expect(result).toContain('- User is learning Rust');
      expect(result).toContain('- User works at Google');
      expect(result).toContain('Relationships:');
      expect(result).toContain('testuser → works at → Google');
    });

    it('should return empty string when no memories or relations found', async () => {
      _setMem0Available(true);
      const mockClient = createMockClient({
        search: vi.fn().mockResolvedValue({ results: [], relations: [] }),
      });
      _setClient(mockClient);

      const result = await buildMemoryContext('user123', 'testuser', 'random query');
      expect(result).toBe('');
    });

    it('should return context with only relations when no memories found', async () => {
      _setMem0Available(true);
      const mockClient = createMockClient({
        search: vi.fn().mockResolvedValue({
          results: [],
          relations: [
            {
              source: 'testuser',
              source_type: 'person',
              relationship: 'likes',
              target: 'programming',
              target_type: 'interest',
            },
          ],
        }),
      });
      _setClient(mockClient);

      const result = await buildMemoryContext('user123', 'testuser', 'hobbies');
      expect(result).toContain('Relationships:');
      expect(result).toContain('testuser → likes → programming');
      expect(result).not.toContain('What you know about');
    });

    it('should return context with only memories when no relations found', async () => {
      _setMem0Available(true);
      const mockClient = createMockClient({
        search: vi.fn().mockResolvedValue({
          results: [{ memory: 'Likes cats', score: 0.9 }],
          relations: [],
        }),
      });
      _setClient(mockClient);

      const result = await buildMemoryContext('user123', 'testuser', 'pets');
      expect(result).toContain('What you know about testuser');
      expect(result).toContain('- Likes cats');
      expect(result).not.toContain('Relationships:');
    });
  });

  describe('extractAndStoreMemories', () => {
    it('should return false when unavailable', async () => {
      _setMem0Available(false);
      const result = await extractAndStoreMemories('user123', 'testuser', 'hello', 'hi');
      expect(result).toBe(false);
    });

    it('should return false when user has opted out', async () => {
      _setMem0Available(true);
      const mockClient = createMockClient();
      _setClient(mockClient);
      isOptedOut.mockReturnValue(true);

      const result = await extractAndStoreMemories('user123', 'testuser', 'hello', 'hi');
      expect(result).toBe(false);
      expect(mockClient.add).not.toHaveBeenCalled();
    });

    it('should return false when autoExtract is disabled', async () => {
      _setMem0Available(true);
      const mockClient = createMockClient();
      _setClient(mockClient);
      getConfig.mockReturnValue({
        memory: { enabled: true, autoExtract: false },
      });

      const result = await extractAndStoreMemories('user123', 'testuser', 'hello', 'hi');
      expect(result).toBe(false);
      expect(mockClient.add).not.toHaveBeenCalled();
    });

    it('should call client.add with conversation messages and graph enabled', async () => {
      _setMem0Available(true);
      const mockClient = createMockClient();
      _setClient(mockClient);

      const result = await extractAndStoreMemories(
        'user123',
        'testuser',
        "I'm learning Rust",
        'Rust is awesome! What project are you working on?',
      );
      expect(result).toBe(true);

      expect(mockClient.add).toHaveBeenCalledWith(
        [
          { role: 'user', content: "testuser: I'm learning Rust" },
          { role: 'assistant', content: 'Rust is awesome! What project are you working on?' },
        ],
        {
          user_id: 'user123',
          app_id: 'bills-bot',
          enable_graph: true,
        },
      );
    });

    it('should return false on SDK failure and mark unavailable', async () => {
      _setMem0Available(true);
      const mockClient = createMockClient({
        add: vi.fn().mockRejectedValue(new Error('API error')),
      });
      _setClient(mockClient);

      const result = await extractAndStoreMemories('user123', 'testuser', 'hi', 'hello');
      expect(result).toBe(false);
      expect(isMemoryAvailable()).toBe(false);
    });

    it('should return false when client is null', async () => {
      _setMem0Available(true);
      _setClient(null);
      const result = await extractAndStoreMemories('user123', 'testuser', 'hi', 'hello');
      expect(result).toBe(false);
    });
  });
});
