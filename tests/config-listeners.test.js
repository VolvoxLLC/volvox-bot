import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../src/modules/botStatus.js', () => ({
  reloadBotStatus: vi.fn(),
}));

vi.mock('../src/modules/config.js', () => ({
  onConfigChange: vi.fn(),
}));

vi.mock('../src/modules/webhookNotifier.js', () => ({
  fireEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/utils/cache.js', () => ({
  cacheDelPattern: vi.fn().mockResolvedValue(0),
}));

describe('config-listeners', () => {
  let registerConfigListeners;
  let removeLoggingTransport;
  let onConfigChange;
  let loggerInfo;

  beforeEach(async () => {
    vi.resetModules();

    const loggerMod = await import('../src/logger.js');
    loggerInfo = loggerMod.info;

    const configMod = await import('../src/modules/config.js');
    onConfigChange = configMod.onConfigChange;

    const mod = await import('../src/config-listeners.js');
    registerConfigListeners = mod.registerConfigListeners;
    removeLoggingTransport = mod.removeLoggingTransport;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function registerAndCapture(dbPool = {}, config = {}) {
    registerConfigListeners({ dbPool, config });
    return Object.fromEntries(
      onConfigChange.mock.calls.map(([path, callback]) => [path, callback]),
    );
  }

  describe('registerConfigListeners', () => {
    it('accepts null dbPool without throwing', () => {
      expect(() => registerConfigListeners({ dbPool: null, config: {} })).not.toThrow();
    });

    it('does not register database log transport listeners', () => {
      registerConfigListeners({ dbPool: {}, config: { logging: { database: { enabled: true } } } });

      const registeredKeys = onConfigChange.mock.calls.map(([path]) => path);

      expect(registeredKeys).not.toContain('logging.database');
      expect(registeredKeys).not.toContain('logging.database.enabled');
      expect(registeredKeys).not.toContain('logging.database.batchSize');
      expect(registeredKeys).not.toContain('logging.database.flushIntervalMs');
      expect(registeredKeys).not.toContain('logging.database.minLevel');
    });

    it('registers the non-log listeners', () => {
      registerConfigListeners({ dbPool: {}, config: {} });

      const registeredKeys = onConfigChange.mock.calls.map(([path]) => path);

      expect(registeredKeys).toContain('ai.*');
      expect(registeredKeys).toContain('spam.*');
      expect(registeredKeys).toContain('moderation.*');
      expect(registeredKeys).toContain('welcome.*');
      expect(registeredKeys).toContain('starboard.*');
      expect(registeredKeys).toContain('reputation.*');
      expect(registeredKeys).toContain('botStatus.rotation.enabled');
      expect(registeredKeys).toContain('botStatus.rotation.intervalMinutes');
      expect(registeredKeys).toContain('botStatus.rotation.messages');
      expect(registeredKeys).toHaveLength(17);
    });
  });

  describe('removeLoggingTransport', () => {
    it('is a no-op', async () => {
      await expect(removeLoggingTransport()).resolves.toBeUndefined();
    });

    it('can be called multiple times without error', async () => {
      await expect(removeLoggingTransport()).resolves.toBeUndefined();
      await expect(removeLoggingTransport()).resolves.toBeUndefined();
      await expect(removeLoggingTransport()).resolves.toBeUndefined();
    });

    it('does not call logger methods when called', async () => {
      await removeLoggingTransport();

      expect(loggerInfo).not.toHaveBeenCalled();
    });
  });

  describe('observability listeners', () => {
    it('logs AI config updates', () => {
      const listeners = registerAndCapture();

      listeners['ai.*']('newVal', 'oldVal', 'ai.model', 'guild-42');

      expect(loggerInfo).toHaveBeenCalledWith('AI config updated', {
        path: 'ai.model',
        newValue: 'newVal',
        guildId: 'guild-42',
      });
    });

    it('logs spam config updates', () => {
      const listeners = registerAndCapture();

      listeners['spam.*']('newVal', 'oldVal', 'spam.threshold', 'global');

      expect(loggerInfo).toHaveBeenCalledWith('Spam config updated', {
        path: 'spam.threshold',
        newValue: 'newVal',
        guildId: 'global',
      });
    });

    it('logs moderation config updates', () => {
      const listeners = registerAndCapture();

      listeners['moderation.*'](true, false, 'moderation.automod', undefined);

      expect(loggerInfo).toHaveBeenCalledWith('Moderation config updated', {
        path: 'moderation.automod',
        newValue: true,
        guildId: undefined,
      });
    });
  });

  describe('cache invalidation listeners', () => {
    let cacheDelPattern;

    beforeEach(async () => {
      const cacheMod = await import('../src/utils/cache.js');
      cacheDelPattern = cacheMod.cacheDelPattern;
    });

    it('welcome.* invalidates guild channel cache for guild-scoped changes', async () => {
      const listeners = registerAndCapture();

      await listeners['welcome.*'](null, null, 'welcome.channelId', 'guild-42');

      expect(cacheDelPattern).toHaveBeenCalledWith('discord:guild:guild-42:*');
    });

    it('starboard.* invalidates guild channel cache for guild-scoped changes', async () => {
      const listeners = registerAndCapture();

      await listeners['starboard.*'](null, null, 'starboard.channelId', 'guild-99');

      expect(cacheDelPattern).toHaveBeenCalledWith('discord:guild:guild-99:*');
    });

    it('reputation.* invalidates leaderboard and reputation caches for guild-scoped changes', async () => {
      const listeners = registerAndCapture();

      await listeners['reputation.*'](null, null, 'reputation.xpPerMessage', 'guild-77');

      expect(cacheDelPattern).toHaveBeenCalledWith('leaderboard:guild-77*');
      expect(cacheDelPattern).toHaveBeenCalledWith('reputation:guild-77:*');
    });
  });
});
