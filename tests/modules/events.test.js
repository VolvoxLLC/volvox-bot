import { afterEach, describe, expect, it, vi } from 'vitest';

// ── Mocks (must be before imports) ──────────────────────────────────────────
vi.mock('../../src/utils/safeSend.js', () => ({
  safeSend: (ch, opts) => ch.send(opts),
  safeReply: (t, opts) => t.reply(opts),
  safeFollowUp: (t, opts) => t.followUp(opts),
  safeEditReply: (t, opts) => t.editReply(opts),
}));
vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('../../src/modules/triage.js', () => ({
  accumulateMessage: vi.fn(),
  evaluateNow: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/modules/spam.js', () => ({
  isSpam: vi.fn().mockReturnValue(false),
  sendSpamAlert: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/modules/welcome.js', () => ({
  sendWelcomeMessage: vi.fn().mockResolvedValue(undefined),
  recordCommunityActivity: vi.fn(),
}));
vi.mock('../../src/utils/errors.js', () => ({
  getUserFriendlyMessage: vi.fn().mockReturnValue('Something went wrong. Try again!'),
}));

// Mock config module — getConfig returns per-guild config
vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({}),
}));

import { getConfig } from '../../src/modules/config.js';
import {
  registerErrorHandlers,
  registerEventHandlers,
  registerGuildMemberAddHandler,
  registerMessageCreateHandler,
  registerReadyHandler,
} from '../../src/modules/events.js';
import { isSpam, sendSpamAlert } from '../../src/modules/spam.js';
import { accumulateMessage, evaluateNow } from '../../src/modules/triage.js';
import { recordCommunityActivity, sendWelcomeMessage } from '../../src/modules/welcome.js';
import { getUserFriendlyMessage } from '../../src/utils/errors.js';

// ── Tests ───────────────────────────────────────────────────────────────────

describe('events module', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── registerReadyHandler ──────────────────────────────────────────────

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

  // ── registerGuildMemberAddHandler ─────────────────────────────────────

  describe('registerGuildMemberAddHandler', () => {
    it('should register guildMemberAdd handler', () => {
      const on = vi.fn();
      const client = { on };
      const config = {};

      registerGuildMemberAddHandler(client, config);
      expect(on).toHaveBeenCalledWith('guildMemberAdd', expect.any(Function));
    });

    it('should call sendWelcomeMessage on member add with per-guild config', async () => {
      const on = vi.fn();
      const client = { on };
      const config = {};
      const guildConfig = { welcome: { enabled: true } };
      getConfig.mockReturnValue(guildConfig);

      registerGuildMemberAddHandler(client, config);
      const callback = on.mock.calls[0][1];
      const member = { user: { tag: 'User#1234' }, guild: { id: 'guild-123' } };
      await callback(member);

      expect(getConfig).toHaveBeenCalledWith('guild-123');
      expect(sendWelcomeMessage).toHaveBeenCalledWith(member, client, guildConfig);
    });
  });

  // ── registerMessageCreateHandler ──────────────────────────────────────

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

      // Wire getConfig mock to return the test config for any guild
      getConfig.mockReturnValue(config);

      registerMessageCreateHandler(client, config, null);
    }

    // ── Bot/DM filtering ──────────────────────────────────────────────

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

    // ── Spam detection ────────────────────────────────────────────────

    it('should detect and alert spam before triage', async () => {
      setup();
      isSpam.mockReturnValueOnce(true);
      const message = {
        author: { bot: false, id: 'spammer-id', tag: 'spammer#1234' },
        guild: { id: 'g1' },
        content: 'spam content',
        channel: { id: 'c1' },
      };
      await onCallbacks.messageCreate(message);
      expect(sendSpamAlert).toHaveBeenCalledWith(message, client, config);
      expect(accumulateMessage).not.toHaveBeenCalled();
    });

    // ── Community activity ────────────────────────────────────────────

    it('should record community activity for all non-bot non-spam messages', async () => {
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

    // ── @mention routing ──────────────────────────────────────────────

    it('should call accumulateMessage then evaluateNow on @mention', async () => {
      setup();
      const message = {
        author: { bot: false, username: 'user', id: 'author-1' },
        guild: { id: 'g1' },
        content: '<@bot-user-id> hello',
        channel: {
          id: 'c1',
          sendTyping: vi.fn().mockResolvedValue(undefined),
          send: vi.fn(),
          isThread: vi.fn().mockReturnValue(false),
        },
        mentions: { has: vi.fn().mockReturnValue(true), repliedUser: null },
        reference: null,
        reply: vi.fn().mockResolvedValue(undefined),
      };
      await onCallbacks.messageCreate(message);

      expect(accumulateMessage).toHaveBeenCalledWith(message, config);
      expect(evaluateNow).toHaveBeenCalledWith('c1', config, client, null);
    });

    // ── Reply to bot ──────────────────────────────────────────────────

    it('should call accumulateMessage then evaluateNow on reply to bot', async () => {
      setup();
      const message = {
        author: { bot: false, username: 'user', id: 'author-1' },
        guild: { id: 'g1' },
        content: 'follow up',
        channel: {
          id: 'c1',
          sendTyping: vi.fn().mockResolvedValue(undefined),
          send: vi.fn(),
          isThread: vi.fn().mockReturnValue(false),
        },
        mentions: { has: vi.fn().mockReturnValue(false), repliedUser: { id: 'bot-user-id' } },
        reference: { messageId: 'ref-123' },
        reply: vi.fn().mockResolvedValue(undefined),
      };
      await onCallbacks.messageCreate(message);

      expect(accumulateMessage).toHaveBeenCalledWith(message, config);
      expect(evaluateNow).toHaveBeenCalledWith('c1', config, client, null);
    });

    // ── Empty mention ─────────────────────────────────────────────────

    it('should return "Hey! What\'s up?" for empty mention', async () => {
      setup();
      const mockReply = vi.fn().mockResolvedValue(undefined);
      const message = {
        author: { bot: false, username: 'user' },
        guild: { id: 'g1' },
        content: '<@bot-user-id>',
        channel: {
          id: 'c1',
          sendTyping: vi.fn(),
          send: vi.fn(),
          isThread: vi.fn().mockReturnValue(false),
        },
        mentions: { has: vi.fn().mockReturnValue(true), repliedUser: null },
        reference: null,
        reply: mockReply,
      };
      await onCallbacks.messageCreate(message);
      expect(mockReply).toHaveBeenCalledWith("Hey! What's up?");
      expect(evaluateNow).not.toHaveBeenCalled();
    });

    // ── Allowed channels ──────────────────────────────────────────────

    it('should respect channel allowlist', async () => {
      setup({ ai: { enabled: true, channels: ['allowed-ch'] } });
      const message = {
        author: { bot: false, username: 'user' },
        guild: { id: 'g1' },
        content: '<@bot-user-id> hello',
        channel: {
          id: 'not-allowed-ch',
          sendTyping: vi.fn(),
          send: vi.fn(),
          isThread: vi.fn().mockReturnValue(false),
        },
        mentions: { has: vi.fn().mockReturnValue(true), repliedUser: null },
        reference: null,
        reply: vi.fn(),
      };
      await onCallbacks.messageCreate(message);
      expect(evaluateNow).not.toHaveBeenCalled();
    });

    // ── Thread parent allowlist ───────────────────────────────────────

    it('should allow thread messages when parent channel is in allowlist', async () => {
      setup({ ai: { enabled: true, channels: ['allowed-ch'] } });
      const message = {
        author: { bot: false, username: 'user', id: 'author-1' },
        guild: { id: 'g1' },
        content: '<@bot-user-id> hello from thread',
        channel: {
          id: 'thread-id-999',
          parentId: 'allowed-ch',
          sendTyping: vi.fn().mockResolvedValue(undefined),
          send: vi.fn(),
          isThread: vi.fn().mockReturnValue(true),
        },
        mentions: { has: vi.fn().mockReturnValue(true), repliedUser: null },
        reference: null,
        reply: vi.fn().mockResolvedValue(undefined),
      };
      await onCallbacks.messageCreate(message);
      expect(accumulateMessage).toHaveBeenCalledWith(message, config);
      expect(evaluateNow).toHaveBeenCalledWith('thread-id-999', config, client, null);
    });

    it('should block thread messages when parent channel is NOT in allowlist', async () => {
      setup({ ai: { enabled: true, channels: ['allowed-ch'] } });
      const message = {
        author: { bot: false, username: 'user' },
        guild: { id: 'g1' },
        content: '<@bot-user-id> hello from thread',
        channel: {
          id: 'thread-id-999',
          parentId: 'some-other-ch',
          sendTyping: vi.fn(),
          send: vi.fn(),
          isThread: vi.fn().mockReturnValue(true),
        },
        mentions: { has: vi.fn().mockReturnValue(true), repliedUser: null },
        reference: null,
        reply: vi.fn(),
      };
      await onCallbacks.messageCreate(message);
      expect(evaluateNow).not.toHaveBeenCalled();
    });

    // ── Non-mention ───────────────────────────────────────────────────

    it('should call accumulateMessage only (not evaluateNow) for non-mention', async () => {
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
      expect(accumulateMessage).toHaveBeenCalledWith(message, config);
      expect(evaluateNow).not.toHaveBeenCalled();
    });

    // ── Error handling ────────────────────────────────────────────────

    it('should send fallback error message when evaluateNow fails', async () => {
      setup();
      evaluateNow.mockRejectedValueOnce(new Error('triage failed'));
      const mockReply = vi.fn().mockResolvedValue(undefined);
      const message = {
        author: { bot: false, username: 'user', id: 'author-1' },
        guild: { id: 'g1' },
        content: '<@bot-user-id> hello',
        channel: {
          id: 'c1',
          sendTyping: vi.fn().mockResolvedValue(undefined),
          send: vi.fn(),
          isThread: vi.fn().mockReturnValue(false),
        },
        mentions: { has: vi.fn().mockReturnValue(true), repliedUser: null },
        reference: null,
        reply: mockReply,
      };
      await onCallbacks.messageCreate(message);

      expect(getUserFriendlyMessage).toHaveBeenCalled();
      expect(mockReply).toHaveBeenCalledWith('Something went wrong. Try again!');
    });

    it('should handle accumulateMessage error gracefully for non-mention', async () => {
      setup();
      accumulateMessage.mockImplementationOnce(() => {
        throw new Error('accumulate failed');
      });
      const message = {
        author: { bot: false, username: 'user' },
        guild: { id: 'g1' },
        content: 'regular message',
        channel: { id: 'c1', sendTyping: vi.fn(), send: vi.fn() },
        mentions: { has: vi.fn().mockReturnValue(false), repliedUser: null },
        reference: null,
      };
      // Should not throw
      await onCallbacks.messageCreate(message);
    });
  });

  // ── registerErrorHandlers ─────────────────────────────────────────────

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

  // ── registerEventHandlers ─────────────────────────────────────────────

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
