import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock node:fs
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => '[]'),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

// Mock logger
vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  _resetOptouts,
  _setOptoutPath,
  isOptedOut,
  loadOptOuts,
  saveOptOuts,
  toggleOptOut,
} from '../../src/modules/optout.js';

describe('optout module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetOptouts();
    _setOptoutPath('/tmp/test-optout.json');
  });

  afterEach(() => {
    _resetOptouts();
  });

  describe('isOptedOut', () => {
    it('should return false for users who have not opted out', () => {
      expect(isOptedOut('user123')).toBe(false);
    });

    it('should return true for users who have opted out', () => {
      toggleOptOut('user123');
      expect(isOptedOut('user123')).toBe(true);
    });

    it('should return false for different users', () => {
      toggleOptOut('user123');
      expect(isOptedOut('user456')).toBe(false);
    });
  });

  describe('toggleOptOut', () => {
    it('should opt out a user who is opted in', () => {
      const result = toggleOptOut('user123');
      expect(result).toEqual({ optedOut: true });
      expect(isOptedOut('user123')).toBe(true);
    });

    it('should opt in a user who is opted out', () => {
      toggleOptOut('user123'); // opt out
      const result = toggleOptOut('user123'); // opt back in
      expect(result).toEqual({ optedOut: false });
      expect(isOptedOut('user123')).toBe(false);
    });

    it('should persist after each toggle', () => {
      toggleOptOut('user123');
      expect(writeFileSync).toHaveBeenCalledTimes(1);

      toggleOptOut('user123');
      expect(writeFileSync).toHaveBeenCalledTimes(2);
    });

    it('should handle multiple users independently', () => {
      toggleOptOut('user1');
      toggleOptOut('user2');

      expect(isOptedOut('user1')).toBe(true);
      expect(isOptedOut('user2')).toBe(true);
      expect(isOptedOut('user3')).toBe(false);

      toggleOptOut('user1'); // opt back in
      expect(isOptedOut('user1')).toBe(false);
      expect(isOptedOut('user2')).toBe(true);
    });
  });

  describe('loadOptOuts', () => {
    it('should handle missing file gracefully', () => {
      existsSync.mockReturnValue(false);
      loadOptOuts();
      expect(isOptedOut('anyone')).toBe(false);
    });

    it('should load opted-out users from file', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('["user1", "user2"]');

      loadOptOuts();

      expect(isOptedOut('user1')).toBe(true);
      expect(isOptedOut('user2')).toBe(true);
      expect(isOptedOut('user3')).toBe(false);
    });

    it('should handle corrupt JSON gracefully', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('not valid json');

      loadOptOuts();

      expect(isOptedOut('anyone')).toBe(false);
    });

    it('should handle non-array JSON gracefully', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('{"key": "value"}');

      loadOptOuts();

      expect(isOptedOut('anyone')).toBe(false);
    });

    it('should handle file read errors gracefully', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockImplementation(() => {
        throw new Error('EACCES');
      });

      loadOptOuts();

      expect(isOptedOut('anyone')).toBe(false);
    });

    it('should handle empty array', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('[]');

      loadOptOuts();

      expect(isOptedOut('anyone')).toBe(false);
    });
  });

  describe('saveOptOuts', () => {
    it('should write opted-out users to file', () => {
      toggleOptOut('user1');
      toggleOptOut('user2');

      // writeFileSync was already called by toggleOptOut, check last call
      const lastCall = writeFileSync.mock.calls[writeFileSync.mock.calls.length - 1];
      const saved = JSON.parse(lastCall[1]);
      expect(saved).toContain('user1');
      expect(saved).toContain('user2');
    });

    it('should create directory if it does not exist', () => {
      existsSync.mockReturnValue(false);
      saveOptOuts();
      expect(mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    });

    it('should handle write errors gracefully', () => {
      existsSync.mockReturnValue(true);
      writeFileSync.mockImplementation(() => {
        throw new Error('ENOSPC');
      });

      // Should not throw
      expect(() => saveOptOuts()).not.toThrow();
    });

    it('should write empty array when no users opted out', () => {
      existsSync.mockReturnValue(true);
      saveOptOuts();

      const lastCall = writeFileSync.mock.calls[writeFileSync.mock.calls.length - 1];
      expect(JSON.parse(lastCall[1])).toEqual([]);
    });
  });
});
