/**
 * ConflictService Tests
 * Tests conflict marker parsing (pure logic).
 * Git-dependent methods are not tested here.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictService } from '../services/conflict-service.js';

// Mock dependencies
vi.mock('../services/config-service.js', () => ({
  ConfigService: class MockConfigService {
    getConfig = vi.fn().mockResolvedValue({ repos: [] });
  },
}));

vi.mock('../services/task-service.js', () => ({
  TaskService: class MockTaskService {
    getTask = vi.fn();
    listTasks = vi.fn().mockResolvedValue([]);
  },
}));

describe('ConflictService', () => {
  let service: ConflictService;

  beforeEach(() => {
    service = new ConflictService();
  });

  describe('parseConflictMarkers (private)', () => {
    const parseMarkers = (content: string) => {
      return (service as any).parseConflictMarkers(content);
    };

    it('should return empty array for content with no conflicts', () => {
      const content = `line 1
line 2
line 3`;
      expect(parseMarkers(content)).toEqual([]);
    });

    it('should parse a single conflict marker', () => {
      const content = `line before
<<<<<<< HEAD
our change
=======
their change
>>>>>>> feature-branch
line after`;

      const markers = parseMarkers(content);
      expect(markers).toHaveLength(1);
      expect(markers[0].startLine).toBe(1);
      expect(markers[0].separatorLine).toBe(3);
      expect(markers[0].endLine).toBe(5);
      expect(markers[0].oursLines).toEqual(['our change']);
      expect(markers[0].theirsLines).toEqual(['their change']);
    });

    it('should parse multiple conflict markers', () => {
      const content = `start
<<<<<<< HEAD
our first
=======
their first
>>>>>>> branch
middle
<<<<<<< HEAD
our second
=======
their second
>>>>>>> branch
end`;

      const markers = parseMarkers(content);
      expect(markers).toHaveLength(2);
      expect(markers[0].oursLines).toEqual(['our first']);
      expect(markers[0].theirsLines).toEqual(['their first']);
      expect(markers[1].oursLines).toEqual(['our second']);
      expect(markers[1].theirsLines).toEqual(['their second']);
    });

    it('should handle multi-line conflicts', () => {
      const content = `<<<<<<< HEAD
our line 1
our line 2
our line 3
=======
their line 1
their line 2
>>>>>>> branch`;

      const markers = parseMarkers(content);
      expect(markers).toHaveLength(1);
      expect(markers[0].oursLines).toEqual(['our line 1', 'our line 2', 'our line 3']);
      expect(markers[0].theirsLines).toEqual(['their line 1', 'their line 2']);
    });

    it('should handle empty conflict sides', () => {
      const content = `<<<<<<< HEAD
=======
their only
>>>>>>> branch`;

      const markers = parseMarkers(content);
      expect(markers).toHaveLength(1);
      expect(markers[0].oursLines).toEqual([]);
      expect(markers[0].theirsLines).toEqual(['their only']);
    });
  });

  describe('expandPath (private)', () => {
    const expandPath = (p: string) => {
      return (service as any).expandPath(p);
    };

    it('should expand ~ to HOME', () => {
      const result = expandPath('~/projects/test');
      expect(result).not.toContain('~');
      expect(result).toContain('projects/test');
    });

    it('should not modify absolute paths', () => {
      expect(expandPath('/usr/local/bin')).toBe('/usr/local/bin');
    });
  });
});
