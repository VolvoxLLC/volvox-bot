import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  client: null,
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
  },

  db: {
    initDb: vi.fn(),
    closeDb: vi.fn(),
  },

  ai: {
    getConversationHistory: vi.fn(),
    setConversationHistory: vi.fn(),
  },

  config: {
    loadConfig: vi.fn(),
  },

  events: {
    registerEventHandlers: vi.fn(),
  },

  health: {
    instance: {},
    getInstance: vi.fn(),
  },

  permissions: {
    hasPermission: vi.fn(),
    getPermissionError: vi.fn(),
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
    constructor() {
      this.user = { id: 'bot-user-id', tag: 'Bot#0001' };
      this.guilds = { cache: { size: 2 } };
      this.ws = { ping: 12 };
      this.commands = null;
      this.login = vi.fn().mockResolvedValue('logged-in');
      this.destroy = vi.fn();
      mocks.client = this;
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
}));

vi.mock('../src/modules/ai.js', () => ({
  getConversationHistory: mocks.ai.getConversationHistory,
  setConversationHistory: mocks.ai.setConversationHistory,
}));

vi.mock('../src/modules/config.js', () => ({
  loadConfig: mocks.config.loadConfig,
}));

vi.mock('../src/modules/events.js', () => ({
  registerEventHandlers: mocks.events.registerEventHandlers,
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

async function importIndex({
  token = 'test-token',
  databaseUrl = 'postgres://db',
  stateFile = false,
  stateRaw = null,
  readdirFiles = [],
  loadConfigReject = null,
  throwOnExit = true,
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

  mocks.db.initDb.mockReset().mockResolvedValue(undefined);
  mocks.db.closeDb.mockReset().mockResolvedValue(undefined);

  mocks.ai.getConversationHistory.mockReset().mockReturnValue(new Map());
  mocks.ai.setConversationHistory.mockReset();

  mocks.config.loadConfig.mockReset().mockImplementation(() => {
    if (loadConfigReject) {
      return Promise.reject(loadConfigReject);
    }
    return Promise.resolve({
      ai: { enabled: true, channels: [] },
      welcome: { enabled: true, channelId: 'welcome-ch' },
      moderation: { enabled: true },
      permissions: { enabled: false, usePermissions: false },
    });
  });

  mocks.events.registerEventHandlers.mockReset();
  mocks.health.getInstance.mockReset().mockReturnValue({});
  mocks.permissions.hasPermission.mockReset().mockReturnValue(true);
  mocks.permissions.getPermissionError.mockReset().mockReturnValue('nope');
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
  // Pragmatic workaround: settle async microtasks from startup().
  // The 3 hops (2x Promise.resolve + 1x setImmediate) are coupled to
  // the current async hop count in startup(). If startup() gains more
  // awaits, this settling sequence may need to be extended.
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
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

  it('should exit when DISCORD_TOKEN is missing', async () => {
    await expect(importIndex({ token: null, databaseUrl: null })).rejects.toThrow('process.exit:1');
    expect(mocks.logger.error).toHaveBeenCalledWith('DISCORD_TOKEN not set');
  });

  it('should initialize startup with database when DATABASE_URL is set', async () => {
    await importIndex({ token: 'abc', databaseUrl: 'postgres://db' });

    expect(mocks.db.initDb).toHaveBeenCalled();
    expect(mocks.config.loadConfig).toHaveBeenCalled();
    expect(mocks.events.registerEventHandlers).toHaveBeenCalled();
    expect(mocks.client.login).toHaveBeenCalledWith('abc');
  });

  it('should warn and skip db init when DATABASE_URL is not set', async () => {
    await importIndex({ token: 'abc', databaseUrl: null });

    expect(mocks.db.initDb).not.toHaveBeenCalled();
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      'DATABASE_URL not set — using config.json only (no persistence)',
    );
    expect(mocks.client.login).toHaveBeenCalledWith('abc');
  });

  it('should load state from disk when state file exists', async () => {
    await importIndex({ token: 'abc', databaseUrl: null, stateFile: true });
    expect(mocks.ai.setConversationHistory).toHaveBeenCalled();
  });

  it('should export pending request helpers', async () => {
    const mod = await importIndex({ token: 'abc', databaseUrl: null });

    const requestId = mod.registerPendingRequest();
    expect(typeof requestId).toBe('symbol');

    // should not throw
    mod.removePendingRequest(requestId);
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

  it('should log unhandledRejection events', async () => {
    await importIndex({ token: 'abc', databaseUrl: null });

    mocks.processHandlers.unhandledRejection(new Error('rejected'));

    expect(mocks.logger.error).toHaveBeenCalledWith('Unhandled promise rejection', {
      error: 'rejected',
      stack: expect.any(String),
      type: 'object',
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
});
