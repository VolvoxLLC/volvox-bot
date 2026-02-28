import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn(),
}));

vi.mock('../../src/modules/afkHandler.js', () => ({
  handleAfkMentions: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/modules/rateLimit.js', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ limited: false }),
}));

vi.mock('../../src/modules/linkFilter.js', () => ({
  checkLinks: vi.fn().mockResolvedValue({ blocked: false }),
}));

vi.mock('../../src/modules/engagement.js', () => ({
  trackMessage: vi.fn().mockResolvedValue(undefined),
  trackReaction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/modules/reputation.js', () => ({
  handleXpGain: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/modules/spam.js', () => ({
  isSpam: vi.fn().mockReturnValue(false),
  sendSpamAlert: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/modules/triage.js', () => ({
  accumulateMessage: vi.fn().mockResolvedValue(undefined),
  evaluateNow: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/modules/welcome.js', () => ({
  recordCommunityActivity: vi.fn(),
  sendWelcomeMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/utils/errors.js', () => ({
  getUserFriendlyMessage: vi.fn().mockReturnValue('friendly error'),
}));

vi.mock('../../src/utils/safeSend.js', () => ({
  safeReply: vi.fn((target, payload) => target.reply?.(payload)),
  safeEditReply: vi.fn((target, payload) => target.editReply?.(payload)),
  safeSend: vi.fn((target, payload) => target.send?.(payload)),
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

vi.mock('../../src/modules/starboard.js', () => ({
  handleReactionAdd: vi.fn().mockResolvedValue(undefined),
  handleReactionRemove: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/db.js', () => ({
  getPool: vi.fn(),
}));

import { warn } from '../../src/logger.js';
import { handleShowcaseModalSubmit, handleShowcaseUpvote } from '../../src/commands/showcase.js';
import { getPool } from '../../src/db.js';
import {
  registerChallengeButtonHandler,
  registerErrorHandlers,
  registerMessageCreateHandler,
  registerReactionHandlers,
  registerReadyHandler,
  registerReviewClaimHandler,
  registerShowcaseButtonHandler,
  registerShowcaseModalHandler,
} from '../../src/modules/events.js';
import { handleHintButton, handleSolveButton } from '../../src/modules/challengeScheduler.js';
import { getConfig } from '../../src/modules/config.js';
import { checkLinks } from '../../src/modules/linkFilter.js';
import { checkRateLimit } from '../../src/modules/rateLimit.js';
import { handleReviewClaim } from '../../src/modules/reviewHandler.js';
import { handleReactionAdd, handleReactionRemove } from '../../src/modules/starboard.js';
import { accumulateMessage, evaluateNow } from '../../src/modules/triage.js';
import { recordCommunityActivity } from '../../src/modules/welcome.js';
import { safeEditReply, safeReply } from '../../src/utils/safeSend.js';

function makeInteraction(overrides = {}) {
  return {
    isButton: () => true,
    isModalSubmit: () => false,
    customId: 'id',
    guildId: 'guild-1',
    replied: false,
    deferred: false,
    user: { id: 'u1' },
    reply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('events coverage follow-up', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getConfig.mockReturnValue({
      moderation: { enabled: true },
      ai: { enabled: true, channels: [] },
      review: { enabled: true },
      starboard: { enabled: true },
    });
    getPool.mockReturnValue({ query: vi.fn() });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('covers ready-handler model and starboard branches', () => {
    const once = vi.fn();
    const client = { once, user: { tag: 'Bot#0001' }, guilds: { cache: { size: 2 } } };

    registerReadyHandler(
      client,
      {
        ai: { enabled: true },
        triage: { model: 'claude-sonnet-custom' },
        starboard: { enabled: true, channelId: 'sb-1', threshold: 5 },
      },
      null,
    );

    const cb = once.mock.calls[0][1];
    cb();

    expect(once).toHaveBeenCalledWith('clientReady', expect.any(Function));
  });

  it('covers messageCreate branches for moderation and ai disabled', async () => {
    const handlers = new Map();
    const client = {
      user: { id: 'bot-id' },
      on: (event, fn) => handlers.set(event, fn),
    };

    getConfig.mockReturnValue({
      moderation: { enabled: false },
      ai: { enabled: false },
    });

    registerMessageCreateHandler(client, {}, null);
    const handler = handlers.get('messageCreate');

    const message = {
      author: { id: 'u1', bot: false },
      guild: { id: 'g1' },
      content: 'hello',
      channel: { id: 'c1', sendTyping: vi.fn().mockResolvedValue(undefined) },
      mentions: { has: vi.fn().mockReturnValue(false), repliedUser: null },
      reference: null,
      reply: vi.fn().mockResolvedValue(undefined),
    };

    await handler(message);

    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(checkLinks).not.toHaveBeenCalled();
    expect(evaluateNow).not.toHaveBeenCalled();
    expect(accumulateMessage).not.toHaveBeenCalled();
    expect(recordCommunityActivity).toHaveBeenCalledWith(message, {
      moderation: { enabled: false },
      ai: { enabled: false },
    });
  });

  it('returns early when rate-limit says limited', async () => {
    checkRateLimit.mockResolvedValueOnce({ limited: true });

    const handlers = new Map();
    const client = { user: { id: 'bot-id' }, on: (event, fn) => handlers.set(event, fn) };
    registerMessageCreateHandler(client, {}, null);
    const handler = handlers.get('messageCreate');

    await handler({
      author: { id: 'u1', bot: false },
      guild: { id: 'g1' },
      content: 'hello',
      channel: { id: 'c1', sendTyping: vi.fn().mockResolvedValue(undefined) },
      mentions: { has: vi.fn().mockReturnValue(false), repliedUser: null },
      reference: null,
      reply: vi.fn().mockResolvedValue(undefined),
    });

    expect(checkRateLimit).toHaveBeenCalled();
    expect(checkLinks).not.toHaveBeenCalled();
  });

  it('returns early when link-filter says blocked', async () => {
    checkRateLimit.mockResolvedValueOnce({ limited: false });
    checkLinks.mockResolvedValueOnce({ blocked: true });

    const handlers = new Map();
    const client = { user: { id: 'bot-id' }, on: (event, fn) => handlers.set(event, fn) };
    registerMessageCreateHandler(client, {}, null);
    const handler = handlers.get('messageCreate');

    await handler({
      author: { id: 'u1', bot: false },
      guild: { id: 'g1' },
      content: 'hello',
      channel: { id: 'c1', sendTyping: vi.fn().mockResolvedValue(undefined) },
      mentions: { has: vi.fn().mockReturnValue(false), repliedUser: null },
      reference: null,
      reply: vi.fn().mockResolvedValue(undefined),
    });

    expect(checkLinks).toHaveBeenCalled();
    expect(recordCommunityActivity).not.toHaveBeenCalled();
  });

  it('covers reply-detection fetch branch and channels fallback', async () => {
    getConfig.mockReturnValue({
      moderation: { enabled: true },
      ai: { enabled: true }, // intentionally no channels key for || [] branch
    });

    const handlers = new Map();
    const client = { user: { id: 'bot-id' }, on: (event, fn) => handlers.set(event, fn) };
    registerMessageCreateHandler(client, {}, null);
    const handler = handlers.get('messageCreate');

    const fetch = vi.fn().mockResolvedValue({ author: { id: 'bot-id' } });
    const message = {
      author: { id: 'u1', bot: false },
      guild: { id: 'g1' },
      content: 'replying',
      channel: {
        id: 'c1',
        sendTyping: vi.fn().mockResolvedValue(undefined),
        isThread: vi.fn().mockReturnValue(false),
        messages: { fetch },
      },
      mentions: { has: vi.fn().mockReturnValue(false), repliedUser: { id: 'someone-else' } },
      reference: { messageId: 'm1' },
      reply: vi.fn().mockResolvedValue(undefined),
    };

    await handler(message);

    expect(fetch).toHaveBeenCalledWith('m1');
    expect(evaluateNow).toHaveBeenCalledWith('c1', expect.any(Object), client, null);
  });

  it('covers reaction handler partial and no-guild branches', async () => {
    const handlers = new Map();
    const client = { on: (event, fn) => handlers.set(event, fn) };
    registerReactionHandlers(client, {});

    const addHandler = handlers.get('messageReactionAdd');

    const partialReaction = {
      message: {
        id: 'm1',
        partial: true,
        fetch: vi.fn().mockResolvedValue(undefined),
        guild: { id: 'g1' },
      },
    };
    await addHandler(partialReaction, { id: 'u1', bot: false });
    expect(handleReactionAdd).toHaveBeenCalled();

    const noGuildReaction = {
      message: {
        id: 'm2',
        partial: false,
        guild: null,
      },
    };
    await addHandler(noGuildReaction, { id: 'u2', bot: false });
    expect(handleReactionAdd).toHaveBeenCalledTimes(1);
  });

  it('covers reaction remove bot/partial/starboard-disabled branches', async () => {
    const handlers = new Map();
    const client = { on: (event, fn) => handlers.set(event, fn) };
    registerReactionHandlers(client, {});

    const removeHandler = handlers.get('messageReactionRemove');

    const reaction = {
      message: {
        id: 'm1',
        partial: false,
        guild: { id: 'g1' },
      },
    };

    await removeHandler(reaction, { id: 'bot', bot: true });
    expect(handleReactionRemove).not.toHaveBeenCalled();

    const partialReaction = {
      message: {
        id: 'm2',
        partial: true,
        fetch: vi.fn().mockResolvedValue(undefined),
        guild: { id: 'g1' },
      },
    };
    getConfig.mockReturnValueOnce({ starboard: { enabled: false } });
    await removeHandler(partialReaction, { id: 'u1', bot: false });
    expect(handleReactionRemove).not.toHaveBeenCalled();
  });

  it('covers review claim handler paths', async () => {
    const handlers = new Map();
    const client = { on: (event, fn) => handlers.set(event, fn) };
    registerReviewClaimHandler(client);

    const handler = handlers.get('interactionCreate');

    await handler(makeInteraction({ isButton: () => false }));
    await handler(makeInteraction({ customId: 'not_review_claim' }));

    getConfig.mockReturnValueOnce({ review: { enabled: false } });
    await handler(makeInteraction({ customId: 'review_claim_123' }));
    expect(handleReviewClaim).not.toHaveBeenCalled();

    await handler(makeInteraction({ customId: 'review_claim_123' }));
    expect(handleReviewClaim).toHaveBeenCalledTimes(1);

    handleReviewClaim.mockRejectedValueOnce(new Error('boom'));
    const failing = makeInteraction({ customId: 'review_claim_123' });
    await handler(failing);
    expect(safeReply).toHaveBeenCalledWith(
      failing,
      expect.objectContaining({ ephemeral: true }),
    );

    handleReviewClaim.mockRejectedValueOnce(new Error('boom'));
    const alreadyDone = makeInteraction({ customId: 'review_claim_123', replied: true });
    await handler(alreadyDone);
    expect(safeReply).not.toHaveBeenCalledWith(alreadyDone, expect.anything());
  });

  it('covers showcase upvote handler branches', async () => {
    const handlers = new Map();
    const client = { on: (event, fn) => handlers.set(event, fn) };
    registerShowcaseButtonHandler(client);

    const handler = handlers.get('interactionCreate');

    await handler(makeInteraction({ isButton: () => false }));
    await handler(makeInteraction({ customId: 'wrong_prefix' }));

    getPool.mockImplementationOnce(() => {
      throw new Error('no db');
    });
    const noDb = makeInteraction({ customId: 'showcase_upvote_1' });
    await handler(noDb);
    expect(safeReply).toHaveBeenCalledWith(
      noDb,
      expect.objectContaining({ content: '❌ Database is not available.' }),
    );

    const ok = makeInteraction({ customId: 'showcase_upvote_1' });
    await handler(ok);
    expect(handleShowcaseUpvote).toHaveBeenCalledWith(ok, expect.any(Object));

    handleShowcaseUpvote.mockRejectedValueOnce(new Error('upvote fail'));
    const failing = makeInteraction({ customId: 'showcase_upvote_2' });
    await handler(failing);
    expect(safeReply).toHaveBeenCalledWith(
      failing,
      expect.objectContaining({ ephemeral: true }),
    );

    handleShowcaseUpvote.mockRejectedValueOnce(new Error('upvote fail'));
    const alreadyDone = makeInteraction({ customId: 'showcase_upvote_3', deferred: true });
    await handler(alreadyDone);
    expect(safeReply).not.toHaveBeenCalledWith(alreadyDone, expect.anything());
  });

  it('covers showcase modal handler branches', async () => {
    const handlers = new Map();
    const client = { on: (event, fn) => handlers.set(event, fn) };
    registerShowcaseModalHandler(client);

    const handler = handlers.get('interactionCreate');

    await handler(makeInteraction({ isModalSubmit: () => false }));
    await handler(
      makeInteraction({
        isModalSubmit: () => true,
        customId: 'other_modal',
      }),
    );

    getPool.mockImplementationOnce(() => {
      throw new Error('db missing');
    });
    const noDb = makeInteraction({
      isModalSubmit: () => true,
      customId: 'showcase_submit_modal',
    });
    await handler(noDb);
    expect(safeReply).toHaveBeenCalledWith(
      noDb,
      expect.objectContaining({ content: '❌ Database is not available.' }),
    );

    const ok = makeInteraction({
      isModalSubmit: () => true,
      customId: 'showcase_submit_modal',
    });
    await handler(ok);
    expect(handleShowcaseModalSubmit).toHaveBeenCalledWith(ok, expect.any(Object));

    handleShowcaseModalSubmit.mockRejectedValueOnce(new Error('submit failed'));
    const notDeferred = makeInteraction({
      isModalSubmit: () => true,
      customId: 'showcase_submit_modal',
      deferred: false,
    });
    await handler(notDeferred);
    expect(safeReply).toHaveBeenCalledWith(
      notDeferred,
      expect.objectContaining({ content: '❌ Something went wrong.' }),
    );

    handleShowcaseModalSubmit.mockRejectedValueOnce(new Error('submit failed'));
    const deferred = makeInteraction({
      isModalSubmit: () => true,
      customId: 'showcase_submit_modal',
      deferred: true,
    });
    await handler(deferred);
    expect(safeEditReply).toHaveBeenCalledWith(
      deferred,
      expect.objectContaining({ content: '❌ Something went wrong.' }),
    );
  });

  it('covers challenge button handler branches', async () => {
    const handlers = new Map();
    const client = { on: (event, fn) => handlers.set(event, fn) };
    registerChallengeButtonHandler(client);

    const handler = handlers.get('interactionCreate');

    await handler(makeInteraction({ isButton: () => false }));
    await handler(makeInteraction({ customId: 'something_else' }));

    await handler(makeInteraction({ customId: 'challenge_solve_not-a-number' }));
    expect(warn).toHaveBeenCalledWith(
      'Invalid challenge button customId',
      expect.objectContaining({ customId: 'challenge_solve_not-a-number' }),
    );

    const solve = makeInteraction({ customId: 'challenge_solve_3' });
    await handler(solve);
    expect(handleSolveButton).toHaveBeenCalledWith(solve, 3);

    const hint = makeInteraction({ customId: 'challenge_hint_2' });
    await handler(hint);
    expect(handleHintButton).toHaveBeenCalledWith(hint, 2);

    handleSolveButton.mockRejectedValueOnce(new Error('solve fail'));
    const failing = makeInteraction({ customId: 'challenge_solve_7' });
    await handler(failing);
    expect(safeReply).toHaveBeenCalledWith(
      failing,
      expect.objectContaining({ ephemeral: true }),
    );

    handleHintButton.mockRejectedValueOnce(new Error('hint fail'));
    const alreadyDone = makeInteraction({ customId: 'challenge_hint_9', replied: true });
    await handler(alreadyDone);
    expect(safeReply).not.toHaveBeenCalledWith(alreadyDone, expect.anything());
  });

  it('covers registerErrorHandlers fallback error-string branch', () => {
    const on = vi.fn();
    const client = { on };
    const processOnSpy = vi.spyOn(process, 'on').mockImplementation(() => process);

    registerErrorHandlers(client);

    const unhandled = processOnSpy.mock.calls.find((c) => c[0] === 'unhandledRejection')?.[1];
    expect(unhandled).toBeTypeOf('function');

    // no .message on purpose, so String(err) branch executes
    unhandled(undefined);

    // second call should skip process.on registration
    registerErrorHandlers(client);

    const unhandledRegCalls = processOnSpy.mock.calls.filter((c) => c[0] === 'unhandledRejection');
    expect(unhandledRegCalls).toHaveLength(1);

    processOnSpy.mockRestore();
  });
});
