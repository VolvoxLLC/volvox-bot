import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/safeSend.js', () => ({
  safeSend: (ch, opts) => ch.send(opts),
  safeReply: (t, opts) => t.reply(opts),
  safeFollowUp: (t, opts) => t.followUp(opts),
  safeEditReply: (t, opts) => t.editReply(opts),
}));
const mocks = vi.hoisted(() => ({
  client: null,
  clientOptions: null,
  onHandlers: {},
  onceHandlers: {},
  processHandlers: {},

  fs: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  },

  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    addPostgresTransport: vi.fn(),
    removePostgresTransport: vi.fn(),
  },

  db: {
    initDb: vi.fn(),
    closeDb: vi.fn(),
  },

  ai: {
    getConversationHistory: vi.fn(),
    setConversationHistory: vi.fn(),
    setPool: vi.fn(),
    initConversationHistory: vi.fn(),
    startConversationCleanup: vi.fn(),
    stopConversationCleanup: vi.fn(),
  },

  config: {
    loadConfig: vi.fn(),
    onConfigChangeCallbacks: {},
  },

  postgres: {
    initLogsTable: vi.fn(),
    pruneOldLogs: vi.fn(),
  },

  events: {
    registerEventHandlers: vi.fn(),
  },

  moderation: {
    startTempbanScheduler: vi.fn(),
    stopTempbanScheduler: vi.fn(),
  },

  health: {
    instance: {},
    getInstance: vi.fn(),
  },

  permissions: {
    hasPermission: vi.fn(),
    getPermissionError: vi.fn(),
  },

  memory: {
    checkMem0Health: vi.fn().mockResolvedValue(false),
    markUnavailable: vi.fn(),
  },

  registerCommands: vi.fn(),
  dotenvConfig: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: mocks.fs.existsSync,
  mkdirSync: mocks.fs.mkdirSync,
  readdirSync: mocks.fs.readdirSync,
  readFileSync: mocks.fs.readFileSync,
  writeFileSync: mocks.fs.writeFileSync,
}));

vi.mock('discord.js', () => {
  class Client {
    constructor(options) {
      this.user = { id: 'bot-user-id', tag: 'Bot#0001' };
      this.guilds = { cache: { size: 2 } };
      this.ws = { ping: 12 };
      this.commands = null;
      this.login = vi.fn().mockResolvedValue('logged-in');
      this.destroy = vi.fn();
      mocks.client = this;
      mocks.clientOptions = options;
    }

    once(event, cb) {
      if (!mocks.onceHandlers[event]) mocks.onceHandlers[event] = [];
      mocks.onceHandlers[event].push(cb);
    }

    on(event, cb) {
      if (!mocks.onHandlers[event]) mocks.onHandlers[event] = [];
      mocks.onHandlers[event].push(cb);
    }
  }

  class Collection extends Map {}

  return {
    Client,
    Collection,
    Events: {
      ClientReady: 'clientReady',
    },
    GatewayIntentBits: {
      Guilds: 1,
      GuildMessages: 2,
      MessageContent: 3,
      GuildMembers: 4,
      GuildVoiceStates: 5,
    },
  };
});

vi.mock('dotenv', () => ({
  config: mocks.dotenvConfig,
}));

vi.mock('../src/db.js', () => ({
  initDb: mocks.db.initDb,
  closeDb: mocks.db.closeDb,
}));

vi.mock('../src/logger.js', () => ({
  info: mocks.logger.info,
  warn: mocks.logger.warn,
  error: mocks.logger.error,
  addPostgresTransport: mocks.logger.addPostgresTransport,
  removePostgresTransport: mocks.logger.removePostgresTransport,
}));

vi.mock('../src/modules/ai.js', () => ({
  getConversationHistory: mocks.ai.getConversationHistory,
  setConversationHistory: mocks.ai.setConversationHistory,
  setPool: mocks.ai.setPool,
  initConversationHistory: mocks.ai.initConversationHistory,
  startConversationCleanup: mocks.ai.startConversationCleanup,
  stopConversationCleanup: mocks.ai.stopConversationCleanup,
}));

vi.mock('../src/modules/config.js', () => ({
  loadConfig: mocks.config.loadConfig,
  onConfigChange: vi.fn((path, cb) => {
    if (!mocks.config.onConfigChangeCallbacks[path]) {
      mocks.config.onConfigChangeCallbacks[path] = [];
    }
    mocks.config.onConfigChangeCallbacks[path].push(cb);
  }),
}));

vi.mock('../src/transports/postgres.js', () => ({
  initLogsTable: mocks.postgres.initLogsTable,
  pruneOldLogs: mocks.postgres.pruneOldLogs,
}));

vi.mock('../src/modules/events.js', () => ({
  registerEventHandlers: mocks.events.registerEventHandlers,
}));

vi.mock('../src/modules/memory.js', () => ({
  checkMem0Health: mocks.memory.checkMem0Health,
  markUnavailable: mocks.memory.markUnavailable,
}));

vi.mock('../src/modules/moderation.js', () => ({
  startTempbanScheduler: mocks.moderation.startTempbanScheduler,
  stopTempbanScheduler: mocks.moderation.stopTempbanScheduler,
}));

vi.mock('../src/utils/health.js', () => ({
  HealthMonitor: {
    getInstance: mocks.health.getInstance,
  },
}));

vi.mock('../src/utils/permissions.js', () => ({
  hasPermission: mocks.permissions.hasPermission,
  getPermissionError: mocks.permissions.getPermissionError,
}));

vi.mock('../src/utils/registerCommands.js', () => ({
  registerCommands: mocks.registerCommands,
}));

async function settleStartupHops() {
  // startup() currently requires 3 microtask hops plus 1 macrotask hop
  // to settle async initialization side-effects in this test harness.
  // If startup() adds/removes awaits, update this helper's hop count.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

async function importIndex({
  token = 'test-token',
  databaseUrl = 'postgres://db',
  stateFile = false,
  stateRaw = null,
  readdirFiles = [],
  loadConfigReject = null,
  loadConfigResult = null,
  throwOnExit = true,
  checkMem0HealthImpl = null,
} = {}) {
  vi.resetModules();

  mocks.onHandlers = {};
  mocks.onceHandlers = {};
  mocks.processHandlers = {};

  mocks.fs.existsSync.mockReset().mockImplementation((path) => {
    const p = String(path);
    if (p.endsWith('state.json')) return stateFile;
    return false;
  });
  mocks.fs.mkdirSync.mockReset();
  mocks.fs.readdirSync.mockReset().mockReturnValue(readdirFiles);
  mocks.fs.readFileSync
    .mockReset()
    .mockReturnValue(
      stateRaw ??
        JSON.stringify({ conversationHistory: [['ch1', [{ role: 'user', content: 'hi' }]]] }),
    );
  mocks.fs.writeFileSync.mockReset();

  mocks.logger.info.mockReset();
  mocks.logger.warn.mockReset();
  mocks.logger.error.mockReset();
  mocks.logger.addPostgresTransport.mockReset().mockReturnValue({ _transport: true });
  mocks.logger.removePostgresTransport.mockReset().mockResolvedValue(undefined);

  mocks.db.initDb.mockReset().mockResolvedValue({ query: vi.fn() });
  mocks.db.closeDb.mockReset().mockResolvedValue(undefined);

  mocks.ai.getConversationHistory.mockReset().mockReturnValue(new Map());
  mocks.ai.setConversationHistory.mockReset();
  mocks.ai.setPool.mockReset();
  mocks.ai.initConversationHistory.mockReset().mockResolvedValue(undefined);
  mocks.ai.startConversationCleanup.mockReset();
  mocks.ai.stopConversationCleanup.mockReset();

  mocks.config.onConfigChangeCallbacks = {};
  mocks.postgres.initLogsTable.mockReset().mockResolvedValue(undefined);
  mocks.postgres.pruneOldLogs.mockReset().mockResolvedValue(0);

  mocks.config.loadConfig.mockReset().mockImplementation(() => {
    if (loadConfigReject) {
      return Promise.reject(loadConfigReject);
    }
    return Promise.resolve(
      loadConfigResult ?? {
        ai: { enabled: true, channels: [] },
        welcome: { enabled: true, channelId: 'welcome-ch' },
        moderation: { enabled: true },
        permissions: { enabled: false, usePermissions: false },
      },
    );
  });

  mocks.events.registerEventHandlers.mockReset();
  mocks.moderation.startTempbanScheduler.mockReset();
  mocks.moderation.stopTempbanScheduler.mockReset();
  mocks.health.getInstance.mockReset().mockReturnValue({});
  mocks.permissions.hasPermission.mockReset().mockReturnValue(true);
  mocks.permissions.getPermissionError.mockReset().mockReturnValue('nope');
  mocks.memory.checkMem0Health.mockReset();
  if (checkMem0HealthImpl) {
    mocks.memory.checkMem0Health.mockImplementation(checkMem0HealthImpl);
  } else {
    mocks.memory.checkMem0Health.mockResolvedValue(false);
  }
  mocks.memory.markUnavailable.mockReset();
  mocks.registerCommands.mockReset().mockResolvedValue(undefined);
  mocks.dotenvConfig.mockReset();

  if (token == null) {
    delete process.env.DISCORD_TOKEN;
  } else {
    process.env.DISCORD_TOKEN = token;
  }

  if (databaseUrl == null) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = databaseUrl;
  }

  vi.spyOn(process, 'on').mockImplementation((event, cb) => {
    mocks.processHandlers[event] = cb;
    return process;
  });

  vi.spyOn(process, 'exit').mockImplementation((code) => {
    if (throwOnExit) {
      throw new Error(`process.exit:${code}`);
    }
    return code;
  });

  const mod = await import('../src/index.js');
  await settleStartupHops();
  return mod;
}

describe('index.js', () => {
  beforeEach(() => {
    delete process.env.DISCORD_TOKEN;
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.DISCORD_TOKEN;
    delete process.env.DATABASE_URL;
  });

  it('should configure allowedMentions to only parse users (Issue #61)', async () => {
    await importIndex({ token: 'abc', databaseUrl: null });
    expect(mocks.clientOptions).toBeDefined();
    expect(mocks.clientOptions.allowedMentions).toEqual({ parse: ['users'] });
  });

  it('should exit when DISCORD_TOKEN is missing', async () => {
    await expect(importIndex({ token: null, databaseUrl: null })).rejects.toThrow('process.exit:1');
    expect(mocks.logger.error).toHaveBeenCalledWith('DISCORD_TOKEN not set');
  });

  it('should initialize startup with database when DATABASE_URL is set', async () => {
    await importIndex({ token: 'abc', databaseUrl: 'postgres://db' });

    expect(mocks.db.initDb).toHaveBeenCalled();
    expect(mocks.config.loadConfig).toHaveBeenCalled();
    expect(mocks.events.registerEventHandlers).toHaveBeenCalled();
    expect(mocks.moderation.startTempbanScheduler).toHaveBeenCalled();
    expect(mocks.client.login).toHaveBeenCalledWith('abc');
  });

  it('should warn and skip db init when DATABASE_URL is not set', async () => {
    await importIndex({ token: 'abc', databaseUrl: null });

    expect(mocks.db.initDb).not.toHaveBeenCalled();
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      'DATABASE_URL not set — using config.json only (no persistence)',
    );
    expect(mocks.moderation.startTempbanScheduler).not.toHaveBeenCalled();
    expect(mocks.client.login).toHaveBeenCalledWith('abc');
  });

  it('should call markUnavailable when checkMem0Health rejects', async () => {
    await importIndex({
      token: 'abc',
      databaseUrl: null,
      checkMem0HealthImpl: () => Promise.reject(new Error('mem0 health check timed out')),
    });

    expect(mocks.memory.markUnavailable).toHaveBeenCalled();
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      'mem0 health check timed out or failed — continuing without memory features',
      { error: 'mem0 health check timed out' },
    );
    // Startup should still complete despite the failure
    expect(mocks.client.login).toHaveBeenCalledWith('abc');
  });

  it('should not call markUnavailable when checkMem0Health succeeds', async () => {
    await importIndex({
      token: 'abc',
      databaseUrl: null,
      checkMem0HealthImpl: () => Promise.resolve(true),
    });

    expect(mocks.memory.markUnavailable).not.toHaveBeenCalled();
    expect(mocks.client.login).toHaveBeenCalledWith('abc');
  });

  it('should load state from disk when state file exists', async () => {
    await importIndex({ token: 'abc', databaseUrl: null, stateFile: true });
    expect(mocks.ai.setConversationHistory).toHaveBeenCalled();
  });

  it('should handle autocomplete interactions', async () => {
    await importIndex({ token: 'abc', databaseUrl: null });

    const autocomplete = vi.fn().mockResolvedValue(undefined);
    mocks.client.commands.set('config', { autocomplete });

    const interactionHandler = mocks.onHandlers.interactionCreate[0];
    const interaction = {
      isAutocomplete: () => true,
      commandName: 'config',
    };

    await interactionHandler(interaction);
    expect(autocomplete).toHaveBeenCalledWith(interaction);
  });

  it('should handle autocomplete errors gracefully', async () => {
    await importIndex({ token: 'abc', databaseUrl: null });

    const autocomplete = vi.fn().mockRejectedValue(new Error('autocomplete fail'));
    mocks.client.commands.set('config', { autocomplete });

    const interactionHandler = mocks.onHandlers.interactionCreate[0];
    const interaction = {
      isAutocomplete: () => true,
      commandName: 'config',
    };

    await interactionHandler(interaction);
    expect(mocks.logger.error).toHaveBeenCalledWith('Autocomplete error', {
      command: 'config',
      error: 'autocomplete fail',
    });
  });

  it('should ignore non-chat interactions', async () => {
    await importIndex({ token: 'abc', databaseUrl: null });

    const interactionHandler = mocks.onHandlers.interactionCreate[0];
    const interaction = {
      isAutocomplete: () => false,
      isChatInputCommand: () => false,
    };

    await interactionHandler(interaction);
    // no crash = pass
  });

  it('should deny command when user lacks permission', async () => {
    await importIndex({ token: 'abc', databaseUrl: null });
    mocks.permissions.hasPermission.mockReturnValue(false);
    mocks.permissions.getPermissionError.mockReturnValue('denied');

    const interactionHandler = mocks.onHandlers.interactionCreate[0];
    const interaction = {
      isAutocomplete: () => false,
      isChatInputCommand: () => true,
      commandName: 'config',
      member: {},
      user: { tag: 'user#1' },
      reply: vi.fn().mockResolvedValue(undefined),
    };

    await interactionHandler(interaction);
    expect(interaction.reply).toHaveBeenCalledWith({ content: 'denied', ephemeral: true });
  });

  it('should handle command not found', async () => {
    await importIndex({ token: 'abc', databaseUrl: null });
    mocks.permissions.hasPermission.mockReturnValue(true);

    const interactionHandler = mocks.onHandlers.interactionCreate[0];
    const interaction = {
      isAutocomplete: () => false,
      isChatInputCommand: () => true,
      commandName: 'missing',
      member: {},
      user: { tag: 'user#1' },
      reply: vi.fn().mockResolvedValue(undefined),
    };

    await interactionHandler(interaction);
    expect(interaction.reply).toHaveBeenCalledWith({
      content: '❌ Command not found.',
      ephemeral: true,
    });
  });

  it('should execute command successfully', async () => {
    await importIndex({ token: 'abc', databaseUrl: null });

    const execute = vi.fn().mockResolvedValue(undefined);
    mocks.client.commands.set('ping', { execute });

    const interactionHandler = mocks.onHandlers.interactionCreate[0];
    const interaction = {
      isAutocomplete: () => false,
      isChatInputCommand: () => true,
      commandName: 'ping',
      member: {},
      user: { tag: 'user#1' },
      reply: vi.fn(),
    };

    await interactionHandler(interaction);
    expect(execute).toHaveBeenCalledWith(interaction);
  });

  it('should handle command execution errors with reply', async () => {
    await importIndex({ token: 'abc', databaseUrl: null });

    const execute = vi.fn().mockRejectedValue(new Error('boom'));
    mocks.client.commands.set('ping', { execute });

    const interactionHandler = mocks.onHandlers.interactionCreate[0];
    const interaction = {
      isAutocomplete: () => false,
      isChatInputCommand: () => true,
      commandName: 'ping',
      member: {},
      user: { tag: 'user#1' },
      replied: false,
      deferred: false,
      reply: vi.fn().mockResolvedValue(undefined),
      followUp: vi.fn(),
    };

    await interactionHandler(interaction);
    expect(interaction.reply).toHaveBeenCalledWith({
      content: '❌ An error occurred while executing this command.',
      ephemeral: true,
    });
  });

  it('should handle command execution errors with followUp when already replied', async () => {
    await importIndex({ token: 'abc', databaseUrl: null });

    const execute = vi.fn().mockRejectedValue(new Error('boom'));
    mocks.client.commands.set('ping', { execute });

    const interactionHandler = mocks.onHandlers.interactionCreate[0];
    const interaction = {
      isAutocomplete: () => false,
      isChatInputCommand: () => true,
      commandName: 'ping',
      member: {},
      user: { tag: 'user#1' },
      replied: true,
      deferred: false,
      reply: vi.fn(),
      followUp: vi.fn().mockResolvedValue(undefined),
    };

    await interactionHandler(interaction);
    expect(interaction.followUp).toHaveBeenCalledWith({
      content: '❌ An error occurred while executing this command.',
      ephemeral: true,
    });
  });

  it('should register commands on clientReady', async () => {
    await importIndex({ token: 'abc', databaseUrl: null });

    mocks.client.commands.set('ping', { data: { name: 'ping' }, execute: vi.fn() });

    await mocks.onceHandlers.clientReady[0]();

    expect(mocks.registerCommands).toHaveBeenCalledWith(
      Array.from(mocks.client.commands.values()),
      'bot-user-id',
      'abc',
      null,
    );
  });

  it('should handle command registration failure on ready', async () => {
    await importIndex({ token: 'abc', databaseUrl: null });

    mocks.registerCommands.mockRejectedValueOnce(new Error('register fail'));

    await mocks.onceHandlers.clientReady[0]();

    expect(mocks.logger.error).toHaveBeenCalledWith('Command registration failed', {
      error: 'register fail',
    });
  });

  it('should run graceful shutdown on SIGINT', async () => {
    await importIndex({ token: 'abc', databaseUrl: null });

    const sigintHandler = mocks.processHandlers.SIGINT;
    await expect(sigintHandler()).rejects.toThrow('process.exit:0');

    expect(mocks.fs.mkdirSync).toHaveBeenCalled();
    expect(mocks.fs.writeFileSync).toHaveBeenCalled();
    expect(mocks.db.closeDb).toHaveBeenCalled();
    expect(mocks.client.destroy).toHaveBeenCalled();
  });

  it('should log save-state failure during shutdown', async () => {
    await importIndex({ token: 'abc', databaseUrl: null });
    mocks.fs.writeFileSync.mockImplementationOnce(() => {
      throw new Error('disk full');
    });

    const sigintHandler = mocks.processHandlers.SIGINT;
    await expect(sigintHandler()).rejects.toThrow('process.exit:0');

    expect(mocks.logger.error).toHaveBeenCalledWith('Failed to save state', {
      error: 'disk full',
    });
  });

  it('should log load-state failure for invalid JSON', async () => {
    await importIndex({
      token: 'abc',
      databaseUrl: null,
      stateFile: true,
      stateRaw: '{invalid-json',
    });

    expect(mocks.logger.error).toHaveBeenCalledWith('Failed to load state', {
      error: expect.any(String),
    });
  });

  // Skipped: dynamic import() in vitest doesn't throw for missing files the same way Node does at runtime
  it.skip('should continue startup when command import fails', () => {});

  it('should log discord client error events', async () => {
    await importIndex({ token: 'abc', databaseUrl: null });

    mocks.onHandlers.error[0]({ message: 'discord broke', stack: 'stack', code: 500 });

    expect(mocks.logger.error).toHaveBeenCalledWith('Discord client error', {
      error: 'discord broke',
      stack: 'stack',
      code: 500,
    });
  });

  it('should handle startup failure and exit', async () => {
    await importIndex({
      token: 'abc',
      databaseUrl: null,
      loadConfigReject: new Error('config fail'),
      throwOnExit: false,
    });

    expect(mocks.logger.error).toHaveBeenCalledWith('Startup failed', {
      error: 'config fail',
      stack: expect.any(String),
    });
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  describe('config change listeners', () => {
    /** Helper to invoke a captured onConfigChange callback */
    function invokeConfigCallback(path, newValue, oldValue = undefined, fullPath = path) {
      const cbs = mocks.config.onConfigChangeCallbacks[path];
      if (!cbs || cbs.length === 0) {
        throw new Error(`No onConfigChange callback registered for "${path}"`);
      }
      return Promise.all(cbs.map((cb) => cb(newValue, oldValue, fullPath)));
    }

    it('should enable postgres transport when logging.database.enabled toggled to true', async () => {
      const loggingConfig = {
        ai: { enabled: true, channels: [] },
        logging: {
          database: { enabled: false, batchSize: 10, flushIntervalMs: 5000, minLevel: 'info' },
        },
      };

      await importIndex({
        token: 'abc',
        databaseUrl: 'postgres://db',
        loadConfigResult: loggingConfig,
      });

      loggingConfig.logging.database.enabled = true;
      await invokeConfigCallback('logging.database.enabled', true);

      expect(mocks.postgres.initLogsTable).toHaveBeenCalled();
      expect(mocks.logger.addPostgresTransport).toHaveBeenCalled();
      expect(mocks.logger.info).toHaveBeenCalledWith(
        'PostgreSQL logging transport enabled via config change',
        { path: 'logging.database.enabled' },
      );
    });

    it('should disable postgres transport when logging.database.enabled toggled to false', async () => {
      // Start with logging enabled so pgTransport is set
      const loggingConfig = {
        ai: { enabled: true, channels: [] },
        logging: {
          database: { enabled: true, batchSize: 10, flushIntervalMs: 5000, minLevel: 'info' },
        },
      };

      await importIndex({
        token: 'abc',
        databaseUrl: 'postgres://db',
        loadConfigResult: loggingConfig,
      });

      // pgTransport should now be set from startup
      expect(mocks.logger.addPostgresTransport).toHaveBeenCalled();

      loggingConfig.logging.database.enabled = false;
      await invokeConfigCallback('logging.database.enabled', false);

      expect(mocks.logger.removePostgresTransport).toHaveBeenCalled();
      expect(mocks.logger.info).toHaveBeenCalledWith(
        'PostgreSQL logging transport disabled via config change',
        { path: 'logging.database.enabled' },
      );
    });

    it('should recreate transport when batchSize changes while enabled', async () => {
      const loggingConfig = {
        ai: { enabled: true, channels: [] },
        logging: {
          database: { enabled: true, batchSize: 10, flushIntervalMs: 5000, minLevel: 'info' },
        },
      };

      await importIndex({
        token: 'abc',
        databaseUrl: 'postgres://db',
        loadConfigResult: loggingConfig,
      });

      mocks.logger.removePostgresTransport.mockClear();
      mocks.logger.addPostgresTransport.mockClear();

      await invokeConfigCallback('logging.database.batchSize', 20);

      expect(mocks.logger.removePostgresTransport).toHaveBeenCalled();
      expect(mocks.logger.addPostgresTransport).toHaveBeenCalled();
      expect(mocks.logger.info).toHaveBeenCalledWith(
        'PostgreSQL logging transport recreated after config change',
        { path: 'logging.database.batchSize' },
      );
    });

    it('should recreate transport when flushIntervalMs changes while enabled', async () => {
      const loggingConfig = {
        ai: { enabled: true, channels: [] },
        logging: {
          database: { enabled: true, batchSize: 10, flushIntervalMs: 5000, minLevel: 'info' },
        },
      };

      await importIndex({
        token: 'abc',
        databaseUrl: 'postgres://db',
        loadConfigResult: loggingConfig,
      });

      mocks.logger.removePostgresTransport.mockClear();
      mocks.logger.addPostgresTransport.mockClear();

      await invokeConfigCallback('logging.database.flushIntervalMs', 10000);

      expect(mocks.logger.removePostgresTransport).toHaveBeenCalled();
      expect(mocks.logger.addPostgresTransport).toHaveBeenCalled();
    });

    it('should recreate transport when minLevel changes while enabled', async () => {
      const loggingConfig = {
        ai: { enabled: true, channels: [] },
        logging: {
          database: { enabled: true, batchSize: 10, flushIntervalMs: 5000, minLevel: 'info' },
        },
      };

      await importIndex({
        token: 'abc',
        databaseUrl: 'postgres://db',
        loadConfigResult: loggingConfig,
      });

      mocks.logger.removePostgresTransport.mockClear();
      mocks.logger.addPostgresTransport.mockClear();

      await invokeConfigCallback('logging.database.minLevel', 'warn');

      expect(mocks.logger.removePostgresTransport).toHaveBeenCalled();
      expect(mocks.logger.addPostgresTransport).toHaveBeenCalled();
    });

    it('should not recreate transport when param changes but transport is disabled', async () => {
      await importIndex({ token: 'abc', databaseUrl: 'postgres://db' });

      mocks.logger.removePostgresTransport.mockClear();
      mocks.logger.addPostgresTransport.mockClear();

      // pgTransport is null (logging.database.enabled was not set), so this should no-op
      await invokeConfigCallback('logging.database.batchSize', 20);

      expect(mocks.logger.removePostgresTransport).not.toHaveBeenCalled();
      expect(mocks.logger.addPostgresTransport).not.toHaveBeenCalled();
    });

    it('should handle error when addPostgresTransport fails during hot toggle', async () => {
      const loggingConfig = {
        ai: { enabled: true, channels: [] },
        logging: {
          database: { enabled: false, batchSize: 10, flushIntervalMs: 5000, minLevel: 'info' },
        },
      };

      await importIndex({
        token: 'abc',
        databaseUrl: 'postgres://db',
        loadConfigResult: loggingConfig,
      });

      mocks.logger.addPostgresTransport.mockImplementation(() => {
        throw new Error('transport init failed');
      });

      loggingConfig.logging.database.enabled = true;
      await invokeConfigCallback('logging.database.enabled', true);

      expect(mocks.logger.error).toHaveBeenCalledWith(
        'Failed to update PostgreSQL logging transport',
        { path: 'logging.database.enabled', error: 'transport init failed' },
      );
    });

    it('should handle error when recreating transport fails', async () => {
      const loggingConfig = {
        ai: { enabled: true, channels: [] },
        logging: {
          database: { enabled: true, batchSize: 10, flushIntervalMs: 5000, minLevel: 'info' },
        },
      };

      await importIndex({
        token: 'abc',
        databaseUrl: 'postgres://db',
        loadConfigResult: loggingConfig,
      });

      mocks.logger.removePostgresTransport.mockRejectedValueOnce(new Error('remove failed'));

      await invokeConfigCallback('logging.database.batchSize', 50);

      expect(mocks.logger.error).toHaveBeenCalledWith(
        'Failed to update PostgreSQL logging transport',
        { path: 'logging.database.batchSize', error: 'remove failed' },
      );
    });

    it('should log observability for ai/spam/moderation config changes', async () => {
      await importIndex({ token: 'abc', databaseUrl: null });

      await invokeConfigCallback('ai.*', 'gpt-4', undefined, 'ai.model');
      expect(mocks.logger.info).toHaveBeenCalledWith('AI config updated', {
        path: 'ai.model',
        newValue: 'gpt-4',
      });

      await invokeConfigCallback('spam.*', true, undefined, 'spam.enabled');
      expect(mocks.logger.info).toHaveBeenCalledWith('Spam config updated', {
        path: 'spam.enabled',
        newValue: true,
      });

      await invokeConfigCallback('moderation.*', false, undefined, 'moderation.automod');
      expect(mocks.logger.info).toHaveBeenCalledWith('Moderation config updated', {
        path: 'moderation.automod',
        newValue: false,
      });
    });
  });
});
