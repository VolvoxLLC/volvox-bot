import { Events } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLogError = vi.fn();
const mockIsAiMessage = vi.fn();
const mockRecordFeedback = vi.fn();
const mockDeleteFeedback = vi.fn();
const mockGetConfig = vi.fn();
const mockTrackReaction = vi.fn();
const mockHandleReactionRoleAdd = vi.fn();
const mockHandleReactionRoleRemove = vi.fn();
const mockHandleReactionAdd = vi.fn();
const mockHandleReactionRemove = vi.fn();

vi.mock('../../src/logger.js', () => ({
  error: (...args) => mockLogError(...args),
}));

vi.mock('../../src/modules/aiFeedback.js', () => ({
  FEEDBACK_EMOJI: { positive: '👍', negative: '👎' },
  isAiMessage: (...args) => mockIsAiMessage(...args),
  recordFeedback: (...args) => mockRecordFeedback(...args),
  deleteFeedback: (...args) => mockDeleteFeedback(...args),
}));

vi.mock('../../src/modules/config.js', () => ({
  getConfig: (...args) => mockGetConfig(...args),
}));

vi.mock('../../src/modules/engagement.js', () => ({
  trackReaction: (...args) => mockTrackReaction(...args),
}));

vi.mock('../../src/modules/reactionRoles.js', () => ({
  handleReactionRoleAdd: (...args) => mockHandleReactionRoleAdd(...args),
  handleReactionRoleRemove: (...args) => mockHandleReactionRoleRemove(...args),
}));

vi.mock('../../src/modules/starboard.js', () => ({
  handleReactionAdd: (...args) => mockHandleReactionAdd(...args),
  handleReactionRemove: (...args) => mockHandleReactionRemove(...args),
}));

import { registerReactionHandlers } from '../../src/modules/events/reactions.js';

function createReaction(emojiName = '👍') {
  return {
    emoji: { name: emojiName },
    message: {
      id: 'message-1',
      channel: { id: 'channel-1' },
      channelId: 'channel-1',
      guild: { id: 'guild-1' },
      partial: false,
    },
  };
}

function getHandlers() {
  const handlers = new Map();
  const client = {
    on: vi.fn((event, handler) => handlers.set(event, handler)),
  };

  registerReactionHandlers(client, {});

  expect(handlers.get(Events.MessageReactionAdd)).toBeTypeOf('function');
  expect(handlers.get(Events.MessageReactionRemove)).toBeTypeOf('function');

  return {
    client,
    addHandler: handlers.get(Events.MessageReactionAdd),
    removeHandler: handlers.get(Events.MessageReactionRemove),
  };
}

describe('reaction event branch coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConfig.mockReturnValue({
      ai: { feedback: { enabled: true } },
      starboard: { enabled: true },
    });
    mockTrackReaction.mockReturnValue(Promise.resolve());
    mockHandleReactionRoleAdd.mockResolvedValue(undefined);
    mockHandleReactionRoleRemove.mockResolvedValue(undefined);
    mockHandleReactionAdd.mockResolvedValue(undefined);
    mockHandleReactionRemove.mockResolvedValue(undefined);
    mockRecordFeedback.mockReturnValue(Promise.resolve());
    mockDeleteFeedback.mockReturnValue(Promise.resolve());
  });

  it('records positive AI feedback on reaction add', async () => {
    mockIsAiMessage.mockReturnValue(true);
    const { addHandler } = getHandlers();
    const reaction = createReaction('👍');

    await addHandler(reaction, { id: 'user-1', bot: false });

    expect(mockTrackReaction).toHaveBeenCalled();
    expect(mockRecordFeedback).toHaveBeenCalledWith({
      messageId: 'message-1',
      channelId: 'channel-1',
      guildId: 'guild-1',
      userId: 'user-1',
      feedbackType: 'positive',
    });
    expect(mockHandleReactionAdd).toHaveBeenCalled();
  });

  it('skips AI feedback recording for non-feedback emojis', async () => {
    mockIsAiMessage.mockReturnValue(true);
    const { addHandler } = getHandlers();

    await addHandler(createReaction('🔥'), { id: 'user-1', bot: false });

    expect(mockRecordFeedback).not.toHaveBeenCalled();
  });

  it('logs reaction role add failures without breaking the handler', async () => {
    mockIsAiMessage.mockReturnValue(false);
    mockHandleReactionRoleAdd.mockRejectedValueOnce(new Error('role add failed'));
    const { addHandler } = getHandlers();

    await addHandler(createReaction('👍'), { id: 'user-1', bot: false });

    expect(mockLogError).toHaveBeenCalledWith(
      'Reaction role add handler failed',
      expect.objectContaining({ messageId: 'message-1', error: 'role add failed' }),
    );
    expect(mockHandleReactionAdd).toHaveBeenCalled();
  });

  it('deletes AI feedback on supported reaction removal', async () => {
    mockIsAiMessage.mockReturnValue(true);
    const { removeHandler } = getHandlers();

    await removeHandler(createReaction('👎'), { id: 'user-1', bot: false });

    expect(mockDeleteFeedback).toHaveBeenCalledWith({
      messageId: 'message-1',
      userId: 'user-1',
    });
    expect(mockHandleReactionRemove).toHaveBeenCalled();
  });

  it('skips deleteFeedback for non-feedback reaction removal', async () => {
    mockIsAiMessage.mockReturnValue(true);
    const { removeHandler } = getHandlers();

    await removeHandler(createReaction('🔥'), { id: 'user-1', bot: false });

    expect(mockDeleteFeedback).not.toHaveBeenCalled();
  });

  it('logs reaction role remove failures without breaking removal handling', async () => {
    mockIsAiMessage.mockReturnValue(false);
    mockHandleReactionRoleRemove.mockRejectedValueOnce(new Error('role remove failed'));
    const { removeHandler } = getHandlers();

    await removeHandler(createReaction('👍'), { id: 'user-1', bot: false });

    expect(mockLogError).toHaveBeenCalledWith(
      'Reaction role remove handler failed',
      expect.objectContaining({ messageId: 'message-1', error: 'role remove failed' }),
    );
    expect(mockHandleReactionRemove).toHaveBeenCalled();
  });
});
