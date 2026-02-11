import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

// Mock db module
vi.mock('../../src/db.js', () => ({
  getPool: vi.fn(),
}));

// Mock fs
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

describe('modules/config', () => {
  let configModule;

  beforeEach(async () => {
    vi.resetModules();
    // Re-mock all deps after resetModules
    vi.mock('../../src/logger.js', () => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }));
    vi.mock('../../src/db.js', () => ({
      getPool: vi.fn(),
    }));
    vi.mock('node:fs', () => ({
      existsSync: vi.fn(),
      readFileSync: vi.fn(),
    }));

    // Default mock: config.json exists with test data
    const { existsSync: mockExists, readFileSync: mockRead } = await import('node:fs');
    mockExists.mockReturnValue(true);
    mockRead.mockReturnValue(
      JSON.stringify({
        ai: { enabled: true, model: 'test-model' },
        welcome: { enabled: false },
      }),
    );

    configModule = await import('../../src/modules/config.js');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadConfigFromFile', () => {
    it('should load and parse config.json', () => {
      const config = configModule.loadConfigFromFile();
      expect(config).toBeDefined();
      expect(config.ai.enabled).toBe(true);
    });

    it('should throw if config.json does not exist', async () => {
      vi.resetModules();
      vi.doMock('../../src/logger.js', () => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
      }));
      vi.doMock('../../src/db.js', () => ({
        getPool: vi.fn(),
      }));
      vi.doMock('node:fs', () => ({
        existsSync: vi.fn().mockReturnValue(false),
        readFileSync: vi.fn(),
      }));

      const mod = await import('../../src/modules/config.js');
      expect(() => mod.loadConfigFromFile()).toThrow('config.json not found');
    });

    it('should throw on JSON parse error', async () => {
      vi.resetModules();
      vi.doMock('../../src/logger.js', () => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
      }));
      vi.doMock('../../src/db.js', () => ({
        getPool: vi.fn(),
      }));
      vi.doMock('node:fs', () => ({
        existsSync: vi.fn().mockReturnValue(true),
        readFileSync: vi.fn().mockReturnValue('invalid json{'),
      }));

      const mod = await import('../../src/modules/config.js');
      expect(() => mod.loadConfigFromFile()).toThrow('Failed to load config.json');
    });
  });

  describe('getConfig', () => {
    it('should return current config cache', () => {
      const config = configModule.getConfig();
      expect(typeof config).toBe('object');
    });
  });

  describe('loadConfig', () => {
    it('should fall back to config.json if DB not available', async () => {
      const { getPool: mockGetPool } = await import('../../src/db.js');
      mockGetPool.mockImplementation(() => {
        throw new Error('Database not initialized');
      });

      const config = await configModule.loadConfig();
      expect(config.ai.enabled).toBe(true);
    });

    it('should seed DB from config.json if DB is empty', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({}),
        release: vi.fn(),
      };
      const mockPool = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
        connect: vi.fn().mockResolvedValue(mockClient),
      };
      const { getPool: mockGetPool } = await import('../../src/db.js');
      mockGetPool.mockReturnValue(mockPool);

      const config = await configModule.loadConfig();
      expect(config.ai.enabled).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should load config from DB when rows exist', async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValue({
          rows: [
            { key: 'ai', value: { enabled: false, model: 'db-model' } },
            { key: 'welcome', value: { enabled: true } },
          ],
        }),
      };
      const { getPool: mockGetPool } = await import('../../src/db.js');
      mockGetPool.mockReturnValue(mockPool);

      const config = await configModule.loadConfig();
      expect(config.ai.enabled).toBe(false);
      expect(config.ai.model).toBe('db-model');
    });

    it('should handle DB error and fall back to config.json', async () => {
      const mockPool = {
        query: vi.fn().mockRejectedValue(new Error('DB connection failed')),
      };
      const { getPool: mockGetPool } = await import('../../src/db.js');
      mockGetPool.mockReturnValue(mockPool);

      const config = await configModule.loadConfig();
      expect(config.ai.enabled).toBe(true); // Falls back to file
    });

    it('should handle rollback failure during seeding gracefully', async () => {
      const mockClient = {
        query: vi
          .fn()
          .mockResolvedValueOnce({}) // BEGIN
          .mockRejectedValueOnce(new Error('INSERT failed')) // INSERT
          .mockRejectedValueOnce(new Error('ROLLBACK also failed')), // ROLLBACK
        release: vi.fn(),
      };
      const mockPool = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
        connect: vi.fn().mockResolvedValue(mockClient),
      };
      const { getPool: mockGetPool } = await import('../../src/db.js');
      mockGetPool.mockReturnValue(mockPool);

      // Should fall back to config.json, not crash
      const config = await configModule.loadConfig();
      expect(config.ai.enabled).toBe(true);
    });
  });

  describe('setConfigValue', () => {
    it('should reject paths with less than 2 parts', async () => {
      await expect(configModule.setConfigValue('ai', 'value')).rejects.toThrow(
        'Path must include section and key',
      );
    });

    it('should reject dangerous keys (__proto__)', async () => {
      await expect(configModule.setConfigValue('__proto__.polluted', 'true')).rejects.toThrow(
        'reserved key',
      );
    });

    it('should reject dangerous keys (constructor)', async () => {
      await expect(configModule.setConfigValue('ai.constructor', 'true')).rejects.toThrow(
        'reserved key',
      );
    });

    it('should reject dangerous keys (prototype)', async () => {
      await expect(configModule.setConfigValue('ai.prototype', 'true')).rejects.toThrow(
        'reserved key',
      );
    });

    describe('in-memory only (no DB)', () => {
      beforeEach(async () => {
        const { getPool: mockGetPool } = await import('../../src/db.js');
        mockGetPool.mockImplementation(() => {
          throw new Error('no db');
        });
        await configModule.loadConfig();
      });

      it('should update in-memory only when DB not available', async () => {
        const result = await configModule.setConfigValue('ai.model', 'new-model');
        expect(result.model).toBe('new-model');
        expect(configModule.getConfig().ai.model).toBe('new-model');
      });

      it('should parse boolean values', async () => {
        await configModule.setConfigValue('ai.enabled', 'false');
        expect(configModule.getConfig().ai.enabled).toBe(false);

        await configModule.setConfigValue('ai.enabled', 'true');
        expect(configModule.getConfig().ai.enabled).toBe(true);
      });

      it('should parse null values', async () => {
        await configModule.setConfigValue('ai.model', 'null');
        expect(configModule.getConfig().ai.model).toBeNull();
      });

      it('should parse numeric values', async () => {
        await configModule.setConfigValue('ai.maxTokens', '512');
        expect(configModule.getConfig().ai.maxTokens).toBe(512);
      });

      it('should parse JSON array values', async () => {
        await configModule.setConfigValue('ai.channels', '["ch1","ch2"]');
        expect(configModule.getConfig().ai.channels).toEqual(['ch1', 'ch2']);
      });

      it('should parse JSON string values', async () => {
        await configModule.setConfigValue('ai.model', '"literal-string"');
        expect(configModule.getConfig().ai.model).toBe('literal-string');
      });

      it('should create intermediate objects for nested paths', async () => {
        await configModule.setConfigValue('ai.deep.nested.key', 'value');
        expect(configModule.getConfig().ai.deep.nested.key).toBe('value');
      });

      it('should handle floats and keep precision', async () => {
        await configModule.setConfigValue('ai.temperature', '0.7');
        expect(configModule.getConfig().ai.temperature).toBe(0.7);
      });

      it('should keep unsafe integers as strings', async () => {
        await configModule.setConfigValue('ai.bigNum', '99999999999999999999');
        expect(configModule.getConfig().ai.bigNum).toBe('99999999999999999999');
      });

      it('should keep invalid JSON parse attempts as strings', async () => {
        await configModule.setConfigValue('ai.bad', '[invalid');
        expect(configModule.getConfig().ai.bad).toBe('[invalid');
      });

      it('should parse JSON objects', async () => {
        await configModule.setConfigValue('ai.obj', '{"key":"val"}');
        expect(configModule.getConfig().ai.obj).toEqual({ key: 'val' });
      });

      it('should handle Infinity as string', async () => {
        // Infinity doesn't match the numeric regex so stays as string
        await configModule.setConfigValue('ai.val', 'Infinity');
        expect(configModule.getConfig().ai.val).toBe('Infinity');
      });

      it('should handle non-string values passed directly', async () => {
        await configModule.setConfigValue('ai.num', 42);
        expect(configModule.getConfig().ai.num).toBe(42);
      });
    });

    it('should persist to database when available', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({ rows: [{ value: { enabled: true, model: 'old' } }] }),
        release: vi.fn(),
      };
      const mockPool = {
        query: vi.fn().mockResolvedValue({
          rows: [
            { key: 'ai', value: { enabled: true, model: 'old' } },
            { key: 'welcome', value: { enabled: false } },
          ],
        }),
        connect: vi.fn().mockResolvedValue(mockClient),
      };
      const { getPool: mockGetPool } = await import('../../src/db.js');
      mockGetPool.mockReturnValue(mockPool);

      await configModule.loadConfig();
      await configModule.setConfigValue('ai.model', 'new-model');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should handle transaction rollback on error', async () => {
      const mockClient = {
        query: vi
          .fn()
          .mockResolvedValueOnce({}) // BEGIN
          .mockResolvedValueOnce({ rows: [{ value: { enabled: true } }] }) // SELECT
          .mockRejectedValueOnce(new Error('UPDATE failed')) // UPDATE
          .mockResolvedValueOnce({}), // ROLLBACK
        release: vi.fn(),
      };
      const mockPool = {
        query: vi.fn().mockResolvedValue({
          rows: [{ key: 'ai', value: { enabled: true, model: 'old' } }],
        }),
        connect: vi.fn().mockResolvedValue(mockClient),
      };
      const { getPool: mockGetPool } = await import('../../src/db.js');
      mockGetPool.mockReturnValue(mockPool);

      await configModule.loadConfig();
      await expect(configModule.setConfigValue('ai.model', 'bad')).rejects.toThrow('UPDATE failed');
    });

    it('should create new section if it does not exist', async () => {
      const mockClient = {
        query: vi
          .fn()
          .mockResolvedValueOnce({}) // BEGIN
          .mockResolvedValueOnce({ rows: [] }) // SELECT (section doesn't exist)
          .mockResolvedValueOnce({}) // INSERT
          .mockResolvedValueOnce({}), // COMMIT
        release: vi.fn(),
      };
      const mockPool = {
        query: vi.fn().mockResolvedValue({
          rows: [{ key: 'ai', value: { enabled: true } }],
        }),
        connect: vi.fn().mockResolvedValue(mockClient),
      };
      const { getPool: mockGetPool } = await import('../../src/db.js');
      mockGetPool.mockReturnValue(mockPool);

      await configModule.loadConfig();
      await configModule.setConfigValue('newSection.key', 'value');
      expect(configModule.getConfig().newSection.key).toBe('value');
    });
  });

  describe('resetConfig', () => {
    it('should reset specific section to defaults', async () => {
      const { getPool: mockGetPool } = await import('../../src/db.js');
      mockGetPool.mockImplementation(() => {
        throw new Error('no db');
      });

      await configModule.loadConfig();
      await configModule.setConfigValue('ai.model', 'changed');
      expect(configModule.getConfig().ai.model).toBe('changed');

      await configModule.resetConfig('ai');
      expect(configModule.getConfig().ai.model).toBe('test-model');
    });

    it('should reset all sections to defaults', async () => {
      const { getPool: mockGetPool } = await import('../../src/db.js');
      mockGetPool.mockImplementation(() => {
        throw new Error('no db');
      });

      await configModule.loadConfig();
      await configModule.setConfigValue('ai.model', 'changed');

      await configModule.resetConfig();
      expect(configModule.getConfig().ai.model).toBe('test-model');
    });

    it('should throw if section not found in file defaults', async () => {
      const { getPool: mockGetPool } = await import('../../src/db.js');
      mockGetPool.mockImplementation(() => {
        throw new Error('no db');
      });

      await configModule.loadConfig();
      await expect(configModule.resetConfig('nonexistent')).rejects.toThrow(
        "Section 'nonexistent' not found",
      );
    });

    it('should reset with database persistence', async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
        connect: vi.fn(),
      };
      // First return rows for loadConfig
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { key: 'ai', value: { enabled: true, model: 'changed' } },
          { key: 'welcome', value: { enabled: true } },
        ],
      });
      // Then for the reset
      mockPool.query.mockResolvedValue({});
      const { getPool: mockGetPool } = await import('../../src/db.js');
      mockGetPool.mockReturnValue(mockPool);

      await configModule.loadConfig();
      await configModule.resetConfig('ai');
      expect(configModule.getConfig().ai.model).toBe('test-model');
    });

    it('should handle full reset with database transaction', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({}),
        release: vi.fn(),
      };
      const mockPool = {
        query: vi.fn().mockResolvedValue({
          rows: [
            { key: 'ai', value: { enabled: true, model: 'db-model' } },
            { key: 'welcome', value: { enabled: false } },
          ],
        }),
        connect: vi.fn().mockResolvedValue(mockClient),
      };
      const { getPool: mockGetPool } = await import('../../src/db.js');
      mockGetPool.mockReturnValue(mockPool);

      await configModule.loadConfig();
      await configModule.resetConfig();

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    // NOTE: The following 3 tests directly mutate the getConfig() return value.
    // This works because getConfig() returns a live reference to the internal
    // cache object. If the implementation changes to return a copy/clone,
    // these tests will break and need to be updated.

    it('should remove stale keys from cache on full reset', async () => {
      const { getPool: mockGetPool } = await import('../../src/db.js');
      mockGetPool.mockImplementation(() => {
        throw new Error('no db');
      });

      await configModule.loadConfig();
      // Directly mutates the live cache reference to inject a stale key
      configModule.getConfig().staleKey = { foo: 'bar' };

      await configModule.resetConfig();
      expect(configModule.getConfig().staleKey).toBeUndefined();
    });

    it('should handle section reset where cache has non-object value', async () => {
      const { getPool: mockGetPool } = await import('../../src/db.js');
      mockGetPool.mockImplementation(() => {
        throw new Error('no db');
      });

      await configModule.loadConfig();
      // Directly mutates the live cache reference to replace section with a non-object
      configModule.getConfig().welcome = 'not-an-object';

      await configModule.resetConfig('welcome');
      expect(configModule.getConfig().welcome).toEqual({ enabled: false });
    });

    it('should handle full reset where some cache values are non-objects', async () => {
      const { getPool: mockGetPool } = await import('../../src/db.js');
      mockGetPool.mockImplementation(() => {
        throw new Error('no db');
      });

      await configModule.loadConfig();
      // Directly mutates the live cache reference to replace section with a string
      configModule.getConfig().ai = 'string-value';

      await configModule.resetConfig();
      expect(configModule.getConfig().ai).toEqual({ enabled: true, model: 'test-model' });
    });
  });
});
