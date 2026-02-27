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
vi.mock('../../src/modules/starboard.js', () => ({
  handleReactionAdd: vi.fn().mockResolvedValue(undefined),
  handleReactionRemove: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/modules/pollHandler.js', () => ({
  handlePollVote: vi.fn().mockResolvedValue(undefined),
  createPoll: vi.fn(),
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
  registerPollButtonHandler,
  registerReactionHandlers,
  registerReadyHandler,
} from '../../src/modules/events.js';
import { isSpam, sendSpamAlert } from '../../src/modules/spam.js';
import { handleReactionAdd, handleReactionRemove } from '../../src/modules/starboard.js';
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

    it('should call sendTyping, accumulateMessage, then evaluateNow on @mention', async () => {
      setup();
      const sendTyping = vi.fn().mockResolvedValue(undefined);
      const message = {
        author: { bot: false, username: 'user', id: 'author-1' },
        guild: { id: 'g1' },
        content: '<@bot-user-id> hello',
        channel: {
          id: 'c1',
          sendTyping,
          send: vi.fn(),
          isThread: vi.fn().mockReturnValue(false),
        },
        mentions: { has: vi.fn().mockReturnValue(true), repliedUser: null },
        reference: null,
        reply: vi.fn().mockResolvedValue(undefined),
      };
      await onCallbacks.messageCreate(message);

      expect(sendTyping).toHaveBeenCalled();
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

    it('should route bare mention to triage instead of canned reply', async () => {
      setup();
      const message = {
        author: { bot: false, username: 'user', id: 'u1' },
        guild: { id: 'g1' },
        content: '<@bot-user-id>',
        channel: {
          id: 'c1',
          sendTyping: vi.fn().mockResolvedValue(undefined),
          send: vi.fn(),
          isThread: vi.fn().mockReturnValue(false),
        },
        mentions: { has: vi.fn().mockReturnValue(true), repliedUser: null },
        reference: null,
        reply: vi.fn(),
      };
      await onCallbacks.messageCreate(message);
      expect(accumulateMessage).toHaveBeenCalledWith(message, expect.anything());
      expect(evaluateNow).toHaveBeenCalledWith('c1', config, client, null);
      expect(message.reply).not.toHaveBeenCalled();
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
      // Message should still be accumulated via the generic path
      expect(accumulateMessage).toHaveBeenCalled();
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

  // ── registerReactionHandlers ───────────────────────────────────────────

  describe('registerReactionHandlers', () => {
    let onCallbacks;
    let client;

    function setup(configOverrides = {}) {
      onCallbacks = {};
      client = {
        on: vi.fn((event, cb) => {
          // Support multiple handlers per event
          if (!onCallbacks[event]) onCallbacks[event] = [];
          onCallbacks[event].push(cb);
        }),
      };
      getConfig.mockReturnValue({
        starboard: { enabled: true, channelId: 'sb-ch', threshold: 3, emoji: '⭐' },
        ...configOverrides,
      });
      registerReactionHandlers(client, {});
    }

    it('should register messageReactionAdd and messageReactionRemove', () => {
      setup();
      const events = client.on.mock.calls.map((c) => c[0]);
      expect(events).toContain('messageReactionAdd');
      expect(events).toContain('messageReactionRemove');
    });

    it('should ignore bot reactions', async () => {
      setup();
      const addCb = onCallbacks.messageReactionAdd[0];
      const reaction = { message: { guild: { id: 'g1' }, partial: false } };
      await addCb(reaction, { bot: true, id: 'bot-1' });
      expect(handleReactionAdd).not.toHaveBeenCalled();
    });

    it('should skip when starboard is not enabled', async () => {
      setup();
      getConfig.mockReturnValue({ starboard: { enabled: false } });
      const addCb = onCallbacks.messageReactionAdd[0];
      const reaction = { message: { guild: { id: 'g1' }, partial: false } };
      await addCb(reaction, { bot: false, id: 'user-1' });
      expect(handleReactionAdd).not.toHaveBeenCalled();
    });

    it('should call handleReactionAdd when starboard is enabled', async () => {
      setup();
      const addCb = onCallbacks.messageReactionAdd[0];
      const reaction = { message: { guild: { id: 'g1' }, partial: false } };
      await addCb(reaction, { bot: false, id: 'user-1' });
      expect(handleReactionAdd).toHaveBeenCalledWith(
        reaction,
        { bot: false, id: 'user-1' },
        client,
        expect.objectContaining({ starboard: expect.any(Object) }),
      );
    });

    it('should call handleReactionRemove on reaction remove', async () => {
      setup();
      const removeCb = onCallbacks.messageReactionRemove[0];
      const reaction = { message: { guild: { id: 'g1' }, partial: false } };
      await removeCb(reaction, { bot: false, id: 'user-1' });
      expect(handleReactionRemove).toHaveBeenCalledWith(
        reaction,
        { bot: false, id: 'user-1' },
        client,
        expect.objectContaining({ starboard: expect.any(Object) }),
      );
    });

    it('should handle errors in handleReactionAdd gracefully', async () => {
      setup();
      handleReactionAdd.mockRejectedValueOnce(new Error('starboard boom'));
      const addCb = onCallbacks.messageReactionAdd[0];
      const reaction = { message: { guild: { id: 'g1' }, id: 'msg-1', partial: false } };
      // Should not throw
      await addCb(reaction, { bot: false, id: 'user-1' });
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

  // ── registerPollButtonHandler ──────────────────────────────────────────

  describe('registerPollButtonHandler', () => {
    it('should ignore non-button interactions', async () => {
      const { handlePollVote } = await import('../../src/modules/pollHandler.js');
      const handlers = new Map();
      const client = { on: (event, fn) => handlers.set(event, fn) };

      registerPollButtonHandler(client);
      const handler = handlers.get('interactionCreate');

      // Non-button interaction → early return
      const interaction = { isButton: () => false };
      await handler(interaction);

      expect(handlePollVote).not.toHaveBeenCalled();
    });

    it('should ignore buttons with wrong customId prefix', async () => {
      const { handlePollVote } = await import('../../src/modules/pollHandler.js');
      const handlers = new Map();
      const client = { on: (event, fn) => handlers.set(event, fn) };

      registerPollButtonHandler(client);
      const handler = handlers.get('interactionCreate');

      const interaction = {
        isButton: () => true,
        customId: 'other_button_id',
      };
      await handler(interaction);

      expect(handlePollVote).not.toHaveBeenCalled();
    });

    it('should call handlePollVote for poll_vote_ interactions', async () => {
      const { handlePollVote } = await import('../../src/modules/pollHandler.js');
      const handlers = new Map();
      const client = { on: (event, fn) => handlers.set(event, fn) };

      registerPollButtonHandler(client);
      const handler = handlers.get('interactionCreate');

      const interaction = {
        isButton: () => true,
        customId: 'poll_vote_opt1',
        user: { id: 'u1' },
      };
      await handler(interaction);

      expect(handlePollVote).toHaveBeenCalledWith(interaction);
    });

    it('should handle errors from handlePollVote and reply with error message', async () => {
      const { handlePollVote } = await import('../../src/modules/pollHandler.js');
      handlePollVote.mockRejectedValueOnce(new Error('Vote failed'));

      const handlers = new Map();
      const client = { on: (event, fn) => handlers.set(event, fn) };

      registerPollButtonHandler(client);
      const handler = handlers.get('interactionCreate');

      const reply = vi.fn().mockResolvedValue(undefined);
      const interaction = {
        isButton: () => true,
        customId: 'poll_vote_opt1',
        user: { id: 'u1' },
        replied: false,
        deferred: false,
        reply,
      };
      await handler(interaction);

      expect(reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
    });

    it('should skip reply when already replied after handlePollVote error', async () => {
      const { handlePollVote } = await import('../../src/modules/pollHandler.js');
      handlePollVote.mockRejectedValueOnce(new Error('Vote failed'));

      const handlers = new Map();
      const client = { on: (event, fn) => handlers.set(event, fn) };

      registerPollButtonHandler(client);
      const handler = handlers.get('interactionCreate');

      const reply = vi.fn();
      const interaction = {
        isButton: () => true,
        customId: 'poll_vote_opt1',
        user: { id: 'u1' },
        replied: true, // already replied
        deferred: false,
        reply,
      };
      await handler(interaction);

      expect(reply).not.toHaveBeenCalled();
    });

    it('should catch inner safeReply errors gracefully', async () => {
      const { handlePollVote } = await import('../../src/modules/pollHandler.js');
      handlePollVote.mockRejectedValueOnce(new Error('Vote failed'));

      const handlers = new Map();
      const client = { on: (event, fn) => handlers.set(event, fn) };

      registerPollButtonHandler(client);
      const handler = handlers.get('interactionCreate');

      const interaction = {
        isButton: () => true,
        customId: 'poll_vote_opt1',
        user: { id: 'u1' },
        replied: false,
        deferred: false,
        reply: vi.fn().mockRejectedValueOnce(new Error('reply also failed')),
      };
      // Should not throw
      await expect(handler(interaction)).resolves.toBeUndefined();
    });
  });

  describe('registerReactionHandlers - handleReactionRemove error', () => {
    it('should catch errors from handleReactionRemove', async () => {
      const { handleReactionRemove } = await import('../../src/modules/starboard.js');
      handleReactionRemove.mockRejectedValueOnce(new Error('Reaction remove failed'));

      const handlers = new Map();
      const client = { on: (event, fn) => handlers.set(event, fn) };
      registerReactionHandlers(client);

      const handler = handlers.get('messageReactionRemove');
      const reaction = {
        message: { id: 'msg1', partial: false },
        partial: false,
        emoji: { name: '⭐' },
      };
      const user = { bot: false, id: 'u1', partial: false };

      await expect(handler(reaction, user)).resolves.toBeUndefined();
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
      expect(on).toHaveBeenCalledWith('messageReactionAdd', expect.any(Function));
      expect(on).toHaveBeenCalledWith('messageReactionRemove', expect.any(Function));
      expect(on).toHaveBeenCalledWith('error', expect.any(Function));

      processOnSpy.mockRestore();
    });
  });
});
