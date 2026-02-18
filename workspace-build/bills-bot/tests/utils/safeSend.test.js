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
  DISCORD_MAX_LENGTH: 2000,
  needsSplitting: vi.fn().mockReturnValue(false),
  splitMessage: vi.fn().mockReturnValue([]),
}));

import { error as mockLogError, warn as mockLogWarn } from '../../src/logger.js';
import {
  safeEditReply,
  safeFollowUp,
  safeReply,
  safeSend,
  safeUpdate,
} from '../../src/utils/safeSend.js';
import { needsSplitting, splitMessage } from '../../src/utils/splitMessage.js';

const ZWS = '\u200B';
const SAFE_ALLOWED_MENTIONS = { parse: ['users'] };

// Clear all mocks between tests to prevent cross-test pollution
// of module-level mock functions (mockLogError, mockLogWarn, splitMessage mocks)
beforeEach(() => {
  vi.clearAllMocks();
});

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

  it('should sanitize embed fields in addition to content', async () => {
    await safeSend(mockChannel, {
      content: 'test',
      embeds: [{ title: '@everyone alert', description: '@here check' }],
    });
    expect(mockChannel.send).toHaveBeenCalledWith({
      content: 'test',
      embeds: [{ title: `@${ZWS}everyone alert`, description: `@${ZWS}here check` }],
      allowedMentions: SAFE_ALLOWED_MENTIONS,
    });
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

describe('safeUpdate', () => {
  let mockInteraction;

  beforeEach(() => {
    mockInteraction = {
      update: vi.fn().mockResolvedValue({ id: 'msg-6' }),
    };
  });

  it('should sanitize content and add allowedMentions for string input', async () => {
    await safeUpdate(mockInteraction, '@everyone updated');
    expect(mockInteraction.update).toHaveBeenCalledWith({
      content: `@${ZWS}everyone updated`,
      allowedMentions: SAFE_ALLOWED_MENTIONS,
    });
  });

  it('should sanitize content in object input', async () => {
    await safeUpdate(mockInteraction, { content: '@here clicked', components: [] });
    expect(mockInteraction.update).toHaveBeenCalledWith({
      content: `@${ZWS}here clicked`,
      components: [],
      allowedMentions: SAFE_ALLOWED_MENTIONS,
    });
  });

  it('should return the result from interaction.update', async () => {
    const result = await safeUpdate(mockInteraction, 'hello');
    expect(result).toEqual({ id: 'msg-6' });
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

  it('safeUpdate should override caller-supplied allowedMentions', async () => {
    const mockInteraction = { update: vi.fn().mockResolvedValue({ id: 'msg-6' }) };
    await safeUpdate(mockInteraction, {
      content: 'test',
      allowedMentions: { parse: ['everyone', 'roles'] },
    });
    expect(mockInteraction.update).toHaveBeenCalledWith(
      expect.objectContaining({ allowedMentions: SAFE_ALLOWED_MENTIONS }),
    );
  });
});

describe('splitMessage integration (channel.send only)', () => {
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

  it('should only include embeds/components on the last chunk', async () => {
    needsSplitting.mockReturnValueOnce(true);
    splitMessage.mockReturnValueOnce(['chunk1', 'chunk2', 'chunk3']);
    const mockChannel = { send: vi.fn().mockResolvedValue({ id: 'msg' }) };

    await safeSend(mockChannel, {
      content: 'a'.repeat(5000),
      embeds: [{ title: 'test' }],
      components: [{ type: 1 }],
    });

    expect(mockChannel.send).toHaveBeenCalledTimes(3);

    // First two chunks: content + allowedMentions only (no embeds, no components)
    const call0 = mockChannel.send.mock.calls[0][0];
    expect(call0).toEqual({ content: 'chunk1', allowedMentions: SAFE_ALLOWED_MENTIONS });

    const call1 = mockChannel.send.mock.calls[1][0];
    expect(call1).toEqual({ content: 'chunk2', allowedMentions: SAFE_ALLOWED_MENTIONS });

    // Last chunk: full payload with embeds and components
    const call2 = mockChannel.send.mock.calls[2][0];
    expect(call2).toEqual({
      content: 'chunk3',
      embeds: [{ title: 'test' }],
      components: [{ type: 1 }],
      allowedMentions: SAFE_ALLOWED_MENTIONS,
    });
  });
});

describe('interaction truncation (reply/editReply/followUp)', () => {
  const TRUNCATION_SUFFIX = '… [truncated]';

  it('safeReply should truncate long content with indicator instead of splitting', async () => {
    const longContent = 'x'.repeat(2500);
    const mockTarget = { reply: vi.fn().mockResolvedValue({ id: 'msg' }) };

    await safeReply(mockTarget, longContent);

    expect(mockTarget.reply).toHaveBeenCalledTimes(1);
    const sentContent = mockTarget.reply.mock.calls[0][0].content;
    expect(sentContent).toHaveLength(2000);
    expect(sentContent.endsWith(TRUNCATION_SUFFIX)).toBe(true);
  });

  it('safeReply should log a warning when truncating', async () => {
    const longContent = 'x'.repeat(2500);
    const mockTarget = { reply: vi.fn().mockResolvedValue({ id: 'msg' }) };

    await safeReply(mockTarget, longContent);

    expect(mockLogWarn).toHaveBeenCalledWith('Interaction content truncated', {
      originalLength: 2500,
      maxLength: 2000,
    });
  });

  it('safeFollowUp should truncate long content with indicator instead of splitting', async () => {
    const longContent = 'y'.repeat(2500);
    const mockInteraction = { followUp: vi.fn().mockResolvedValue({ id: 'msg' }) };

    await safeFollowUp(mockInteraction, longContent);

    expect(mockInteraction.followUp).toHaveBeenCalledTimes(1);
    const sentContent = mockInteraction.followUp.mock.calls[0][0].content;
    expect(sentContent).toHaveLength(2000);
    expect(sentContent.endsWith(TRUNCATION_SUFFIX)).toBe(true);
  });

  it('safeEditReply should truncate long content with indicator instead of splitting', async () => {
    const longContent = 'z'.repeat(2500);
    const mockInteraction = { editReply: vi.fn().mockResolvedValue({ id: 'msg' }) };

    await safeEditReply(mockInteraction, longContent);

    expect(mockInteraction.editReply).toHaveBeenCalledTimes(1);
    const sentContent = mockInteraction.editReply.mock.calls[0][0].content;
    expect(sentContent).toHaveLength(2000);
    expect(sentContent.endsWith(TRUNCATION_SUFFIX)).toBe(true);
  });

  it('safeReply should not truncate content within limit', async () => {
    const shortContent = 'hello world';
    const mockTarget = { reply: vi.fn().mockResolvedValue({ id: 'msg' }) };

    await safeReply(mockTarget, shortContent);

    expect(mockTarget.reply.mock.calls[0][0].content).toBe('hello world');
  });

  it('safeUpdate should truncate long content with indicator instead of splitting', async () => {
    const longContent = 'w'.repeat(2500);
    const mockInteraction = { update: vi.fn().mockResolvedValue({ id: 'msg' }) };

    await safeUpdate(mockInteraction, longContent);

    expect(mockInteraction.update).toHaveBeenCalledTimes(1);
    const sentContent = mockInteraction.update.mock.calls[0][0].content;
    expect(sentContent).toHaveLength(2000);
    expect(sentContent.endsWith(TRUNCATION_SUFFIX)).toBe(true);
  });

  it('safeReply should handle non-string content unchanged', async () => {
    const mockTarget = { reply: vi.fn().mockResolvedValue({ id: 'msg' }) };

    await safeReply(mockTarget, { embeds: [{ title: 'test' }] });

    expect(mockTarget.reply).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: [{ title: 'test' }] }),
    );
  });
});

describe('Winston error logging', () => {
  it('safeSend should log error with stack trace and rethrow', async () => {
    const err = new Error('send failed');
    const mockChannel = { send: vi.fn().mockRejectedValue(err) };

    await expect(safeSend(mockChannel, 'test')).rejects.toThrow('send failed');
    expect(mockLogError).toHaveBeenCalledWith('safeSend failed', {
      error: 'send failed',
      stack: err.stack,
    });
  });

  it('safeReply should log error with stack trace and rethrow', async () => {
    const err = new Error('reply failed');
    const mockTarget = { reply: vi.fn().mockRejectedValue(err) };

    await expect(safeReply(mockTarget, 'test')).rejects.toThrow('reply failed');
    expect(mockLogError).toHaveBeenCalledWith('safeReply failed', {
      error: 'reply failed',
      stack: err.stack,
    });
  });

  it('safeFollowUp should log error with stack trace and rethrow', async () => {
    const err = new Error('followUp failed');
    const mockInteraction = { followUp: vi.fn().mockRejectedValue(err) };

    await expect(safeFollowUp(mockInteraction, 'test')).rejects.toThrow('followUp failed');
    expect(mockLogError).toHaveBeenCalledWith('safeFollowUp failed', {
      error: 'followUp failed',
      stack: err.stack,
    });
  });

  it('safeEditReply should log error with stack trace and rethrow', async () => {
    const err = new Error('editReply failed');
    const mockInteraction = { editReply: vi.fn().mockRejectedValue(err) };

    await expect(safeEditReply(mockInteraction, 'test')).rejects.toThrow('editReply failed');
    expect(mockLogError).toHaveBeenCalledWith('safeEditReply failed', {
      error: 'editReply failed',
      stack: err.stack,
    });
  });

  it('safeUpdate should log error with stack trace and rethrow', async () => {
    const err = new Error('update failed');
    const mockInteraction = { update: vi.fn().mockRejectedValue(err) };

    await expect(safeUpdate(mockInteraction, 'test')).rejects.toThrow('update failed');
    expect(mockLogError).toHaveBeenCalledWith('safeUpdate failed', {
      error: 'update failed',
      stack: err.stack,
    });
  });
});
