import { beforeEach, describe, expect, it, vi } from 'vitest';
import { safeEditReply, safeFollowUp, safeReply, safeSend } from '../../src/utils/safeSend.js';

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
