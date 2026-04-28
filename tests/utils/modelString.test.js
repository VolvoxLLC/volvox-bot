import { describe, expect, it } from 'vitest';

import { parseProviderModel } from '../../src/utils/modelString.js';

describe('parseProviderModel', () => {
  it('splits a well-formed provider:model string', () => {
    expect(parseProviderModel('minimax:MiniMax-M2.7')).toEqual({
      providerName: 'minimax',
      modelId: 'MiniMax-M2.7',
    });
    expect(parseProviderModel('moonshot:kimi-k2.6')).toEqual({
      providerName: 'moonshot',
      modelId: 'kimi-k2.6',
    });
  });

  it('preserves case in both provider and model parts', () => {
    expect(parseProviderModel('MiniMax:MiniMax-M2.7')).toEqual({
      providerName: 'MiniMax',
      modelId: 'MiniMax-M2.7',
    });
  });

  it('splits on the first colon so model IDs can contain slashes or colons', () => {
    expect(parseProviderModel('openrouter:moonshotai/kimi-k2.6')).toEqual({
      providerName: 'openrouter',
      modelId: 'moonshotai/kimi-k2.6',
    });
    expect(parseProviderModel('openrouter:model:with:colons')).toEqual({
      providerName: 'openrouter',
      modelId: 'model:with:colons',
    });
    expect(parseProviderModel('openrouter:minimax/minimax-m2.5:free')).toEqual({
      providerName: 'openrouter',
      modelId: 'minimax/minimax-m2.5:free',
    });
  });

  // ── D1: throw on bare / malformed strings ────────────────────────────────

  it('throws on a bare model name (no colon)', () => {
    expect(() => parseProviderModel('claude-haiku-4-5')).toThrow(/provider:model/);
    expect(() => parseProviderModel('MiniMax-M2.7')).toThrow(/provider:model/);
  });

  it('throws on an empty string', () => {
    expect(() => parseProviderModel('')).toThrow(/provider:model/);
  });

  it('throws on null and undefined', () => {
    expect(() => parseProviderModel(null)).toThrow(/provider:model/);
    expect(() => parseProviderModel(undefined)).toThrow(/provider:model/);
  });

  it('throws on non-string input', () => {
    expect(() => parseProviderModel(42)).toThrow(/provider:model/);
    expect(() => parseProviderModel({})).toThrow(/provider:model/);
    expect(() => parseProviderModel([])).toThrow(/provider:model/);
  });

  it('throws when the colon is the first character', () => {
    expect(() => parseProviderModel(':orphan-model')).toThrow(/provider:model/);
  });

  it('throws when the colon is the last character', () => {
    expect(() => parseProviderModel('provider:')).toThrow(/provider:model/);
  });
});
