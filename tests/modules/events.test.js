import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

// Mock ai module
vi.mock('../../src/modules/ai.js', () => ({
  generateResponse: vi.fn().mockResolvedValue('AI response'),
}));

// Mock chimeIn module
vi.mock('../../src/modules/chimeIn.js', () => ({
  accumulate: vi.fn().mockResolvedValue(undefined),
  resetCounter: vi.fn(),
}));

// Mock spam module
vi.mock('../../src/modules/spam.js', () => ({
  isSpam: vi.fn().mockReturnValue(false),
  sendSpamAlert: vi.fn().mockResolvedValue(undefined),
}));

// Mock welcome module
vi.mock('../../src/modules/welcome.js', () => ({
  sendWelcomeMessage: vi.fn().mockResolvedValue(undefined),
  recordCommunityActivity: vi.fn(),
}));

// Mock splitMessage
vi.mock('../../src/utils/splitMessage.js', () => ({
  needsSplitting: vi.fn().mockReturnValue(false),
  splitMessage: vi.fn().mockReturnValue(['chunk1', 'chunk2']),
}));

import { generateResponse } from '../../src/modules/ai.js';
import { accumulate, resetCounter } from '../../src/modules/chimeIn.js';
import {
  registerErrorHandlers,
  registerEventHandlers,
  registerGuildMemberAddHandler,
  registerMessageCreateHandler,
  registerReadyHandler,
} from '../../src/modules/events.js';
import { isSpam, sendSpamAlert } from '../../src/modules/spam.js';
import { recordCommunityActivity, sendWelcomeMessage } from '../../src/modules/welcome.js';
import { needsSplitting, splitMessage } from '../../src/utils/splitMessage.js';

describe('events module', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('registerReadyHandler', () => {
    it('should register clientReady event', () => {
      const once = vi.fn();
      const client = {
        once,
        user: { tag: 'Bot#1234' },
        guilds: { cache: { size: 5 } },
      };
      const config = {
        welcome: { enabled: true, channelId: 'ch1' },
        ai: { enabled: true },
        moderation: { enabled: true },
      };

      registerReadyHandler(client, config, null);
      expect(once).toHaveBeenCalledWith('clientReady', expect.any(Function));

      // Trigger the callback
      const callback = once.mock.calls[0][1];
      callback();
    });

    it('should record start if healthMonitor provided', () => {
      const once = vi.fn();
      const client = {
        once,
        user: { tag: 'Bot#1234' },
        guilds: { cache: { size: 1 } },
      };
      const config = {};
      const healthMonitor = { recordStart: vi.fn() };

      registerReadyHandler(client, config, healthMonitor);
      const callback = once.mock.calls[0][1];
      callback();

      expect(healthMonitor.recordStart).toHaveBeenCalled();
    });
  });

  describe('registerGuildMemberAddHandler', () => {
    it('should register guildMemberAdd handler', () => {
      const on = vi.fn();
      const client = { on };
      const config = {};

      registerGuildMemberAddHandler(client, config);
      expect(on).toHaveBeenCalledWith('guildMemberAdd', expect.any(Function));
    });

    it('should call sendWelcomeMessage on member add', async () => {
      const on = vi.fn();
      const client = { on };
      const config = {};

      registerGuildMemberAddHandler(client, config);
      const callback = on.mock.calls[0][1];
      const member = { user: { tag: 'User#1234' } };
      await callback(member);

      expect(sendWelcomeMessage).toHaveBeenCalledWith(member, client, config);
    });
  });

  describe('registerMessageCreateHandler', () => {
    let onCallbacks;
    let client;
    let config;

    function setup(configOverrides = {}) {
      onCallbacks = {};
      client = {
        on: vi.fn((event, cb) => {
          onCallbacks[event] = cb;
        }),
        user: { id: 'bot-user-id' },
      };
      config = {
        ai: { enabled: true, channels: [] },
        moderation: { enabled: true },
        ...configOverrides,
      };

      registerMessageCreateHandler(client, config, null);
    }

    it('should ignore bot messages', async () => {
      setup();
      const message = { author: { bot: true }, guild: { id: 'g1' } };
      await onCallbacks.messageCreate(message);
      expect(isSpam).not.toHaveBeenCalled();
    });

    it('should ignore DMs', async () => {
      setup();
      const message = { author: { bot: false }, guild: null };
      await onCallbacks.messageCreate(message);
      expect(isSpam).not.toHaveBeenCalled();
    });

    it('should detect and alert spam', async () => {
      setup();
      isSpam.mockReturnValueOnce(true);
      const message = {
        author: { bot: false, tag: 'spammer#1234' },
        guild: { id: 'g1' },
        content: 'spam content',
        channel: { id: 'c1' },
      };
      await onCallbacks.messageCreate(message);
      expect(sendSpamAlert).toHaveBeenCalledWith(message, client, config);
    });

    it('should respond when bot is mentioned', async () => {
      setup();
      const mockReply = vi.fn().mockResolvedValue(undefined);
      const mockSendTyping = vi.fn().mockResolvedValue(undefined);
      const message = {
        author: { bot: false, username: 'user' },
        guild: { id: 'g1' },
        content: `<@bot-user-id> hello`,
        channel: { id: 'c1', sendTyping: mockSendTyping, send: vi.fn() },
        mentions: { has: vi.fn().mockReturnValue(true), repliedUser: null },
        reference: null,
        reply: mockReply,
      };
      await onCallbacks.messageCreate(message);
      expect(resetCounter).toHaveBeenCalledWith('c1');
      expect(mockReply).toHaveBeenCalledWith('AI response');
    });

    it('should respond to replies to bot', async () => {
      setup();
      const mockReply = vi.fn().mockResolvedValue(undefined);
      const mockSendTyping = vi.fn().mockResolvedValue(undefined);
      const message = {
        author: { bot: false, username: 'user' },
        guild: { id: 'g1' },
        content: 'follow up',
        channel: { id: 'c1', sendTyping: mockSendTyping, send: vi.fn() },
        mentions: { has: vi.fn().mockReturnValue(false), repliedUser: { id: 'bot-user-id' } },
        reference: { messageId: 'ref-123' },
        reply: mockReply,
      };
      await onCallbacks.messageCreate(message);
      expect(mockReply).toHaveBeenCalled();
    });

    it('should handle empty mention content', async () => {
      setup();
      const mockReply = vi.fn().mockResolvedValue(undefined);
      const message = {
        author: { bot: false, username: 'user' },
        guild: { id: 'g1' },
        content: `<@bot-user-id>`,
        channel: { id: 'c1', sendTyping: vi.fn(), send: vi.fn() },
        mentions: { has: vi.fn().mockReturnValue(true), repliedUser: null },
        reference: null,
        reply: mockReply,
      };
      await onCallbacks.messageCreate(message);
      expect(mockReply).toHaveBeenCalledWith("Hey! What's up?");
    });

    it('should split long AI responses', async () => {
      setup();
      needsSplitting.mockReturnValueOnce(true);
      splitMessage.mockReturnValueOnce(['chunk1', 'chunk2']);
      const mockSend = vi.fn().mockResolvedValue(undefined);
      const message = {
        author: { bot: false, username: 'user' },
        guild: { id: 'g1' },
        content: `<@bot-user-id> tell me a story`,
        channel: { id: 'c1', sendTyping: vi.fn(), send: mockSend },
        mentions: { has: vi.fn().mockReturnValue(true), repliedUser: null },
        reference: null,
        reply: vi.fn(),
      };
      await onCallbacks.messageCreate(message);
      expect(mockSend).toHaveBeenCalledWith('chunk1');
      expect(mockSend).toHaveBeenCalledWith('chunk2');
    });

    it('should respect allowed channels', async () => {
      setup({ ai: { enabled: true, channels: ['allowed-ch'] } });
      const mockReply = vi.fn();
      const message = {
        author: { bot: false, username: 'user' },
        guild: { id: 'g1' },
        content: '<@bot-user-id> hello',
        channel: { id: 'not-allowed-ch', sendTyping: vi.fn(), send: vi.fn() },
        mentions: { has: vi.fn().mockReturnValue(true), repliedUser: null },
        reference: null,
        reply: mockReply,
      };
      await onCallbacks.messageCreate(message);
      // Should NOT respond (channel not in allowed list)
      expect(generateResponse).not.toHaveBeenCalled();
    });

    it('should accumulate messages for chimeIn', async () => {
      setup({ ai: { enabled: false } });
      const message = {
        author: { bot: false, username: 'user' },
        guild: { id: 'g1' },
        content: 'regular message',
        channel: { id: 'c1', sendTyping: vi.fn(), send: vi.fn() },
        mentions: { has: vi.fn().mockReturnValue(false), repliedUser: null },
        reference: null,
      };
      await onCallbacks.messageCreate(message);
      expect(accumulate).toHaveBeenCalledWith(message, config);
    });

    it('should record community activity', async () => {
      setup();
      const message = {
        author: { bot: false, username: 'user' },
        guild: { id: 'g1' },
        content: 'regular message',
        channel: { id: 'c1', sendTyping: vi.fn(), send: vi.fn() },
        mentions: { has: vi.fn().mockReturnValue(false), repliedUser: null },
        reference: null,
      };
      await onCallbacks.messageCreate(message);
      expect(recordCommunityActivity).toHaveBeenCalledWith(message, config);
    });
  });

  describe('registerErrorHandlers', () => {
    it('should register error and unhandledRejection handlers', () => {
      const on = vi.fn();
      const client = { on };

      const processOnSpy = vi.spyOn(process, 'on').mockImplementation(() => process);

      registerErrorHandlers(client);

      expect(on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));

      // Trigger handlers to cover the logging code
      const errorCallback = on.mock.calls[0][1];
      errorCallback(new Error('test error'));

      const rejectionCallback = processOnSpy.mock.calls.find(
        (call) => call[0] === 'unhandledRejection',
      )[1];
      rejectionCallback(new Error('rejection'));

      processOnSpy.mockRestore();
    });
  });

  describe('registerEventHandlers', () => {
    it('should register all handlers', () => {
      const once = vi.fn();
      const on = vi.fn();
      const client = {
        once,
        on,
        user: { id: 'bot', tag: 'Bot#1234' },
        guilds: { cache: { size: 1 } },
      };
      const config = {};

      const processOnSpy = vi.spyOn(process, 'on').mockImplementation(() => process);

      registerEventHandlers(client, config, null);

      expect(once).toHaveBeenCalledWith('clientReady', expect.any(Function));
      expect(on).toHaveBeenCalledWith('guildMemberAdd', expect.any(Function));
      expect(on).toHaveBeenCalledWith('messageCreate', expect.any(Function));
      expect(on).toHaveBeenCalledWith('error', expect.any(Function));

      processOnSpy.mockRestore();
    });
  });
});
