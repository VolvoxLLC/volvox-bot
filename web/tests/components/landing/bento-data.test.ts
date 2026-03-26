import { describe, expect, it } from 'vitest';
import {
  pickRandom,
  shuffleAndPick,
  generateChartHeights,
  MODERATION_POOL,
  CONVERSATION_POOL,
  AI_CHAT_POOL,
  TIMESTAMP_POOL,
} from '@/components/landing/bento/bento-data';

describe('bento-data', () => {
  describe('pickRandom', () => {
    it('should return an item from the array', () => {
      const items = ['a', 'b', 'c'];
      const result = pickRandom(items);
      expect(items).toContain(result);
    });
  });

  describe('shuffleAndPick', () => {
    it('should return the requested number of items', () => {
      const items = ['a', 'b', 'c', 'd', 'e'];
      const result = shuffleAndPick(items, 3);
      expect(result).toHaveLength(3);
    });

    it('should return items from the original array', () => {
      const items = ['a', 'b', 'c', 'd', 'e'];
      const result = shuffleAndPick(items, 3);
      for (const item of result) {
        expect(items).toContain(item);
      }
    });

    it('should not return duplicates', () => {
      const items = ['a', 'b', 'c', 'd', 'e'];
      const result = shuffleAndPick(items, 4);
      expect(new Set(result).size).toBe(4);
    });
  });

  describe('generateChartHeights', () => {
    it('should return 7 values', () => {
      const heights = generateChartHeights();
      expect(heights).toHaveLength(7);
    });

    it('should return values between 30 and 95', () => {
      const heights = generateChartHeights();
      for (const h of heights) {
        expect(h).toBeGreaterThanOrEqual(30);
        expect(h).toBeLessThanOrEqual(95);
      }
    });
  });

  describe('data pools', () => {
    it('should have at least 10 moderation templates', () => {
      expect(MODERATION_POOL.length).toBeGreaterThanOrEqual(10);
    });

    it('should have at least 6 AI chat conversations', () => {
      expect(AI_CHAT_POOL.length).toBeGreaterThanOrEqual(6);
    });

    it('should have at least 8 conversation previews', () => {
      expect(CONVERSATION_POOL.length).toBeGreaterThanOrEqual(8);
    });

    it('should have at least 6 timestamps', () => {
      expect(TIMESTAMP_POOL.length).toBeGreaterThanOrEqual(6);
    });

    it('moderation items should have severity and text', () => {
      for (const item of MODERATION_POOL) {
        expect(['red', 'amber', 'green']).toContain(item.severity);
        expect(item.text.length).toBeGreaterThan(0);
      }
    });

    it('AI chat items should have question and answer', () => {
      for (const item of AI_CHAT_POOL) {
        expect(item.question.length).toBeGreaterThan(0);
        expect(item.answer.length).toBeGreaterThan(0);
      }
    });
  });
});
