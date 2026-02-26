import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

import { warn } from '../../src/logger.js';
import {
  CHANNEL_INACTIVE_MS,
  channelBuffers,
  clearEvaluatedMessages,
  consumePendingReeval,
  evictInactiveChannels,
  getBuffer,
  MAX_TRACKED_CHANNELS,
  pushToBuffer,
} from '../../src/modules/triage-buffer.js';

describe('triage-buffer', () => {
  beforeEach(() => {
    channelBuffers.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    channelBuffers.clear();
  });

  describe('getBuffer', () => {
    it('should create a new buffer for an unknown channel', () => {
      const buf = getBuffer('ch-1');
      expect(buf.messages).toEqual([]);
      expect(buf.evaluating).toBe(false);
      expect(buf.pendingReeval).toBe(false);
      expect(channelBuffers.size).toBe(1);
    });

    it('should return existing buffer and update lastActivity', () => {
      const buf1 = getBuffer('ch-1');
      const firstActivity = buf1.lastActivity;
      const buf2 = getBuffer('ch-1');
      expect(buf2).toBe(buf1);
      expect(buf2.lastActivity).toBeGreaterThanOrEqual(firstActivity);
    });
  });

  describe('pushToBuffer', () => {
    it('should append entry and trim when exceeding maxBufferSize', () => {
      const entry1 = { author: 'A', content: 'msg1', userId: 'u1', messageId: 'm1', timestamp: 1 };
      const entry2 = { author: 'B', content: 'msg2', userId: 'u2', messageId: 'm2', timestamp: 2 };
      const entry3 = { author: 'C', content: 'msg3', userId: 'u3', messageId: 'm3', timestamp: 3 };

      pushToBuffer('ch-1', entry1, 2);
      pushToBuffer('ch-1', entry2, 2);
      pushToBuffer('ch-1', entry3, 2);

      const buf = channelBuffers.get('ch-1');
      expect(buf.messages).toHaveLength(2);
      expect(buf.messages[0].messageId).toBe('m2');
      expect(buf.messages[1].messageId).toBe('m3');
      expect(warn).toHaveBeenCalledWith(
        'Buffer truncation dropping messages',
        expect.objectContaining({ dropped: 1 }),
      );
    });
  });

  describe('evictInactiveChannels', () => {
    it('should evict channels inactive longer than CHANNEL_INACTIVE_MS', () => {
      const buf = getBuffer('stale-ch');
      buf.lastActivity = Date.now() - CHANNEL_INACTIVE_MS - 1;

      evictInactiveChannels();

      expect(channelBuffers.has('stale-ch')).toBe(false);
    });

    it('should evict oldest when over MAX_TRACKED_CHANNELS', () => {
      for (let i = 0; i < MAX_TRACKED_CHANNELS + 5; i++) {
        const buf = getBuffer(`ch-${i}`);
        buf.lastActivity = Date.now() + i;
      }

      evictInactiveChannels();

      expect(channelBuffers.size).toBeLessThanOrEqual(MAX_TRACKED_CHANNELS);
    });
  });

  describe('clearEvaluatedMessages', () => {
    it('should remove messages with matching IDs and keep the rest', () => {
      pushToBuffer(
        'ch-1',
        { author: 'A', content: 'a', userId: 'u1', messageId: 'm1', timestamp: 1 },
        10,
      );
      pushToBuffer(
        'ch-1',
        { author: 'B', content: 'b', userId: 'u2', messageId: 'm2', timestamp: 2 },
        10,
      );

      clearEvaluatedMessages('ch-1', new Set(['m1']));

      const buf = channelBuffers.get('ch-1');
      expect(buf.messages).toHaveLength(1);
      expect(buf.messages[0].messageId).toBe('m2');
    });
  });

  describe('consumePendingReeval', () => {
    it('should return false and reset the flag when pending', () => {
      const buf = getBuffer('ch-1');
      buf.pendingReeval = true;

      expect(consumePendingReeval('ch-1')).toBe(true);
      expect(buf.pendingReeval).toBe(false);
    });

    it('should return false for non-existent channel', () => {
      expect(consumePendingReeval('unknown')).toBe(false);
    });
  });
});
