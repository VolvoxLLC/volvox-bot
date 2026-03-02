import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Top-level mocks are hoisted by Vitest, but because we use vi.resetModules()
// and dynamic imports we re-wire them in beforeEach. The hoisted vi.mock calls
// establish the module-replacement entries that persist across resets.

vi.mock('../src/logger.js', () => ({
  addPostgresTransport: vi.fn().mockReturnValue({ close: vi.fn() }),
  removePostgresTransport: vi.fn().mockResolvedValue(undefined),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../src/modules/config.js', () => ({
  onConfigChange: vi.fn(),
}));

describe('config-listeners', () => {
  let registerConfigListeners, removeLoggingTransport, setInitialTransport;
  let onConfigChange, addPostgresTransport, removePostgresTransportMock;
  let loggerInfo, loggerError;

  beforeEach(async () => {
    vi.resetModules();

    // Re-apply mock implementations after module reset
    vi.mock('../src/logger.js', () => ({
      addPostgresTransport: vi.fn().mockReturnValue({ close: vi.fn() }),
      removePostgresTransport: vi.fn().mockResolvedValue(undefined),
      info: vi.fn(),
      error: vi.fn(),
    }));
    vi.mock('../src/modules/config.js', () => ({
      onConfigChange: vi.fn(),
    }));
    // Import fresh copies of the mocked modules
    const loggerMod = await import('../src/logger.js');
    addPostgresTransport = loggerMod.addPostgresTransport;
    removePostgresTransportMock = loggerMod.removePostgresTransport;
    loggerInfo = loggerMod.info;
    loggerError = loggerMod.error;

    const configMod = await import('../src/modules/config.js');
    onConfigChange = configMod.onConfigChange;

    // Import the module under test with fresh internal state
    const mod = await import('../src/config-listeners.js');
    registerConfigListeners = mod.registerConfigListeners;
    removeLoggingTransport = mod.removeLoggingTransport;
    setInitialTransport = mod.setInitialTransport;
  });

  vi.mock('../src/utils/cache.js', () => ({
    cacheDelPattern: vi.fn().mockResolvedValue(0),
  }));

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Call registerConfigListeners and return a map of key -> callback
   * captured from onConfigChange mock calls.
   */
  function registerAndCapture(dbPool, config) {
    registerConfigListeners({ dbPool, config });
    const listeners = {};
    for (const call of onConfigChange.mock.calls) {
      listeners[call[0]] = call[1];
    }
    return listeners;
  }

  // ── Registration ────────────────────────────────────────────────────────

  describe('registerConfigListeners', () => {
    it('registers listeners for all expected config keys', () => {
      const config = { logging: { database: { enabled: false } } };
      registerConfigListeners({ dbPool: {}, config });

      const registeredKeys = onConfigChange.mock.calls.map((c) => c[0]);
      expect(registeredKeys).toContain('logging.database');
      expect(registeredKeys).toContain('logging.database.enabled');
      expect(registeredKeys).toContain('logging.database.batchSize');
      expect(registeredKeys).toContain('logging.database.flushIntervalMs');
      expect(registeredKeys).toContain('logging.database.minLevel');
      expect(registeredKeys).toContain('ai.*');
      expect(registeredKeys).toContain('spam.*');
      expect(registeredKeys).toContain('moderation.*');
      expect(registeredKeys).toContain('welcome.*');
      expect(registeredKeys).toContain('starboard.*');
      expect(registeredKeys).toContain('reputation.*');
    });

    it('registers exactly 11 listeners', () => {
      const config = { logging: { database: { enabled: false } } };
      registerConfigListeners({ dbPool: {}, config });
      expect(onConfigChange).toHaveBeenCalledTimes(11);
    });
  });

  // ── Transport enabled ──────────────────────────────────────────────────

  describe('transport enable (enabled=true, no existing transport)', () => {
    it('calls addPostgresTransport when enabled', async () => {
      const dbPool = { query: vi.fn() };
      const config = { logging: { database: { enabled: true, batchSize: 50 } } };
      const listeners = registerAndCapture(dbPool, config);

      await listeners['logging.database.enabled'](
        true,
        false,
        'logging.database.enabled',
        'global',
      );

      expect(addPostgresTransport).toHaveBeenCalledWith(dbPool, config.logging.database);
      expect(loggerInfo).toHaveBeenCalledWith(
        'PostgreSQL logging transport enabled via config change',
        expect.objectContaining({ path: 'logging.database.enabled' }),
      );
    });
  });

  // ── Transport disabled ─────────────────────────────────────────────────

  describe('transport disable (enabled=false, existing transport)', () => {
    it('calls removePostgresTransport and logs', async () => {
      const dbPool = { query: vi.fn() };
      const config = { logging: { database: { enabled: true } } };
      const listeners = registerAndCapture(dbPool, config);

      // First enable the transport
      await listeners['logging.database.enabled'](
        true,
        false,
        'logging.database.enabled',
        'global',
      );
      const transportRef = addPostgresTransport.mock.results[0].value;

      // Now disable it
      config.logging.database.enabled = false;
      await listeners['logging.database.enabled'](
        false,
        true,
        'logging.database.enabled',
        'global',
      );

      expect(removePostgresTransportMock).toHaveBeenCalledWith(transportRef);
      expect(loggerInfo).toHaveBeenCalledWith(
        'PostgreSQL logging transport disabled via config change',
        expect.objectContaining({ path: 'logging.database.enabled' }),
      );
    });
  });

  // ── Transport recreated ────────────────────────────────────────────────

  describe('transport recreate (enabled=true, transport already exists)', () => {
    it('removes old transport and adds new one', async () => {
      const dbPool = { query: vi.fn() };
      const config = { logging: { database: { enabled: true, batchSize: 50 } } };
      const listeners = registerAndCapture(dbPool, config);

      // Enable initially
      await listeners['logging.database.enabled'](
        true,
        false,
        'logging.database.enabled',
        'global',
      );
      const oldTransport = addPostgresTransport.mock.results[0].value;

      // Trigger recreate via batchSize change (transport exists, still enabled)
      await listeners['logging.database.batchSize'](
        100,
        50,
        'logging.database.batchSize',
        'global',
      );

      expect(removePostgresTransportMock).toHaveBeenCalledWith(oldTransport);
      expect(addPostgresTransport).toHaveBeenCalledTimes(2);
      expect(loggerInfo).toHaveBeenCalledWith(
        'PostgreSQL logging transport recreated after config change',
        expect.objectContaining({ path: 'logging.database.batchSize' }),
      );
    });
  });

  // ── Re-check after remove during recreate ──────────────────────────────

  describe('recreate bails out if config flipped during await', () => {
    it('does not add new transport if enabled became false during remove', async () => {
      const dbPool = { query: vi.fn() };
      const config = { logging: { database: { enabled: true } } };
      const listeners = registerAndCapture(dbPool, config);

      // Enable initially
      await listeners['logging.database.enabled'](
        true,
        false,
        'logging.database.enabled',
        'global',
      );

      // Simulate: removePostgresTransport is slow and config flips to false mid-operation
      removePostgresTransportMock.mockImplementationOnce(async () => {
        config.logging.database.enabled = false;
      });

      // Trigger recreate (transport exists, currently enabled)
      config.logging.database.enabled = true; // set back for the initial check
      await listeners['logging.database'](
        config.logging.database,
        null,
        'logging.database',
        'global',
      );

      // After remove, config.enabled is false, so addPostgresTransport should NOT be called again
      // It was called once during initial enable
      expect(addPostgresTransport).toHaveBeenCalledTimes(1);
    });
  });

  // ── removeLoggingTransport ─────────────────────────────────────────────

  describe('removeLoggingTransport', () => {
    it('removes transport and sets internal ref to null', async () => {
      const dbPool = { query: vi.fn() };
      const config = { logging: { database: { enabled: true } } };
      const listeners = registerAndCapture(dbPool, config);

      // Enable transport
      await listeners['logging.database.enabled'](
        true,
        false,
        'logging.database.enabled',
        'global',
      );
      const transportRef = addPostgresTransport.mock.results[0].value;

      // Call removeLoggingTransport
      await removeLoggingTransport();

      expect(removePostgresTransportMock).toHaveBeenCalledWith(transportRef);
    });

    it('is a no-op when no transport exists', async () => {
      await removeLoggingTransport();
      expect(removePostgresTransportMock).not.toHaveBeenCalled();
    });
  });

  // ── setInitialTransport ────────────────────────────────────────────────

  describe('setInitialTransport', () => {
    it('sets the internal transport reference', async () => {
      const fakeTransport = { close: vi.fn() };
      setInitialTransport(fakeTransport);

      // Verify by calling removeLoggingTransport — it should remove this transport
      await removeLoggingTransport();
      expect(removePostgresTransportMock).toHaveBeenCalledWith(fakeTransport);
    });
  });

  // ── Error handling ─────────────────────────────────────────────────────

  describe('error handling', () => {
    it('logs error but does not crash when updateLoggingTransport throws', async () => {
      const dbPool = { query: vi.fn() };
      const config = { logging: { database: { enabled: true } } };
      const listeners = registerAndCapture(dbPool, config);

      // Make addPostgresTransport throw
      addPostgresTransport.mockImplementationOnce(() => {
        throw new Error('DB connection failed');
      });

      await listeners['logging.database.enabled'](
        true,
        false,
        'logging.database.enabled',
        'global',
      );

      expect(loggerError).toHaveBeenCalledWith(
        'Failed to update PostgreSQL logging transport',
        expect.objectContaining({ error: 'DB connection failed' }),
      );
    });
  });

  // ── Guild-scoped changes ───────────────────────────────────────────────

  describe('guild-scoped changes', () => {
    it('ignores changes with a non-global guildId', async () => {
      const dbPool = { query: vi.fn() };
      const config = { logging: { database: { enabled: true } } };
      const listeners = registerAndCapture(dbPool, config);

      await listeners['logging.database.enabled'](
        true,
        false,
        'logging.database.enabled',
        'guild-123',
      );

      expect(addPostgresTransport).not.toHaveBeenCalled();
    });

    it('processes changes with guildId "global"', async () => {
      const dbPool = { query: vi.fn() };
      const config = { logging: { database: { enabled: true } } };
      const listeners = registerAndCapture(dbPool, config);

      await listeners['logging.database.enabled'](
        true,
        false,
        'logging.database.enabled',
        'global',
      );

      expect(addPostgresTransport).toHaveBeenCalled();
    });

    it('processes changes with no guildId (undefined)', async () => {
      const dbPool = { query: vi.fn() };
      const config = { logging: { database: { enabled: true } } };
      const listeners = registerAndCapture(dbPool, config);

      await listeners['logging.database.enabled'](
        true,
        false,
        'logging.database.enabled',
        undefined,
      );

      expect(addPostgresTransport).toHaveBeenCalled();
    });
  });

  // ── No dbPool ──────────────────────────────────────────────────────────

  describe('no dbPool', () => {
    it('returns early when dbPool is null', async () => {
      const config = { logging: { database: { enabled: true } } };
      const listeners = registerAndCapture(null, config);

      await listeners['logging.database.enabled'](
        true,
        false,
        'logging.database.enabled',
        'global',
      );

      expect(addPostgresTransport).not.toHaveBeenCalled();
    });
  });

  // ── Observability-only listeners ───────────────────────────────────────

  describe('observability listeners (ai, spam, moderation)', () => {
    it('ai.* listener logs the change', () => {
      const config = {};
      const listeners = registerAndCapture({}, config);

      listeners['ai.*']('newVal', 'oldVal', 'ai.model', 'guild-42');

      expect(loggerInfo).toHaveBeenCalledWith('AI config updated', {
        path: 'ai.model',
        newValue: 'newVal',
        guildId: 'guild-42',
      });
    });

    it('spam.* listener logs the change', () => {
      const config = {};
      const listeners = registerAndCapture({}, config);

      listeners['spam.*']('newVal', 'oldVal', 'spam.threshold', 'global');

      expect(loggerInfo).toHaveBeenCalledWith('Spam config updated', {
        path: 'spam.threshold',
        newValue: 'newVal',
        guildId: 'global',
      });
    });

    it('moderation.* listener logs the change', () => {
      const config = {};
      const listeners = registerAndCapture({}, config);

      listeners['moderation.*'](true, false, 'moderation.automod', undefined);

      expect(loggerInfo).toHaveBeenCalledWith('Moderation config updated', {
        path: 'moderation.automod',
        newValue: true,
        guildId: undefined,
      });
    });
  });

  // ── Disabled + no transport = no-op ────────────────────────────────────

  describe('disabled with no existing transport', () => {
    it('does nothing when enabled=false and no transport exists', async () => {
      const dbPool = { query: vi.fn() };
      const config = { logging: { database: { enabled: false } } };
      const listeners = registerAndCapture(dbPool, config);

      await listeners['logging.database.enabled'](
        false,
        true,
        'logging.database.enabled',
        'global',
      );

      expect(addPostgresTransport).not.toHaveBeenCalled();
      expect(removePostgresTransportMock).not.toHaveBeenCalled();
    });
  });
});
