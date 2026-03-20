import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  logError,
  handlePollButton,
  handleChallengeButton,
  handleReviewButton,
  handleShowcaseButton,
  handleShowcaseModal,
  handleTicketOpenButton,
  handleTicketModal,
  handleTicketCloseButton,
  handleReminderButton,
  handleWelcomeOnboarding,
} = vi.hoisted(() => ({
  logError: vi.fn(),
  handlePollButton: vi.fn(),
  handleChallengeButton: vi.fn(),
  handleReviewButton: vi.fn(),
  handleShowcaseButton: vi.fn(),
  handleShowcaseModal: vi.fn(),
  handleTicketOpenButton: vi.fn(),
  handleTicketModal: vi.fn(),
  handleTicketCloseButton: vi.fn(),
  handleReminderButton: vi.fn(),
  handleWelcomeOnboarding: vi.fn(),
}));

vi.mock('../../../src/logger.js', () => ({
  error: logError,
}));
vi.mock('../../../src/modules/handlers/pollHandler.js', () => ({
  handlePollButton,
}));
vi.mock('../../../src/modules/handlers/challengeHandler.js', () => ({
  handleChallengeButton,
}));
vi.mock('../../../src/modules/handlers/reviewHandler.js', () => ({
  handleReviewButton,
}));
vi.mock('../../../src/modules/handlers/showcaseHandler.js', () => ({
  handleShowcaseButton,
  handleShowcaseModal,
}));
vi.mock('../../../src/modules/handlers/ticketHandler.js', () => ({
  handleTicketOpenButton,
  handleTicketModal,
  handleTicketCloseButton,
}));
vi.mock('../../../src/modules/handlers/reminderHandler.js', () => ({
  handleReminderButton,
}));
vi.mock('../../../src/modules/handlers/welcomeOnboardingHandler.js', () => ({
  handleWelcomeOnboarding,
  registerWelcomeOnboardingHandlers: vi.fn(),
}));

import { Events } from 'discord.js';
import { registerComponentHandlers } from '../../../src/modules/events/interactionCreate.js';

beforeEach(() => {
  vi.clearAllMocks();
  handlePollButton.mockResolvedValue(false);
  handleChallengeButton.mockResolvedValue(false);
  handleReviewButton.mockResolvedValue(false);
  handleShowcaseButton.mockResolvedValue(false);
  handleShowcaseModal.mockResolvedValue(false);
  handleTicketOpenButton.mockResolvedValue(false);
  handleTicketModal.mockResolvedValue(false);
  handleTicketCloseButton.mockResolvedValue(false);
  handleReminderButton.mockResolvedValue(false);
  handleWelcomeOnboarding.mockResolvedValue(false);
});

describe('registerComponentHandlers', () => {
  it('stops dispatch once a handler reports it handled the interaction', async () => {
    const handlers = new Map();
    const client = { on: vi.fn((event, fn) => handlers.set(event, fn)) };
    const interaction = { customId: 'abc123' };

    handleChallengeButton.mockResolvedValue(true);

    registerComponentHandlers(client);

    expect(client.on).toHaveBeenCalledWith(Events.InteractionCreate, expect.any(Function));

    await handlers.get(Events.InteractionCreate)(interaction);

    expect(handlePollButton).toHaveBeenCalledWith(interaction);
    expect(handleChallengeButton).toHaveBeenCalledWith(interaction);
    expect(handleReviewButton).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });

  it('logs and aborts dispatch when a handler throws unexpectedly', async () => {
    const handlers = new Map();
    const client = { on: vi.fn((event, fn) => handlers.set(event, fn)) };
    const interaction = { customId: 'boom-123' };

    handlePollButton.mockRejectedValue(new Error('boom'));

    registerComponentHandlers(client);

    await handlers.get(Events.InteractionCreate)(interaction);

    expect(logError).toHaveBeenCalledWith(
      'Interaction handler threw unexpectedly',
      expect.objectContaining({
        handler: expect.any(String),
        customId: 'boom-123',
        error: 'boom',
      }),
    );
    expect(handleChallengeButton).not.toHaveBeenCalled();
  });
});
