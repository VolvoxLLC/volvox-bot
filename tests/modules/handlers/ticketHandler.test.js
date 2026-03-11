import { describe, expect, it, vi } from 'vitest';

const mockSafeReply = vi.fn().mockResolvedValue(undefined);
const mockSafeEditReply = vi.fn().mockResolvedValue(undefined);
const mockOpenTicket = vi.fn();
const mockCloseTicket = vi.fn();
const mockGetTicketConfig = vi.fn();
const mockLogError = vi.fn();

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: (...args) => mockLogError(...args),
}));

vi.mock('../../../src/utils/safeSend.js', () => ({
  safeReply: (...args) => mockSafeReply(...args),
  safeEditReply: (...args) => mockSafeEditReply(...args),
}));

vi.mock('../../../src/modules/ticketHandler.js', () => ({
  closeTicket: (...args) => mockCloseTicket(...args),
  getTicketConfig: (...args) => mockGetTicketConfig(...args),
  openTicket: (...args) => mockOpenTicket(...args),
}));

import {
  registerTicketCloseButtonHandler,
  registerTicketModalHandler,
  registerTicketOpenButtonHandler,
} from '../../../src/modules/handlers/ticketHandler.js';

function createClient() {
  return {
    on: vi.fn(),
  };
}

function getRegisteredHandler(client) {
  return client.on.mock.calls[0][1];
}

describe('ticket interaction handlers', () => {
  it('ignores unrelated interactions in the open button handler', async () => {
    const client = createClient();
    registerTicketOpenButtonHandler(client);
    const handler = getRegisteredHandler(client);

    await handler({
      isButton: () => false,
    });

    expect(mockGetTicketConfig).not.toHaveBeenCalled();
  });

  it('shows an ephemeral error when tickets are disabled', async () => {
    mockGetTicketConfig.mockReturnValueOnce({ enabled: false });
    const client = createClient();
    registerTicketOpenButtonHandler(client);
    const handler = getRegisteredHandler(client);

    await handler({
      isButton: () => true,
      customId: 'ticket_open',
      guildId: 'guild-1',
    });

    expect(mockSafeReply).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        content: '❌ The ticket system is not enabled on this server.',
        ephemeral: true,
      }),
    );
  });

  it('logs when showing the ticket modal fails', async () => {
    mockGetTicketConfig.mockReturnValueOnce({ enabled: true });
    const client = createClient();
    registerTicketOpenButtonHandler(client);
    const handler = getRegisteredHandler(client);

    await handler({
      isButton: () => true,
      customId: 'ticket_open',
      guildId: 'guild-1',
      user: { id: 'user-1' },
      showModal: vi.fn().mockRejectedValue(new Error('modal failed')),
    });

    expect(mockLogError).toHaveBeenCalledWith(
      'Failed to show ticket modal',
      expect.objectContaining({ error: 'modal failed', userId: 'user-1' }),
    );
  });

  it('opens a ticket from the modal submission and edits the deferred reply', async () => {
    mockOpenTicket.mockResolvedValueOnce({
      ticket: { id: 77 },
      thread: { id: 'thread-77' },
    });
    const client = createClient();
    registerTicketModalHandler(client);
    const handler = getRegisteredHandler(client);

    const interaction = {
      isModalSubmit: () => true,
      customId: 'ticket_open_modal',
      guildId: 'guild-1',
      guild: { id: 'guild-1' },
      user: { id: 'user-1' },
      channelId: 'channel-1',
      fields: {
        getTextInputValue: vi.fn().mockReturnValue('Need help'),
      },
      deferReply: vi.fn().mockResolvedValue(undefined),
    };

    await handler(interaction);

    expect(mockOpenTicket).toHaveBeenCalledWith(
      interaction.guild,
      interaction.user,
      'Need help',
      'channel-1',
    );
    expect(mockSafeEditReply).toHaveBeenCalledWith(interaction, {
      content: '✅ Ticket #77 created! Head to <#thread-77>.',
    });
  });

  it('falls back to a generic error when modal submission handling fails', async () => {
    mockOpenTicket.mockRejectedValueOnce(new Error('open failed'));
    const client = createClient();
    registerTicketModalHandler(client);
    const handler = getRegisteredHandler(client);

    const interaction = {
      isModalSubmit: () => true,
      customId: 'ticket_open_modal',
      guildId: 'guild-1',
      guild: { id: 'guild-1' },
      user: { id: 'user-1' },
      channelId: 'channel-1',
      fields: {
        getTextInputValue: vi.fn().mockReturnValue('Need help'),
      },
      deferReply: vi.fn().mockResolvedValue(undefined),
    };

    await handler(interaction);

    expect(mockSafeEditReply).toHaveBeenCalledWith(interaction, {
      content: '❌ An error occurred processing your ticket.',
    });
  });

  it('rejects ticket close buttons outside ticket channels and threads', async () => {
    const client = createClient();
    registerTicketCloseButtonHandler(client);
    const handler = getRegisteredHandler(client);

    const interaction = {
      isButton: () => true,
      customId: 'ticket_close_42',
      guildId: 'guild-1',
      user: { id: 'user-1' },
      channel: { type: 5, isThread: () => false },
      deferReply: vi.fn().mockResolvedValue(undefined),
    };

    await handler(interaction);

    expect(mockSafeEditReply).toHaveBeenCalledWith(interaction, {
      content: '❌ This button can only be used inside a ticket channel or thread.',
    });
  });

  it('closes a ticket and reports success', async () => {
    mockCloseTicket.mockResolvedValueOnce({ id: 42 });
    const client = createClient();
    registerTicketCloseButtonHandler(client);
    const handler = getRegisteredHandler(client);

    const interaction = {
      isButton: () => true,
      customId: 'ticket_close_42',
      guildId: 'guild-1',
      user: { id: 'user-1' },
      channel: { id: 'thread-42', type: 0, isThread: () => false },
      deferReply: vi.fn().mockResolvedValue(undefined),
    };

    await handler(interaction);

    expect(mockCloseTicket).toHaveBeenCalledWith(
      interaction.channel,
      interaction.user,
      'Closed via button',
    );
    expect(mockSafeEditReply).toHaveBeenCalledWith(interaction, {
      content: '✅ Ticket #42 has been closed.',
    });
  });
});
