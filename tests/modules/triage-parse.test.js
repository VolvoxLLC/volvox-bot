/**
 * Tests for src/modules/triage-parse.js
 * Covers all branches: raw=falsy, raw=string/object, JSON success/fail,
 * truncated JSON recovery, classification recovery, parseClassify/parseRespond.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

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

describe('parseSDKResult', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return null when raw is falsy (null)', () => {
    const result = parseSDKResult(null, 'ch1', 'Test');
    expect(result).toBeNull();
  });

  it('should return null when raw is empty string', () => {
    const result = parseSDKResult('', 'ch1', 'Test');
    expect(result).toBeNull();
  });

  it('should parse valid JSON string', () => {
    const result = parseSDKResult(
      '{"classification":"spam","reasoning":"looks spammy","targetMessageIds":[]}',
      'ch1',
      'Classifier',
    );
    expect(result).not.toBeNull();
    expect(result.classification).toBe('spam');
  });

  it('should parse JSON object directly (non-string)', () => {
    const obj = { classification: 'normal', reasoning: 'fine', targetMessageIds: [] };
    const result = parseSDKResult(obj, 'ch1', 'Classifier');
    expect(result).not.toBeNull();
    expect(result.classification).toBe('normal');
  });

  it('should strip markdown code fences before parsing', () => {
    const raw =
      '```json\n{"classification":"triage","reasoning":"needs help","targetMessageIds":[]}\n```';
    const result = parseSDKResult(raw, 'ch1', 'Classifier');
    expect(result).not.toBeNull();
    expect(result.classification).toBe('triage');
  });

  it('should strip ``` code fences without language hint', () => {
    const raw = '```\n{"classification":"off-topic","reasoning":"nope","targetMessageIds":[]}\n```';
    const result = parseSDKResult(raw, 'ch1', 'Classifier');
    expect(result).not.toBeNull();
    expect(result.classification).toBe('off-topic');
  });

  it('should recover classification from truncated JSON', () => {
    // Valid classification but truncated before closing brackets
    const truncated = '{"classification":"spam","reasoning":"because it looks like s';
    const result = parseSDKResult(truncated, 'ch1', 'Classifier');
    expect(result).not.toBeNull();
    expect(result.classification).toBe('spam');
    expect(result.targetMessageIds).toEqual([]);
  });

  it('should recover classification without reasoning match', () => {
    // Just classification, no reasoning field at all
    const truncated = '{"classification":"triage_needed","other_field":"x';
    const result = parseSDKResult(truncated, 'ch1', 'Classifier');
    expect(result).not.toBeNull();
    expect(result.classification).toBe('triage_needed');
    expect(result.reasoning).toBe('Recovered from truncated response');
  });

  it('should return null when JSON parse fails and no classification match', () => {
    const bad = '{"bad_key":invalid_json_with_no_classification';
    const result = parseSDKResult(bad, 'ch1', 'Classifier');
    expect(result).toBeNull();
  });
});

describe('parseClassifyResult', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return null when parsed result has no classification', () => {
    const sdkMessage = {
      text: '{"reasoning":"something","targetMessageIds":[]}',
      finishReason: 'stop',
      costUsd: 0,
      durationMs: 0,
      usage: { inputTokens: 0, outputTokens: 0 },
      sources: [],
      providerMetadata: { anthropic: {} },
    };
    const result = parseClassifyResult(sdkMessage, 'ch1');
    expect(result).toBeNull();
  });

  it('should return null when text is null/unparseable', () => {
    const sdkMessage = {
      text: null,
      finishReason: 'error',
      costUsd: 0,
      durationMs: 0,
      usage: { inputTokens: 0, outputTokens: 0 },
      sources: [],
      providerMetadata: { anthropic: {} },
    };
    const result = parseClassifyResult(sdkMessage, 'ch1');
    expect(result).toBeNull();
  });

  it('should return parsed classification on success', () => {
    const sdkMessage = {
      text: '{"classification":"spam","reasoning":"it is spam","targetMessageIds":["m1"]}',
      finishReason: 'stop',
      costUsd: 0.001,
      durationMs: 50,
      usage: { inputTokens: 100, outputTokens: 50 },
      sources: [],
      providerMetadata: { anthropic: {} },
    };
    const result = parseClassifyResult(sdkMessage, 'ch1');
    expect(result).not.toBeNull();
    expect(result.classification).toBe('spam');
    expect(result.targetMessageIds).toEqual(['m1']);
  });

  it('should return null when text is empty string', () => {
    const sdkMessage = {
      text: '',
      finishReason: 'stop',
      costUsd: 0,
      durationMs: 0,
      usage: { inputTokens: 0, outputTokens: 0 },
      sources: [],
      providerMetadata: { anthropic: {} },
    };
    const result = parseClassifyResult(sdkMessage, 'ch1');
    expect(result).toBeNull();
  });
});

describe('parseRespondResult', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return null when text is null', () => {
    const sdkMessage = {
      text: null,
      finishReason: 'error',
      costUsd: 0,
      durationMs: 0,
      usage: { inputTokens: 0, outputTokens: 0 },
      sources: [],
      providerMetadata: { anthropic: {} },
    };
    const result = parseRespondResult(sdkMessage, 'ch1');
    expect(result).toBeNull();
  });

  it('should return parsed result on success', () => {
    const sdkMessage = {
      text: '{"responses":[{"target_message_id":"m1","response":"Help text"}]}',
      finishReason: 'stop',
      costUsd: 0.005,
      durationMs: 200,
      usage: { inputTokens: 500, outputTokens: 100 },
      sources: [],
      providerMetadata: { anthropic: {} },
    };
    const result = parseRespondResult(sdkMessage, 'ch1');
    expect(result).not.toBeNull();
    expect(result.responses).toHaveLength(1);
  });

  it('should return result even without responses key (truthy parsed)', () => {
    const sdkMessage = {
      text: '{"something":"else"}',
      finishReason: 'stop',
      costUsd: 0,
      durationMs: 0,
      usage: { inputTokens: 0, outputTokens: 0 },
      sources: [],
      providerMetadata: { anthropic: {} },
    };
    const result = parseRespondResult(sdkMessage, 'ch1');
    expect(result).not.toBeNull();
    expect(result.something).toBe('else');
  });

  it('should return null when text is empty string', () => {
    const sdkMessage = {
      text: '',
      finishReason: 'stop',
      costUsd: 0,
      durationMs: 0,
      usage: { inputTokens: 0, outputTokens: 0 },
      sources: [],
      providerMetadata: { anthropic: {} },
    };
    const result = parseRespondResult(sdkMessage, 'ch1');
    expect(result).toBeNull();
  });
});
