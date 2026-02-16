import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock config module
vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn(() => ({
    memory: {
      enabled: true,
      maxContextMemories: 5,
      autoExtract: true,
      extractModel: null,
    },
  })),
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
  _setMem0Available,
  addMemory,
  buildMemoryContext,
  checkMem0Health,
  deleteAllMemories,
  deleteMemory,
  extractAndStoreMemories,
  getMem0Url,
  getMemories,
  getMemoryConfig,
  isMemoryAvailable,
  searchMemories,
} from '../../src/modules/memory.js';

describe('memory module', () => {
  /** @type {ReturnType<typeof vi.spyOn>} */
  let fetchSpy;

  beforeEach(() => {
    _setMem0Available(false);
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    vi.clearAllMocks();
    // Reset config mock to defaults
    getConfig.mockReturnValue({
      memory: {
        enabled: true,
        maxContextMemories: 5,
        autoExtract: true,
        extractModel: null,
      },
    });
    // Restore env
    delete process.env.MEM0_API_URL;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    delete process.env.MEM0_API_URL;
  });

  describe('getMem0Url', () => {
    it('should return default URL when env not set', () => {
      expect(getMem0Url()).toBe('http://localhost:8080');
    });

    it('should return env URL when set', () => {
      process.env.MEM0_API_URL = 'https://mem0.example.com';
      expect(getMem0Url()).toBe('https://mem0.example.com');
    });

    it('should strip trailing slashes', () => {
      process.env.MEM0_API_URL = 'https://mem0.example.com///';
      expect(getMem0Url()).toBe('https://mem0.example.com');
    });
  });

  describe('getMemoryConfig', () => {
    it('should return config values from bot config', () => {
      const config = getMemoryConfig();
      expect(config.enabled).toBe(true);
      expect(config.maxContextMemories).toBe(5);
      expect(config.autoExtract).toBe(true);
      expect(config.extractModel).toBeNull();
    });

    it('should return defaults when config is missing', () => {
      getConfig.mockReturnValue({});
      const config = getMemoryConfig();
      expect(config.enabled).toBe(true);
      expect(config.maxContextMemories).toBe(5);
      expect(config.autoExtract).toBe(true);
    });

    it('should return defaults when getConfig throws', () => {
      getConfig.mockImplementation(() => {
        throw new Error('not loaded');
      });
      const config = getMemoryConfig();
      expect(config.enabled).toBe(true);
      expect(config.maxContextMemories).toBe(5);
    });

    it('should respect custom config values', () => {
      getConfig.mockReturnValue({
        memory: {
          enabled: false,
          maxContextMemories: 10,
          autoExtract: false,
          extractModel: 'custom-model',
        },
      });
      const config = getMemoryConfig();
      expect(config.enabled).toBe(false);
      expect(config.maxContextMemories).toBe(10);
      expect(config.autoExtract).toBe(false);
      expect(config.extractModel).toBe('custom-model');
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
  });

  describe('checkMem0Health', () => {
    it('should mark as available when health check passes (200)', async () => {
      fetchSpy.mockResolvedValue({ ok: true, status: 200 });

      const result = await checkMem0Health();
      expect(result).toBe(true);
      expect(isMemoryAvailable()).toBe(true);
    });

    it('should mark as available when health check returns 404', async () => {
      fetchSpy.mockResolvedValue({ ok: false, status: 404 });

      const result = await checkMem0Health();
      expect(result).toBe(true);
      expect(isMemoryAvailable()).toBe(true);
    });

    it('should mark as unavailable on network error', async () => {
      fetchSpy.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await checkMem0Health();
      expect(result).toBe(false);
      expect(isMemoryAvailable()).toBe(false);
    });

    it('should mark as unavailable on 500 error', async () => {
      fetchSpy.mockResolvedValue({ ok: false, status: 500 });

      const result = await checkMem0Health();
      expect(result).toBe(false);
      expect(isMemoryAvailable()).toBe(false);
    });

    it('should return false when memory disabled in config', async () => {
      getConfig.mockReturnValue({ memory: { enabled: false } });

      const result = await checkMem0Health();
      expect(result).toBe(false);
      expect(isMemoryAvailable()).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('addMemory', () => {
    it('should return false when memory unavailable', async () => {
      _setMem0Available(false);
      const result = await addMemory('user123', 'I love Rust');
      expect(result).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should POST to mem0 and return true on success', async () => {
      _setMem0Available(true);
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'mem-1' }),
      });

      const result = await addMemory('user123', 'I love Rust');
      expect(result).toBe(true);

      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toContain('/v1/memories/');
      expect(opts.method).toBe('POST');

      const body = JSON.parse(opts.body);
      expect(body.user_id).toBe('user123');
      expect(body.app_id).toBe('bills-bot');
      expect(body.messages[0].content).toBe('I love Rust');
    });

    it('should return false on API error', async () => {
      _setMem0Available(true);
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await addMemory('user123', 'test');
      expect(result).toBe(false);
    });

    it('should return false on network error and mark unavailable', async () => {
      _setMem0Available(true);
      fetchSpy.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await addMemory('user123', 'test');
      expect(result).toBe(false);
      expect(isMemoryAvailable()).toBe(false);
    });

    it('should pass optional metadata', async () => {
      _setMem0Available(true);
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'mem-1' }),
      });

      await addMemory('user123', 'test', { source: 'chat' });

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.metadata).toEqual({ source: 'chat' });
    });
  });

  describe('searchMemories', () => {
    it('should return empty array when unavailable', async () => {
      _setMem0Available(false);
      const result = await searchMemories('user123', 'Rust');
      expect(result).toEqual([]);
    });

    it('should search and return formatted memories', async () => {
      _setMem0Available(true);
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              { memory: 'User is learning Rust', score: 0.95 },
              { memory: 'User works at Google', score: 0.8 },
            ],
          }),
      });

      const result = await searchMemories('user123', 'What language?');
      expect(result).toEqual([
        { memory: 'User is learning Rust', score: 0.95 },
        { memory: 'User works at Google', score: 0.8 },
      ]);

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.user_id).toBe('user123');
      expect(body.app_id).toBe('bills-bot');
      expect(body.limit).toBe(5);
    });

    it('should handle array response format', async () => {
      _setMem0Available(true);
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ memory: 'User loves TypeScript', score: 0.9 }]),
      });

      const result = await searchMemories('user123', 'languages');
      expect(result).toEqual([{ memory: 'User loves TypeScript', score: 0.9 }]);
    });

    it('should respect custom limit parameter', async () => {
      _setMem0Available(true);
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      });

      await searchMemories('user123', 'test', 3);

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.limit).toBe(3);
    });

    it('should return empty array on API error', async () => {
      _setMem0Available(true);
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Error',
      });

      const result = await searchMemories('user123', 'test');
      expect(result).toEqual([]);
    });

    it('should handle text/content field variants', async () => {
      _setMem0Available(true);
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              { text: 'via text field' },
              { content: 'via content field' },
              { memory: 'via memory field' },
            ],
          }),
      });

      const result = await searchMemories('user123', 'test');
      expect(result[0].memory).toBe('via text field');
      expect(result[1].memory).toBe('via content field');
      expect(result[2].memory).toBe('via memory field');
    });
  });

  describe('getMemories', () => {
    it('should return empty array when unavailable', async () => {
      _setMem0Available(false);
      const result = await getMemories('user123');
      expect(result).toEqual([]);
    });

    it('should GET all memories for a user', async () => {
      _setMem0Available(true);
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              { id: 'mem-1', memory: 'Loves Rust' },
              { id: 'mem-2', memory: 'Works at Google' },
            ],
          }),
      });

      const result = await getMemories('user123');
      expect(result).toEqual([
        { id: 'mem-1', memory: 'Loves Rust' },
        { id: 'mem-2', memory: 'Works at Google' },
      ]);

      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toContain('user_id=user123');
      expect(url).toContain('app_id=bills-bot');
      expect(opts.method).toBe('GET');
    });

    it('should handle array response format', async () => {
      _setMem0Available(true);
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ id: 'mem-1', memory: 'Test' }]),
      });

      const result = await getMemories('user123');
      expect(result).toEqual([{ id: 'mem-1', memory: 'Test' }]);
    });

    it('should return empty array on API error', async () => {
      _setMem0Available(true);
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

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

    it('should DELETE all memories and return true', async () => {
      _setMem0Available(true);
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ deleted: true }),
      });

      const result = await deleteAllMemories('user123');
      expect(result).toBe(true);

      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toContain('user_id=user123');
      expect(url).toContain('app_id=bills-bot');
      expect(opts.method).toBe('DELETE');
    });

    it('should return false on API error', async () => {
      _setMem0Available(true);
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Error',
      });

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

    it('should DELETE a specific memory by ID', async () => {
      _setMem0Available(true);
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ deleted: true }),
      });

      const result = await deleteMemory('mem-42');
      expect(result).toBe(true);

      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toContain('/v1/memories/mem-42/');
      expect(opts.method).toBe('DELETE');
    });

    it('should return false on API error', async () => {
      _setMem0Available(true);
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const result = await deleteMemory('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('buildMemoryContext', () => {
    it('should return empty string when unavailable', async () => {
      _setMem0Available(false);
      const result = await buildMemoryContext('user123', 'testuser', 'hello');
      expect(result).toBe('');
    });

    it('should return formatted context string with memories', async () => {
      _setMem0Available(true);
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              { memory: 'User is learning Rust', score: 0.95 },
              { memory: 'User works at Google', score: 0.8 },
            ],
          }),
      });

      const result = await buildMemoryContext('user123', 'testuser', 'tell me about Rust');
      expect(result).toContain('What you know about testuser');
      expect(result).toContain('- User is learning Rust');
      expect(result).toContain('- User works at Google');
    });

    it('should return empty string when no memories found', async () => {
      _setMem0Available(true);
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      });

      const result = await buildMemoryContext('user123', 'testuser', 'random query');
      expect(result).toBe('');
    });
  });

  describe('extractAndStoreMemories', () => {
    it('should return false when unavailable', async () => {
      _setMem0Available(false);
      const result = await extractAndStoreMemories('user123', 'testuser', 'hello', 'hi');
      expect(result).toBe(false);
    });

    it('should return false when autoExtract is disabled', async () => {
      _setMem0Available(true);
      getConfig.mockReturnValue({
        memory: { enabled: true, autoExtract: false },
      });

      const result = await extractAndStoreMemories('user123', 'testuser', 'hello', 'hi');
      expect(result).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should POST conversation to mem0 for extraction', async () => {
      _setMem0Available(true);
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [{ id: 'mem-1' }] }),
      });

      const result = await extractAndStoreMemories(
        'user123',
        'testuser',
        "I'm learning Rust",
        'Rust is awesome! What project are you working on?',
      );
      expect(result).toBe(true);

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.user_id).toBe('user123');
      expect(body.app_id).toBe('bills-bot');
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0].role).toBe('user');
      expect(body.messages[0].content).toContain("I'm learning Rust");
      expect(body.messages[1].role).toBe('assistant');
    });

    it('should return false on API failure', async () => {
      _setMem0Available(true);
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Error',
      });

      const result = await extractAndStoreMemories('user123', 'testuser', 'hi', 'hello');
      expect(result).toBe(false);
    });
  });

  describe('timeout handling', () => {
    it('should handle fetch abort on timeout', async () => {
      _setMem0Available(true);
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      fetchSpy.mockRejectedValue(abortError);

      const result = await addMemory('user123', 'test');
      expect(result).toBe(false);
      // Should mark as unavailable
      expect(isMemoryAvailable()).toBe(false);
    });
  });
});
