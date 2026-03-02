/**
 * Tests for issue #156: uncaughtException handler must call process.exit(1).
 *
 * Uses vi.resetModules() + dynamic import to get a fresh module instance with
 * processHandlersRegistered = false, so we can capture and invoke the handler.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Static mocks (hoisted before any imports) ────────────────────────────────
vi.mock('../../src/utils/safeSend.js', () => ({
  safeSend: vi.fn(),
  safeReply: vi.fn(),
  safeFollowUp: vi.fn(),
  safeEditReply: vi.fn(),
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

// ── Tests ────────────────────────────────────────────────────────────────────

describe('registerErrorHandlers — uncaughtException exits process (issue #156)', () => {
  let processOnSpy;
  let processExitSpy;

  beforeEach(() => {
    // Reset modules so processHandlersRegistered starts as false
    vi.resetModules();
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});
  });

  afterEach(() => {
    processOnSpy?.mockRestore();
    processExitSpy?.mockRestore();
    vi.resetModules();
  });

  it('registers an uncaughtException handler', async () => {
    const capturedHandlers = {};
    processOnSpy = vi.spyOn(process, 'on').mockImplementation((event, fn) => {
      capturedHandlers[event] = fn;
      return process;
    });

    const { registerErrorHandlers } = await import('../../src/modules/events.js');
    registerErrorHandlers({ on: vi.fn() });

    expect(capturedHandlers['uncaughtException']).toBeDefined();
  });

  it('calls process.exit(1) after logging an uncaught exception', async () => {
    const capturedHandlers = {};
    processOnSpy = vi.spyOn(process, 'on').mockImplementation((event, fn) => {
      capturedHandlers[event] = fn;
      return process;
    });

    vi.doMock('../../src/sentry.js', () => ({
      Sentry: { flush: vi.fn().mockResolvedValue(undefined) },
    }));

    const { registerErrorHandlers } = await import('../../src/modules/events.js');
    registerErrorHandlers({ on: vi.fn() });

    expect(capturedHandlers['uncaughtException']).toBeDefined();

    await capturedHandlers['uncaughtException'](new Error('boom'));

    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('still calls process.exit(1) even if Sentry flush throws', async () => {
    const capturedHandlers = {};
    processOnSpy = vi.spyOn(process, 'on').mockImplementation((event, fn) => {
      capturedHandlers[event] = fn;
      return process;
    });

    vi.doMock('../../src/sentry.js', () => ({
      Sentry: {
        flush: vi.fn().mockRejectedValue(new Error('sentry down')),
      },
    }));

    const { registerErrorHandlers } = await import('../../src/modules/events.js');
    registerErrorHandlers({ on: vi.fn() });

    await capturedHandlers['uncaughtException'](new Error('boom while sentry is down'));

    // Must still exit even when Sentry fails — handler has a catch block
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });
});
