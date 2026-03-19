/**
 * Additional tests for src/modules/events.js — handler branches not covered by events.test.js.
 * Covers: registerReviewClaimHandler, registerShowcaseButtonHandler, registerShowcaseModalHandler,
 * registerChallengeButtonHandler, plus edge-case branches in existing handlers.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────
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
vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({}),
}));
vi.mock('../../src/modules/reviewHandler.js', () => ({
  handleReviewClaim: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/commands/showcase.js', () => ({
  handleShowcaseUpvote: vi.fn().mockResolvedValue(undefined),
  handleShowcaseModalSubmit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/modules/challengeScheduler.js', () => ({
  handleSolveButton: vi.fn().mockResolvedValue(undefined),
  handleHintButton: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/db.js', () => ({
  getPool: vi.fn().mockReturnValue({ query: vi.fn() }),
}));
vi.mock('../../src/modules/engagement.js', () => ({
  trackMessage: vi.fn().mockResolvedValue(undefined),
  trackReaction: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/modules/linkFilter.js', () => ({
  checkLinks: vi.fn().mockResolvedValue({ blocked: false }),
}));
vi.mock('../../src/modules/rateLimit.js', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ limited: false }),
}));
vi.mock('../../src/modules/reputation.js', () => ({
  handleXpGain: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/modules/afkHandler.js', () => ({
  handleAfkMentions: vi.fn().mockResolvedValue(undefined),
}));

import { handleShowcaseModalSubmit, handleShowcaseUpvote } from '../../src/commands/showcase.js';
import { handleAfkMentions } from '../../src/modules/afkHandler.js';
import { handleHintButton, handleSolveButton } from '../../src/modules/challengeScheduler.js';
import { getConfig } from '../../src/modules/config.js';
import {
  registerMessageCreateHandler,
  registerReactionHandlers,
  registerReadyHandler,
} from '../../src/modules/events.js';
import { handleChallengeButton } from '../../src/modules/handlers/challengeHandler.js';
import { handleReviewButton } from '../../src/modules/handlers/reviewHandler.js';
import {
  handleShowcaseButton,
  handleShowcaseModal,
} from '../../src/modules/handlers/showcaseHandler.js';
import { checkLinks } from '../../src/modules/linkFilter.js';
import { checkRateLimit } from '../../src/modules/rateLimit.js';
import { handleReviewClaim } from '../../src/modules/reviewHandler.js';
import { handleReactionAdd, handleReactionRemove } from '../../src/modules/starboard.js';
import { accumulateMessage, evaluateNow } from '../../src/modules/triage.js';
import { recordCommunityActivity } from '../../src/modules/welcome.js';

afterEach(() => {
  vi.clearAllMocks();
});

// ── handleReviewButton ───────────────────────────────────────────────

describe('handleReviewButton', () => {
  it('should ignore non-button interactions', async () => {
    expect(await handleReviewButton({ isButton: () => false })).toBe(false);
    expect(handleReviewClaim).not.toHaveBeenCalled();
  });

  it('should ignore buttons with non-review customId', async () => {
    expect(await handleReviewButton({ isButton: () => true, customId: 'other' })).toBe(false);
    expect(handleReviewClaim).not.toHaveBeenCalled();
  });

  it('should skip when review feature is disabled', async () => {
    getConfig.mockReturnValue({ review: { enabled: false } });
    expect(
      await handleReviewButton({
        isButton: () => true,
        customId: 'review_claim_123',
        guildId: 'g1',
      }),
    ).toBe(true);
    expect(handleReviewClaim).not.toHaveBeenCalled();
  });

  it('should skip when review config is absent', async () => {
    getConfig.mockReturnValue({});
    expect(
      await handleReviewButton({
        isButton: () => true,
        customId: 'review_claim_123',
        guildId: 'g1',
      }),
    ).toBe(true);
    expect(handleReviewClaim).not.toHaveBeenCalled();
  });

  it('should call handleReviewClaim for review_claim_ buttons', async () => {
    getConfig.mockReturnValue({ review: { enabled: true } });
    const interaction = {
      isButton: () => true,
      customId: 'review_claim_123',
      guildId: 'g1',
      user: { id: 'u1' },
    };
    await handleReviewButton(interaction);
    expect(handleReviewClaim).toHaveBeenCalledWith(interaction);
  });

  it('should handle errors and reply with ephemeral error', async () => {
    getConfig.mockReturnValue({ review: { enabled: true } });
    handleReviewClaim.mockRejectedValueOnce(new Error('boom'));
    const reply = vi.fn().mockResolvedValue(undefined);
    await handleReviewButton({
      isButton: () => true,
      customId: 'review_claim_123',
      guildId: 'g1',
      user: { id: 'u1' },
      replied: false,
      deferred: false,
      reply,
    });
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });

  it('should skip reply when already replied', async () => {
    getConfig.mockReturnValue({ review: { enabled: true } });
    handleReviewClaim.mockRejectedValueOnce(new Error('boom'));
    const reply = vi.fn();
    await handleReviewButton({
      isButton: () => true,
      customId: 'review_claim_456',
      guildId: 'g1',
      user: { id: 'u1' },
      replied: true,
      deferred: false,
      reply,
    });
    expect(reply).not.toHaveBeenCalled();
  });

  it('should swallow inner safeReply error', async () => {
    getConfig.mockReturnValue({ review: { enabled: true } });
    handleReviewClaim.mockRejectedValueOnce(new Error('boom'));
    const reply = vi.fn().mockRejectedValue(new Error('reply also failed'));
    await expect(
      handleReviewButton({
        isButton: () => true,
        customId: 'review_claim_789',
        guildId: 'g1',
        user: { id: 'u1' },
        replied: false,
        deferred: false,
        reply,
      }),
    ).resolves.toBe(true);
  });
});

// ── handleShowcaseButton ─────────────────────────────────────────────

describe('handleShowcaseButton', () => {
  it('should ignore non-button interactions', async () => {
    expect(await handleShowcaseButton({ isButton: () => false })).toBe(false);
    expect(handleShowcaseUpvote).not.toHaveBeenCalled();
  });

  it('should ignore buttons with non-showcase customId', async () => {
    expect(await handleShowcaseButton({ isButton: () => true, customId: 'other' })).toBe(false);
    expect(handleShowcaseUpvote).not.toHaveBeenCalled();
  });

  it('should call handleShowcaseUpvote for showcase_upvote_ buttons', async () => {
    const interaction = {
      isButton: () => true,
      customId: 'showcase_upvote_abc',
      user: { id: 'u1' },
    };
    await handleShowcaseButton(interaction);
    expect(handleShowcaseUpvote).toHaveBeenCalledWith(interaction, expect.anything());
  });

  it('should handle upvote error and reply ephemerally', async () => {
    handleShowcaseUpvote.mockRejectedValueOnce(new Error('upvote boom'));
    const reply = vi.fn().mockResolvedValue(undefined);
    await handleShowcaseButton({
      isButton: () => true,
      customId: 'showcase_upvote_abc',
      user: { id: 'u1' },
      replied: false,
      deferred: false,
      reply,
    });
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });

  it('should skip error reply when already replied', async () => {
    handleShowcaseUpvote.mockRejectedValueOnce(new Error('boom'));
    const reply = vi.fn();
    await handleShowcaseButton({
      isButton: () => true,
      customId: 'showcase_upvote_abc',
      user: { id: 'u1' },
      replied: true,
      deferred: false,
      reply,
    });
    expect(reply).not.toHaveBeenCalled();
  });
});

// ── handleShowcaseModal ──────────────────────────────────────────────

describe('handleShowcaseModal', () => {
  it('should ignore non-modal interactions', async () => {
    expect(await handleShowcaseModal({ isModalSubmit: () => false })).toBe(false);
    expect(handleShowcaseModalSubmit).not.toHaveBeenCalled();
  });

  it('should ignore modals with wrong customId', async () => {
    expect(await handleShowcaseModal({ isModalSubmit: () => true, customId: 'other_modal' })).toBe(
      false,
    );
    expect(handleShowcaseModalSubmit).not.toHaveBeenCalled();
  });

  it('should call handleShowcaseModalSubmit for showcase_submit_modal', async () => {
    const interaction = {
      isModalSubmit: () => true,
      customId: 'showcase_submit_modal',
      deferred: false,
    };
    await handleShowcaseModal(interaction);
    expect(handleShowcaseModalSubmit).toHaveBeenCalledWith(interaction, expect.anything());
  });

  it('should handle error with safeReply when not deferred', async () => {
    handleShowcaseModalSubmit.mockRejectedValueOnce(new Error('modal boom'));
    const reply = vi.fn().mockResolvedValue(undefined);
    await handleShowcaseModal({
      isModalSubmit: () => true,
      customId: 'showcase_submit_modal',
      deferred: false,
      reply,
      editReply: vi.fn(),
    });
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('wrong') }),
    );
  });

  it('should handle error with safeEditReply when deferred', async () => {
    handleShowcaseModalSubmit.mockRejectedValueOnce(new Error('modal boom'));
    const editReply = vi.fn().mockResolvedValue(undefined);
    await handleShowcaseModal({
      isModalSubmit: () => true,
      customId: 'showcase_submit_modal',
      deferred: true,
      reply: vi.fn(),
      editReply,
    });
    expect(editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('wrong') }),
    );
  });
});

// ── handleChallengeButton ────────────────────────────────────────────

describe('handleChallengeButton', () => {
  it('should ignore non-button interactions', async () => {
    expect(await handleChallengeButton({ isButton: () => false })).toBe(false);
    expect(handleSolveButton).not.toHaveBeenCalled();
    expect(handleHintButton).not.toHaveBeenCalled();
  });

  it('should ignore buttons with unrelated customId', async () => {
    expect(await handleChallengeButton({ isButton: () => true, customId: 'other_button' })).toBe(
      false,
    );
    expect(handleSolveButton).not.toHaveBeenCalled();
  });

  it('should call handleSolveButton for challenge_solve_ buttons', async () => {
    getConfig.mockReturnValue({ challenges: { enabled: true } });
    const interaction = {
      isButton: () => true,
      customId: 'challenge_solve_5',
      user: { id: 'u1' },
      guildId: 'g1',
    };
    await handleChallengeButton(interaction);
    expect(handleSolveButton).toHaveBeenCalledWith(interaction, 5);
  });

  it('should call handleHintButton for challenge_hint_ buttons', async () => {
    getConfig.mockReturnValue({ challenges: { enabled: true } });
    const interaction = {
      isButton: () => true,
      customId: 'challenge_hint_3',
      user: { id: 'u1' },
      guildId: 'g1',
    };
    await handleChallengeButton(interaction);
    expect(handleHintButton).toHaveBeenCalledWith(interaction, 3);
  });

  it('should return true on NaN challenge index', async () => {
    getConfig.mockReturnValue({ challenges: { enabled: true } });
    expect(
      await handleChallengeButton({
        isButton: () => true,
        customId: 'challenge_solve_abc',
        user: { id: 'u1' },
        guildId: 'g1',
      }),
    ).toBe(true);
    expect(handleSolveButton).not.toHaveBeenCalled();
  });

  it('should handle solve error and reply ephemerally', async () => {
    getConfig.mockReturnValue({ challenges: { enabled: true } });
    handleSolveButton.mockRejectedValueOnce(new Error('solve boom'));
    const reply = vi.fn().mockResolvedValue(undefined);
    await handleChallengeButton({
      isButton: () => true,
      customId: 'challenge_solve_0',
      user: { id: 'u1' },
      guildId: 'g1',
      replied: false,
      deferred: false,
      reply,
    });
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });

  it('should handle hint error and reply ephemerally', async () => {
    getConfig.mockReturnValue({ challenges: { enabled: true } });
    handleHintButton.mockRejectedValueOnce(new Error('hint boom'));
    const reply = vi.fn().mockResolvedValue(undefined);
    await handleChallengeButton({
      isButton: () => true,
      customId: 'challenge_hint_2',
      user: { id: 'u1' },
      guildId: 'g1',
      replied: false,
      deferred: false,
      reply,
    });
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });

  it('should skip error reply when deferred', async () => {
    getConfig.mockReturnValue({ challenges: { enabled: true } });
    handleSolveButton.mockRejectedValueOnce(new Error('boom'));
    const reply = vi.fn();
    await handleChallengeButton({
      isButton: () => true,
      customId: 'challenge_solve_1',
      user: { id: 'u1' },
      guildId: 'g1',
      replied: false,
      deferred: true,
      reply,
    });
    expect(reply).not.toHaveBeenCalled();
  });
});

// ── registerReadyHandler — additional branches ─────────────────────

describe('registerReadyHandler — extra branches', () => {
  it('should log starboard info when starboard is enabled', () => {
    const once = vi.fn();
    const client = { once, user: { tag: 'Bot#1234' }, guilds: { cache: { size: 2 } } };
    const config = { starboard: { enabled: true, channelId: 'sb-ch', threshold: 5 } };
    registerReadyHandler(client, config, null);
    once.mock.calls[0][1]();
  });

  it('should resolve respondModel from triage.model string', () => {
    const once = vi.fn();
    const client = { once, user: { tag: 'Bot#1234' }, guilds: { cache: { size: 1 } } };
    const config = { ai: { enabled: true }, triage: { model: 'gpt-4' } };
    registerReadyHandler(client, config, null);
    once.mock.calls[0][1]();
  });

  it('should resolve respondModel from triage.models.default', () => {
    const once = vi.fn();
    const client = { once, user: { tag: 'Bot#1234' }, guilds: { cache: { size: 1 } } };
    const config = { ai: { enabled: true }, triage: { models: { default: 'custom-model' } } };
    registerReadyHandler(client, config, null);
    once.mock.calls[0][1]();
  });

  it('should resolve respondModel from explicit triage.respondModel', () => {
    const once = vi.fn();
    const client = { once, user: { tag: 'Bot#1234' }, guilds: { cache: { size: 1 } } };
    const config = {
      ai: { enabled: true },
      triage: { respondModel: 'explicit-model', classifyModel: 'cls' },
    };
    registerReadyHandler(client, config, null);
    once.mock.calls[0][1]();
  });
});

// ── registerMessageCreateHandler — extra branches ──────────────────

describe('registerMessageCreateHandler — extra branches', () => {
  let onCallbacks;
  let client;

  function setup(configOverrides = {}) {
    onCallbacks = {};
    client = {
      on: vi.fn((event, cb) => {
        onCallbacks[event] = cb;
      }),
      user: { id: 'bot-user-id' },
    };
    const config = {
      ai: { enabled: true, channels: [] },
      moderation: { enabled: true },
      ...configOverrides,
    };
    getConfig.mockReturnValue(config);
    registerMessageCreateHandler(client, config, null);
  }

  it('should handle AFK handler errors gracefully', async () => {
    setup();
    handleAfkMentions.mockRejectedValueOnce(new Error('afk boom'));
    await onCallbacks.messageCreate({
      author: { bot: false, username: 'user', id: 'u1' },
      guild: { id: 'g1' },
      content: 'hello',
      channel: { id: 'c1', sendTyping: vi.fn(), send: vi.fn() },
      mentions: { has: vi.fn().mockReturnValue(false), repliedUser: null },
      reference: null,
    });
  });

  it('should handle rate limit check errors gracefully', async () => {
    setup();
    checkRateLimit.mockRejectedValueOnce(new Error('rl boom'));
    await onCallbacks.messageCreate({
      author: { bot: false, username: 'user', id: 'u1' },
      guild: { id: 'g1' },
      content: 'hello',
      channel: { id: 'c1', sendTyping: vi.fn(), send: vi.fn() },
      mentions: { has: vi.fn().mockReturnValue(false), repliedUser: null },
      reference: null,
    });
    // Should not throw, should continue to recordCommunityActivity
    expect(recordCommunityActivity).toHaveBeenCalled();
  });

  it('should return early when rate limited', async () => {
    setup();
    checkRateLimit.mockResolvedValueOnce({ limited: true });
    await onCallbacks.messageCreate({
      author: { bot: false, username: 'user', id: 'u1' },
      guild: { id: 'g1' },
      content: 'hello',
      channel: { id: 'c1', sendTyping: vi.fn(), send: vi.fn() },
      mentions: { has: vi.fn().mockReturnValue(false), repliedUser: null },
      reference: null,
    });
    expect(recordCommunityActivity).not.toHaveBeenCalled();
  });

  it('should handle link filter errors gracefully', async () => {
    setup();
    checkLinks.mockRejectedValueOnce(new Error('link filter boom'));
    await onCallbacks.messageCreate({
      author: { bot: false, username: 'user', id: 'u1' },
      guild: { id: 'g1' },
      content: 'hello',
      channel: { id: 'c1', sendTyping: vi.fn(), send: vi.fn() },
      mentions: { has: vi.fn().mockReturnValue(false), repliedUser: null },
      reference: null,
    });
    expect(recordCommunityActivity).toHaveBeenCalled();
  });

  it('should return early when link is blocked', async () => {
    setup();
    checkLinks.mockResolvedValueOnce({ blocked: true });
    await onCallbacks.messageCreate({
      author: { bot: false, username: 'user', id: 'u1' },
      guild: { id: 'g1' },
      content: 'http://evil.com',
      channel: { id: 'c1', sendTyping: vi.fn(), send: vi.fn() },
      mentions: { has: vi.fn().mockReturnValue(false), repliedUser: null },
      reference: null,
    });
    expect(recordCommunityActivity).not.toHaveBeenCalled();
  });

  it('should fall back to fetching ref msg when repliedUser is someone else', async () => {
    setup();
    const fetchedRef = { author: { id: 'bot-user-id' } };
    await onCallbacks.messageCreate({
      author: { bot: false, username: 'user', id: 'u1' },
      guild: { id: 'g1' },
      content: 'follow up',
      channel: {
        id: 'c1',
        sendTyping: vi.fn().mockResolvedValue(undefined),
        send: vi.fn(),
        isThread: vi.fn().mockReturnValue(false),
        messages: { fetch: vi.fn().mockResolvedValue(fetchedRef) },
      },
      mentions: { has: vi.fn().mockReturnValue(false), repliedUser: { id: 'other-user' } },
      reference: { messageId: 'ref-msg-id' },
      reply: vi.fn().mockResolvedValue(undefined),
    });
    expect(evaluateNow).toHaveBeenCalled();
  });

  it('should handle ref message fetch failure gracefully', async () => {
    setup();
    await onCallbacks.messageCreate({
      author: { bot: false, username: 'user', id: 'u1' },
      guild: { id: 'g1' },
      content: 'follow up',
      channel: {
        id: 'c1',
        sendTyping: vi.fn().mockResolvedValue(undefined),
        send: vi.fn(),
        isThread: vi.fn().mockReturnValue(false),
        messages: { fetch: vi.fn().mockRejectedValue(new Error('not found')) },
      },
      mentions: { has: vi.fn().mockReturnValue(false), repliedUser: { id: 'other-user' } },
      reference: { messageId: 'ref-msg-id' },
      reply: vi.fn().mockResolvedValue(undefined),
    });
    // Not a reply to bot, so evaluateNow should not be called
    expect(evaluateNow).not.toHaveBeenCalled();
  });

  it('should handle safeReply failure when evaluateNow fails', async () => {
    setup();
    evaluateNow.mockRejectedValueOnce(new Error('triage failed'));
    await onCallbacks.messageCreate({
      author: { bot: false, username: 'user', id: 'u1' },
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
      reply: vi.fn().mockRejectedValue(new Error('reply failed too')),
    });
    // Should not throw
  });

  it('should not accumulate when ai is disabled', async () => {
    setup({ ai: { enabled: false }, moderation: { enabled: false } });
    await onCallbacks.messageCreate({
      author: { bot: false, username: 'user' },
      guild: { id: 'g1' },
      content: 'regular message',
      channel: { id: 'c1', sendTyping: vi.fn(), send: vi.fn() },
      mentions: { has: vi.fn().mockReturnValue(false), repliedUser: null },
      reference: null,
    });
    expect(accumulateMessage).not.toHaveBeenCalled();
  });

  it('should handle accumulateMessage returning a rejecting promise', async () => {
    // Use vibe mode so non-mention messages reach accumulateMessage
    setup({ ai: { enabled: true, channels: [], defaultChannelMode: 'vibe' } });
    accumulateMessage.mockReturnValueOnce(Promise.reject(new Error('buf fail')));
    await onCallbacks.messageCreate({
      author: { bot: false, username: 'user' },
      guild: { id: 'g1' },
      content: 'regular message',
      channel: {
        id: 'c1',
        sendTyping: vi.fn(),
        send: vi.fn(),
        isThread: vi.fn().mockReturnValue(false),
      },
      mentions: { has: vi.fn().mockReturnValue(false), repliedUser: null },
      reference: null,
    });
    // Should not throw; error is swallowed in the fire-and-forget wrapper
  });
});

// ── registerReactionHandlers — partial fetch edge cases ──────────────

describe('registerReactionHandlers — partial fetch', () => {
  let onCallbacks;
  let client;

  function setup() {
    onCallbacks = {};
    client = {
      on: vi.fn((event, cb) => {
        if (!onCallbacks[event]) onCallbacks[event] = [];
        onCallbacks[event].push(cb);
      }),
    };
    getConfig.mockReturnValue({ starboard: { enabled: true } });
    registerReactionHandlers(client, {});
  }

  it('should fetch partial messages on reaction add', async () => {
    setup();
    const fetch = vi.fn().mockResolvedValue(undefined);
    const reaction = { message: { guild: { id: 'g1' }, partial: true, id: 'msg1', fetch } };
    await onCallbacks.messageReactionAdd[0](reaction, { bot: false, id: 'u1' });
    expect(fetch).toHaveBeenCalled();
  });

  it('should return early if partial fetch fails on reaction add', async () => {
    setup();
    const reaction = {
      message: {
        guild: { id: 'g1' },
        partial: true,
        id: 'msg1',
        fetch: vi.fn().mockRejectedValue(new Error('fail')),
      },
    };
    await onCallbacks.messageReactionAdd[0](reaction, { bot: false, id: 'u1' });
    expect(handleReactionAdd).not.toHaveBeenCalled();
  });

  it('should return early if no guild on reaction add', async () => {
    setup();
    const reaction = { message: { guild: null, partial: false, id: 'msg1' } };
    await onCallbacks.messageReactionAdd[0](reaction, { bot: false, id: 'u1' });
    expect(handleReactionAdd).not.toHaveBeenCalled();
  });

  it('should return early if partial fetch fails on reaction remove', async () => {
    setup();
    const reaction = {
      message: {
        guild: { id: 'g1' },
        partial: true,
        id: 'msg1',
        fetch: vi.fn().mockRejectedValue(new Error('fail')),
      },
    };
    await onCallbacks.messageReactionRemove[0](reaction, { bot: false, id: 'u1' });
    expect(handleReactionRemove).not.toHaveBeenCalled();
  });

  it('should return early if no guild on reaction remove', async () => {
    setup();
    const reaction = { message: { guild: null, partial: false, id: 'msg1' } };
    await onCallbacks.messageReactionRemove[0](reaction, { bot: false, id: 'u1' });
    expect(handleReactionRemove).not.toHaveBeenCalled();
  });

  it('should ignore bot on reaction remove', async () => {
    setup();
    const reaction = { message: { guild: { id: 'g1' }, partial: false, id: 'msg1' } };
    await onCallbacks.messageReactionRemove[0](reaction, { bot: true, id: 'bot1' });
    expect(handleReactionRemove).not.toHaveBeenCalled();
  });
});
