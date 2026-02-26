import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

import {
  parseClassifyResult,
  parseRespondResult,
  parseSDKResult,
} from '../../src/modules/triage-parse.js';

describe('triage-parse', () => {
  describe('parseSDKResult', () => {
    it('should parse valid JSON string', () => {
      const result = parseSDKResult('{"classification":"respond","reasoning":"test"}', 'ch-1', 'Test');
      expect(result).toEqual({ classification: 'respond', reasoning: 'test' });
    });

    it('should strip markdown code fences and parse', () => {
      const raw = '```json\n{"classification":"ignore","reasoning":"no"}\n```';
      const result = parseSDKResult(raw, 'ch-1', 'Test');
      expect(result.classification).toBe('ignore');
    });

    it('should return null for falsy input', () => {
      expect(parseSDKResult(null, 'ch-1', 'Test')).toBeNull();
      expect(parseSDKResult('', 'ch-1', 'Test')).toBeNull();
    });

    it('should recover classification from truncated JSON', () => {
      const truncated = '{"classification":"respond","reasoning":"the user asked';
      const result = parseSDKResult(truncated, 'ch-1', 'Test');
      expect(result.classification).toBe('respond');
      expect(result.targetMessageIds).toEqual([]);
    });

    it('should return null when no classification can be extracted', () => {
      const result = parseSDKResult('completely broken garbage', 'ch-1', 'Test');
      expect(result).toBeNull();
    });
  });

  describe('parseClassifyResult', () => {
    it('should parse valid classifier output', () => {
      const sdkMessage = {
        result: '{"classification":"respond","reasoning":"test","targetMessageIds":["m1"]}',
      };
      const result = parseClassifyResult(sdkMessage, 'ch-1');
      expect(result.classification).toBe('respond');
      expect(result.targetMessageIds).toEqual(['m1']);
    });

    it('should return null for missing classification field', () => {
      const sdkMessage = { result: '{"reasoning":"test"}' };
      expect(parseClassifyResult(sdkMessage, 'ch-1')).toBeNull();
    });
  });

  describe('parseRespondResult', () => {
    it('should parse valid responder output', () => {
      const sdkMessage = {
        result: '{"responses":[{"text":"hello"}]}',
      };
      const result = parseRespondResult(sdkMessage, 'ch-1');
      expect(result.responses).toEqual([{ text: 'hello' }]);
    });

    it('should return null for unparseable result', () => {
      const sdkMessage = { result: null };
      expect(parseRespondResult(sdkMessage, 'ch-1')).toBeNull();
    });
  });
});
