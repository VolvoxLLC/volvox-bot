/**
 * Tests for src/modules/triage-filter.js
 * Covers uncovered branches: sanitizeText null, isModerationKeyword empty,
 * checkTriggerWords no-match, resolveMessageId fallbacks.
 */
import { describe, expect, it } from 'vitest';
import {
  checkTriggerWords,
  isModerationKeyword,
  resolveMessageId,
  sanitizeText,
} from '../../src/modules/triage-filter.js';

describe('sanitizeText', () => {
  it('should return null when str is null', () => {
    expect(sanitizeText(null)).toBeNull();
  });

  it('should return undefined when str is undefined', () => {
    expect(sanitizeText(undefined)).toBeUndefined();
  });

  it('should return empty string unchanged', () => {
    expect(sanitizeText('')).toBe('');
  });

  it('should return clean text unchanged', () => {
    expect(sanitizeText('hello world')).toBe('hello world');
  });

  it('should replace lone surrogates with replacement character', () => {
    const withLoneSurrogate = 'text\uD800more';
    expect(sanitizeText(withLoneSurrogate)).toContain('\uFFFD');
  });
});

describe('isModerationKeyword', () => {
  it('should return false when keywords array is empty', () => {
    const config = { triage: { moderationKeywords: [] } };
    expect(isModerationKeyword('anything here', config)).toBe(false);
  });

  it('should return false when no keywords configured', () => {
    const config = { triage: {} };
    expect(isModerationKeyword('anything', config)).toBe(false);
  });

  it('should return true when content matches a keyword', () => {
    const config = { triage: { moderationKeywords: ['ban', 'spam'] } };
    expect(isModerationKeyword('this is spam content', config)).toBe(true);
  });

  it('should return false when content does not match any keyword', () => {
    const config = { triage: { moderationKeywords: ['badword', 'illegal'] } };
    expect(isModerationKeyword('totally normal text', config)).toBe(false);
  });
});

describe('checkTriggerWords', () => {
  it('should return false when no trigger words configured', () => {
    const config = { triage: { triggerWords: [] } };
    expect(checkTriggerWords('anything', config)).toBe(false);
  });

  it('should return true when trigger word matches', () => {
    const config = { triage: { triggerWords: ['help', 'urgent'] } };
    expect(checkTriggerWords('I need help now', config)).toBe(true);
  });

  it('should fall through to isModerationKeyword when no trigger words match', () => {
    const config = {
      triage: {
        triggerWords: ['urgent'],
        moderationKeywords: ['spam'],
      },
    };
    // No trigger match, but has moderation keyword
    expect(checkTriggerWords('spam content here', config)).toBe(true);
  });

  it('should return false when nothing matches', () => {
    const config = {
      triage: {
        triggerWords: ['urgent'],
        moderationKeywords: ['badword'],
      },
    };
    expect(checkTriggerWords('totally normal text', config)).toBe(false);
  });
});

describe('resolveMessageId', () => {
  const snapshot = [
    { messageId: 'msg1', author: 'Alice' },
    { messageId: 'msg2', author: 'Bob' },
    { messageId: 'msg3', author: 'Alice' },
  ];

  it('should return targetMessageId when it exists in snapshot', () => {
    const result = resolveMessageId('msg2', 'Alice', snapshot);
    expect(result).toBe('msg2');
  });

  it('should find last message from targetUser when targetMessageId not in snapshot', () => {
    const result = resolveMessageId('unknown-id', 'Alice', snapshot);
    expect(result).toBe('msg3');
  });

  it('should fall back to last message when targetUser has no messages in snapshot', () => {
    const result = resolveMessageId('unknown-id', 'Charlie', snapshot);
    expect(result).toBe('msg3'); // last message in snapshot
  });

  it('should fall back to last message when no targetUser provided', () => {
    const result = resolveMessageId('unknown-id', null, snapshot);
    expect(result).toBe('msg3');
  });

  it('should return null when snapshot is empty', () => {
    const result = resolveMessageId('msg1', 'Alice', []);
    expect(result).toBeNull();
  });

  it('should return null when snapshot is empty and no user', () => {
    const result = resolveMessageId(null, null, []);
    expect(result).toBeNull();
  });
});
