import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn(),
}));

vi.mock('../../src/modules/afkHandler.js', () => ({
  handleAfkMentions: vi.fn(),
}));

vi.mock('../../src/modules/challengeScheduler.js', () => ({
  handleSolveButton: vi.fn(),
  handleHintButton: vi.fn(),
}));

vi.mock('../../src/modules/engagement.js', () => ({
  trackMessage: vi.fn(),
  trackReaction: vi.fn(),
}));

vi.mock('../../src/modules/linkFilter.js', () => ({
  checkLinks: vi.fn(),
}));

vi.mock('../../src/modules/pollHandler.js', () => ({
  handlePollVote: vi.fn(),
}));

vi.mock('../../src/modules/rateLimit.js', () => ({
  checkRateLimit: vi.fn(),
}));

vi.mock('../../src/modules/reputation.js', () => ({
  handleXpGain: vi.fn(),
}));

vi.mock('../../src/modules/reviewHandler.js', () => ({
  handleReviewClaim: vi.fn(),
}));

vi.mock('../../src/modules/spam.js', () => ({
  isSpam: vi.fn(),
  sendSpamAlert: vi.fn(),
}));

vi.mock('../../src/modules/starboard.js', () => ({
  handleReactionAdd: vi.fn(),
  handleReactionRemove: vi.fn(),
}));

vi.mock('../../src/modules/triage.js', () => ({
  accumulateMessage: vi.fn(),
  evaluateNow: vi.fn(),
}));

vi.mock('../../src/modules/welcome.js', () => ({
  recordCommunityActivity: vi.fn(),
  sendWelcomeMessage: vi.fn(),
}));

vi.mock('../../src/commands/showcase.js', () => ({
  handleShowcaseModalSubmit: vi.fn(),
  handleShowcaseUpvote: vi.fn(),
}));

vi.mock('../../src/utils/errors.js', () => ({
  getUserFriendlyMessage: vi.fn(() => 'friendly'),
}));

const safeReplyMock = vi.fn();
const safeEditReplyMock = vi.fn();
vi.mock('../../src/utils/safeSend.js', () => ({
  safeReply: (...args) => safeReplyMock(...args),
  safeEditReply: (...args) => safeEditReplyMock(...args),
}));

const getTicketConfigMock = vi.fn();
const openTicketMock = vi.fn();
const closeTicketMock = vi.fn();
vi.mock('../../src/modules/ticketHandler.js', () => ({
  getTicketConfig: (...args) => getTicketConfigMock(...args),
  openTicket: (...args) => openTicketMock(...args),
  closeTicket: (...args) => closeTicketMock(...args),
}));

import { ChannelType, Events } from 'discord.js';
import {
  registerTicketCloseButtonHandler,
  registerTicketModalHandler,
  registerTicketOpenButtonHandler,
} from '../../src/modules/events.js';

function setupClientAndHandler(registerFn) {
  const handlers = new Map();
  const client = {
    on: vi.fn((event, cb) => handlers.set(event, cb)),
  };

  registerFn(client);
  return handlers.get(Events.InteractionCreate);
}

describe('events ticket handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTicketConfigMock.mockReturnValue({ enabled: true });
  });

  describe('registerTicketOpenButtonHandler', () => {
    it('shows a modal for ticket_open button when enabled', async () => {
      const handler = setupClientAndHandler(registerTicketOpenButtonHandler);

      const interaction = {
        isButton: () => true,
        customId: 'ticket_open',
        guildId: 'guild1',
        user: { id: 'user1' },
        showModal: vi.fn().mockResolvedValue(undefined),
      };

      await handler(interaction);

      expect(interaction.showModal).toHaveBeenCalledTimes(1);
      const modal = interaction.showModal.mock.calls[0][0];
      expect(modal.data.custom_id).toBe('ticket_open_modal');
    });

    it('replies with disabled message when tickets are off', async () => {
      const handler = setupClientAndHandler(registerTicketOpenButtonHandler);
      getTicketConfigMock.mockReturnValue({ enabled: false });

      const interaction = {
        isButton: () => true,
        customId: 'ticket_open',
        guildId: 'guild1',
      };

      await handler(interaction);

      expect(safeReplyMock).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({
          content: expect.stringContaining('not enabled'),
          ephemeral: true,
        }),
      );
    });
  });

  describe('registerTicketModalHandler', () => {
    it('opens ticket and sends success message', async () => {
      const handler = setupClientAndHandler(registerTicketModalHandler);

      openTicketMock.mockResolvedValue({
        ticket: { id: 42 },
        thread: { id: 'thread-42' },
      });

      const interaction = {
        isModalSubmit: () => true,
        customId: 'ticket_open_modal',
        deferReply: vi.fn().mockResolvedValue(undefined),
        fields: { getTextInputValue: vi.fn().mockReturnValue('Need help') },
        guild: { id: 'guild1' },
        user: { id: 'user1' },
        channelId: 'channel1',
      };

      await handler(interaction);

      expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
      expect(openTicketMock).toHaveBeenCalledWith(
        interaction.guild,
        interaction.user,
        'Need help',
        'channel1',
      );
      expect(safeEditReplyMock).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('Ticket #42 created') }),
      );
    });

    it('sends error message when openTicket fails', async () => {
      const handler = setupClientAndHandler(registerTicketModalHandler);
      openTicketMock.mockRejectedValue(new Error('No suitable channel found'));

      const interaction = {
        isModalSubmit: () => true,
        customId: 'ticket_open_modal',
        deferReply: vi.fn().mockResolvedValue(undefined),
        fields: { getTextInputValue: vi.fn().mockReturnValue('') },
        guild: { id: 'guild1' },
        user: { id: 'user1' },
        channelId: 'channel1',
      };

      await handler(interaction);

      expect(safeEditReplyMock).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('No suitable channel found') }),
      );
    });
  });

  describe('registerTicketCloseButtonHandler', () => {
    it('rejects non-ticket channels', async () => {
      const handler = setupClientAndHandler(registerTicketCloseButtonHandler);

      const interaction = {
        isButton: () => true,
        customId: 'ticket_close_1',
        deferReply: vi.fn().mockResolvedValue(undefined),
        channel: {
          isThread: () => false,
          type: ChannelType.GuildVoice,
        },
      };

      await handler(interaction);

      expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
      expect(safeEditReplyMock).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({
          content: expect.stringContaining('only be used inside a ticket channel or thread'),
        }),
      );
      expect(closeTicketMock).not.toHaveBeenCalled();
    });

    it('closes ticket and sends success reply', async () => {
      const handler = setupClientAndHandler(registerTicketCloseButtonHandler);
      closeTicketMock.mockResolvedValue({ id: 7 });

      const interaction = {
        isButton: () => true,
        customId: 'ticket_close_7',
        deferReply: vi.fn().mockResolvedValue(undefined),
        channel: {
          id: 'thread7',
          isThread: () => true,
        },
        user: { id: 'closer1' },
      };

      await handler(interaction);

      expect(closeTicketMock).toHaveBeenCalledWith(
        interaction.channel,
        interaction.user,
        'Closed via button',
      );
      expect(safeEditReplyMock).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: '✅ Ticket #7 has been closed.' }),
      );
    });

    it('sends error when closeTicket fails', async () => {
      const handler = setupClientAndHandler(registerTicketCloseButtonHandler);
      closeTicketMock.mockRejectedValue(new Error('No open ticket found for this thread.'));

      const interaction = {
        isButton: () => true,
        customId: 'ticket_close_9',
        deferReply: vi.fn().mockResolvedValue(undefined),
        channel: {
          id: 'thread9',
          isThread: () => true,
        },
        user: { id: 'closer1' },
      };

      await handler(interaction);

      expect(safeEditReplyMock).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({
          content: expect.stringContaining('No open ticket found for this thread.'),
        }),
      );
    });
  });
});
