import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger to prevent file-system side effects in tests
vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

// Mock splitMessage — default to no splitting; individual tests override
vi.mock('../../src/utils/splitMessage.js', () => ({
  needsSplitting: vi.fn().mockReturnValue(false),
  splitMessage: vi.fn().mockReturnValue([]),
}));

import { safeEditReply, safeFollowUp, safeReply, safeSend } from '../../src/utils/safeSend.js';
import { needsSplitting, splitMessage } from '../../src/utils/splitMessage.js';

const ZWS = '\u200B';
const SAFE_ALLOWED_MENTIONS = { parse: ['users'] };

describe('safeSend', () => {
  let mockChannel;

  beforeEach(() => {
    mockChannel = {
      send: vi.fn().mockResolvedValue({ id: 'msg-1' }),
    };
  });

  it('should sanitize content and add allowedMentions for string input', async () => {
    await safeSend(mockChannel, '@everyone hello');
    expect(mockChannel.send).toHaveBeenCalledWith({
      content: `@${ZWS}everyone hello`,
      allowedMentions: SAFE_ALLOWED_MENTIONS,
    });
  });

  it('should sanitize content and add allowedMentions for object input', async () => {
    await safeSend(mockChannel, { content: '@here world', embeds: [] });
    expect(mockChannel.send).toHaveBeenCalledWith({
      content: `@${ZWS}here world`,
      embeds: [],
      allowedMentions: SAFE_ALLOWED_MENTIONS,
    });
  });

  it('should override existing allowedMentions with safe defaults', async () => {
    await safeSend(mockChannel, {
      content: 'test',
      allowedMentions: { parse: ['everyone', 'roles', 'users'] },
    });
    expect(mockChannel.send).toHaveBeenCalledWith({
      content: 'test',
      allowedMentions: SAFE_ALLOWED_MENTIONS,
    });
  });

  it('should preserve normal user mentions in content', async () => {
    await safeSend(mockChannel, '<@123456789> check this out');
    expect(mockChannel.send).toHaveBeenCalledWith({
      content: '<@123456789> check this out',
      allowedMentions: SAFE_ALLOWED_MENTIONS,
    });
  });

  it('should return the result from channel.send', async () => {
    const result = await safeSend(mockChannel, 'hello');
    expect(result).toEqual({ id: 'msg-1' });
  });
});

describe('safeReply', () => {
  let mockInteraction;

  beforeEach(() => {
    mockInteraction = {
      reply: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('should sanitize content and add allowedMentions for string input', async () => {
    await safeReply(mockInteraction, '@everyone check');
    expect(mockInteraction.reply).toHaveBeenCalledWith({
      content: `@${ZWS}everyone check`,
      allowedMentions: SAFE_ALLOWED_MENTIONS,
    });
  });

  it('should sanitize content in object input', async () => {
    await safeReply(mockInteraction, { content: '@here ping', ephemeral: true });
    expect(mockInteraction.reply).toHaveBeenCalledWith({
      content: `@${ZWS}here ping`,
      ephemeral: true,
      allowedMentions: SAFE_ALLOWED_MENTIONS,
    });
  });

  it('should handle options without content', async () => {
    await safeReply(mockInteraction, { embeds: [{ title: 'test' }] });
    expect(mockInteraction.reply).toHaveBeenCalledWith({
      embeds: [{ title: 'test' }],
      allowedMentions: SAFE_ALLOWED_MENTIONS,
    });
  });
});

describe('safeFollowUp', () => {
  let mockInteraction;

  beforeEach(() => {
    mockInteraction = {
      followUp: vi.fn().mockResolvedValue({ id: 'msg-2' }),
    };
  });

  it('should sanitize content and add allowedMentions for string input', async () => {
    await safeFollowUp(mockInteraction, '@everyone update');
    expect(mockInteraction.followUp).toHaveBeenCalledWith({
      content: `@${ZWS}everyone update`,
      allowedMentions: SAFE_ALLOWED_MENTIONS,
    });
  });

  it('should sanitize content in object input', async () => {
    await safeFollowUp(mockInteraction, { content: '@here news' });
    expect(mockInteraction.followUp).toHaveBeenCalledWith({
      content: `@${ZWS}here news`,
      allowedMentions: SAFE_ALLOWED_MENTIONS,
    });
  });

  it('should return the result from interaction.followUp', async () => {
    const result = await safeFollowUp(mockInteraction, 'hello');
    expect(result).toEqual({ id: 'msg-2' });
  });
});

describe('safeEditReply', () => {
  let mockInteraction;

  beforeEach(() => {
    mockInteraction = {
      editReply: vi.fn().mockResolvedValue({ id: 'msg-3' }),
    };
  });

  it('should sanitize content and add allowedMentions for string input', async () => {
    await safeEditReply(mockInteraction, '@everyone edited');
    expect(mockInteraction.editReply).toHaveBeenCalledWith({
      content: `@${ZWS}everyone edited`,
      allowedMentions: SAFE_ALLOWED_MENTIONS,
    });
  });

  it('should sanitize content in object input', async () => {
    await safeEditReply(mockInteraction, { content: '@here updated' });
    expect(mockInteraction.editReply).toHaveBeenCalledWith({
      content: `@${ZWS}here updated`,
      allowedMentions: SAFE_ALLOWED_MENTIONS,
    });
  });

  it('should return the result from interaction.editReply', async () => {
    const result = await safeEditReply(mockInteraction, 'hello');
    expect(result).toEqual({ id: 'msg-3' });
  });
});

describe('allowedMentions override enforcement', () => {
  it('safeReply should override caller-supplied allowedMentions', async () => {
    const mockTarget = { reply: vi.fn().mockResolvedValue(undefined) };
    await safeReply(mockTarget, {
      content: 'test',
      allowedMentions: { parse: ['everyone', 'roles', 'users'] },
    });
    expect(mockTarget.reply).toHaveBeenCalledWith(
      expect.objectContaining({ allowedMentions: SAFE_ALLOWED_MENTIONS }),
    );
  });

  it('safeFollowUp should override caller-supplied allowedMentions', async () => {
    const mockInteraction = { followUp: vi.fn().mockResolvedValue({ id: 'msg-4' }) };
    await safeFollowUp(mockInteraction, {
      content: 'test',
      allowedMentions: { parse: ['everyone'] },
    });
    expect(mockInteraction.followUp).toHaveBeenCalledWith(
      expect.objectContaining({ allowedMentions: SAFE_ALLOWED_MENTIONS }),
    );
  });

  it('safeEditReply should override caller-supplied allowedMentions', async () => {
    const mockInteraction = { editReply: vi.fn().mockResolvedValue({ id: 'msg-5' }) };
    await safeEditReply(mockInteraction, {
      content: 'test',
      allowedMentions: { parse: ['everyone', 'roles'] },
    });
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ allowedMentions: SAFE_ALLOWED_MENTIONS }),
    );
  });
});

describe('splitMessage integration', () => {
  it('safeSend should split long content into multiple sends', async () => {
    needsSplitting.mockReturnValueOnce(true);
    splitMessage.mockReturnValueOnce(['chunk1', 'chunk2']);
    const mockChannel = { send: vi.fn().mockResolvedValue({ id: 'msg' }) };

    const result = await safeSend(mockChannel, 'a'.repeat(2500));
    expect(mockChannel.send).toHaveBeenCalledTimes(2);
    expect(mockChannel.send).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'chunk1', allowedMentions: SAFE_ALLOWED_MENTIONS }),
    );
    expect(mockChannel.send).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'chunk2', allowedMentions: SAFE_ALLOWED_MENTIONS }),
    );
    expect(result).toHaveLength(2);
  });

  it('safeReply should split long content into multiple sends', async () => {
    needsSplitting.mockReturnValueOnce(true);
    splitMessage.mockReturnValueOnce(['part1', 'part2', 'part3']);
    const mockTarget = { reply: vi.fn().mockResolvedValue({ id: 'msg' }) };

    const result = await safeReply(mockTarget, 'b'.repeat(3000));
    expect(mockTarget.reply).toHaveBeenCalledTimes(3);
    expect(result).toHaveLength(3);
  });

  it('safeFollowUp should split long content into multiple sends', async () => {
    needsSplitting.mockReturnValueOnce(true);
    splitMessage.mockReturnValueOnce(['f1', 'f2']);
    const mockInteraction = { followUp: vi.fn().mockResolvedValue({ id: 'msg' }) };

    const result = await safeFollowUp(mockInteraction, 'c'.repeat(2500));
    expect(mockInteraction.followUp).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
  });

  it('safeEditReply should split long content into multiple sends', async () => {
    needsSplitting.mockReturnValueOnce(true);
    splitMessage.mockReturnValueOnce(['e1', 'e2']);
    const mockInteraction = { editReply: vi.fn().mockResolvedValue({ id: 'msg' }) };

    const result = await safeEditReply(mockInteraction, 'd'.repeat(2500));
    expect(mockInteraction.editReply).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
  });
});

describe('Winston error logging', () => {
  it('safeSend should log and rethrow on error', async () => {
    const { error: mockLogError } = await import('../../src/logger.js');
    const mockChannel = { send: vi.fn().mockRejectedValue(new Error('send failed')) };

    await expect(safeSend(mockChannel, 'test')).rejects.toThrow('send failed');
    expect(mockLogError).toHaveBeenCalledWith('safeSend failed', { error: 'send failed' });
  });

  it('safeReply should log and rethrow on error', async () => {
    const { error: mockLogError } = await import('../../src/logger.js');
    const mockTarget = { reply: vi.fn().mockRejectedValue(new Error('reply failed')) };

    await expect(safeReply(mockTarget, 'test')).rejects.toThrow('reply failed');
    expect(mockLogError).toHaveBeenCalledWith('safeReply failed', { error: 'reply failed' });
  });

  it('safeFollowUp should log and rethrow on error', async () => {
    const { error: mockLogError } = await import('../../src/logger.js');
    const mockInteraction = {
      followUp: vi.fn().mockRejectedValue(new Error('followUp failed')),
    };

    await expect(safeFollowUp(mockInteraction, 'test')).rejects.toThrow('followUp failed');
    expect(mockLogError).toHaveBeenCalledWith('safeFollowUp failed', {
      error: 'followUp failed',
    });
  });

  it('safeEditReply should log and rethrow on error', async () => {
    const { error: mockLogError } = await import('../../src/logger.js');
    const mockInteraction = {
      editReply: vi.fn().mockRejectedValue(new Error('editReply failed')),
    };

    await expect(safeEditReply(mockInteraction, 'test')).rejects.toThrow('editReply failed');
    expect(mockLogError).toHaveBeenCalledWith('safeEditReply failed', {
      error: 'editReply failed',
    });
  });
});
