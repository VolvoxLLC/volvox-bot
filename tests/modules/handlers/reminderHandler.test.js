import { Events } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetConfig = vi.fn();
const mockHandleReminderSnooze = vi.fn();
const mockHandleReminderDismiss = vi.fn();
const mockSafeReply = vi.fn().mockResolvedValue(undefined);
const mockLogError = vi.fn();

vi.mock('../../../src/modules/config.js', () => ({
  getConfig: (...args) => mockGetConfig(...args),
}));

vi.mock('../../../src/modules/reminderHandler.js', () => ({
  handleReminderSnooze: (...args) => mockHandleReminderSnooze(...args),
  handleReminderDismiss: (...args) => mockHandleReminderDismiss(...args),
}));

vi.mock('../../../src/utils/safeSend.js', () => ({
  safeReply: (...args) => mockSafeReply(...args),
}));

vi.mock('../../../src/logger.js', () => ({
  error: (...args) => mockLogError(...args),
}));

import { registerReminderButtonHandler } from '../../../src/modules/handlers/reminderHandler.js';

function createClient() {
  return {
    on: vi.fn(),
  };
}

function getRegisteredHandler(client) {
  expect(client.on).toHaveBeenCalledWith(Events.InteractionCreate, expect.any(Function));
  return client.on.mock.calls[0][1];
}

describe('reminder button handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConfig.mockReturnValue({ reminders: { enabled: true } });
  });

  it('ignores non-button interactions', async () => {
    const client = createClient();
    registerReminderButtonHandler(client);
    const handler = getRegisteredHandler(client);

    await handler({ isButton: () => false });

    expect(mockHandleReminderSnooze).not.toHaveBeenCalled();
    expect(mockHandleReminderDismiss).not.toHaveBeenCalled();
  });

  it('ignores unrelated button custom ids', async () => {
    const client = createClient();
    registerReminderButtonHandler(client);
    const handler = getRegisteredHandler(client);

    await handler({
      isButton: () => true,
      customId: 'something_else',
    });

    expect(mockHandleReminderSnooze).not.toHaveBeenCalled();
    expect(mockHandleReminderDismiss).not.toHaveBeenCalled();
  });

  it('ignores reminder actions when reminders are disabled', async () => {
    mockGetConfig.mockReturnValueOnce({ reminders: { enabled: false } });
    const client = createClient();
    registerReminderButtonHandler(client);
    const handler = getRegisteredHandler(client);

    await handler({
      isButton: () => true,
      customId: 'reminder_snooze_42_600',
      guildId: 'guild-1',
    });

    expect(mockHandleReminderSnooze).not.toHaveBeenCalled();
  });

  it('routes snooze buttons to the snooze handler', async () => {
    const client = createClient();
    registerReminderButtonHandler(client);
    const handler = getRegisteredHandler(client);
    const interaction = {
      isButton: () => true,
      customId: 'reminder_snooze_42_600',
      guildId: 'guild-1',
    };

    await handler(interaction);

    expect(mockHandleReminderSnooze).toHaveBeenCalledWith(interaction);
    expect(mockHandleReminderDismiss).not.toHaveBeenCalled();
  });

  it('routes dismiss buttons to the dismiss handler', async () => {
    const client = createClient();
    registerReminderButtonHandler(client);
    const handler = getRegisteredHandler(client);
    const interaction = {
      isButton: () => true,
      customId: 'reminder_dismiss_42',
      guildId: 'guild-1',
    };

    await handler(interaction);

    expect(mockHandleReminderDismiss).toHaveBeenCalledWith(interaction);
    expect(mockHandleReminderSnooze).not.toHaveBeenCalled();
  });

  it('logs and replies when reminder handling fails before a response is sent', async () => {
    mockHandleReminderSnooze.mockRejectedValueOnce(new Error('bad snooze'));
    const client = createClient();
    registerReminderButtonHandler(client);
    const handler = getRegisteredHandler(client);
    const interaction = {
      isButton: () => true,
      customId: 'reminder_snooze_42_600',
      guildId: 'guild-1',
      user: { id: 'user-1' },
      replied: false,
      deferred: false,
    };

    await handler(interaction);

    expect(mockLogError).toHaveBeenCalledWith(
      'Reminder button handler failed',
      expect.objectContaining({ customId: 'reminder_snooze_42_600', userId: 'user-1', error: 'bad snooze' }),
    );
    expect(mockSafeReply).toHaveBeenCalledWith(interaction, {
      content: '❌ Something went wrong processing your request.',
      ephemeral: true,
    });
  });

  it('skips the fallback reply when the interaction is already deferred', async () => {
    mockHandleReminderDismiss.mockRejectedValueOnce(new Error('bad dismiss'));
    const client = createClient();
    registerReminderButtonHandler(client);
    const handler = getRegisteredHandler(client);

    await handler({
      isButton: () => true,
      customId: 'reminder_dismiss_42',
      guildId: 'guild-1',
      user: { id: 'user-1' },
      replied: false,
      deferred: true,
    });

    expect(mockSafeReply).not.toHaveBeenCalled();
  });
});
