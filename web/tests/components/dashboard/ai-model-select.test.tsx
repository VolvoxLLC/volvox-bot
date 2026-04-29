import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AI_MODEL,
  isSupportedAiModel,
  normalizeAiModel,
} from '@/components/dashboard/ai-model-select';

describe('AiModelSelect helpers', () => {
  it('accepts supported model values case-insensitively', () => {
    expect(isSupportedAiModel('minimax:MiniMax-M2.7')).toBe(true);
    expect(isSupportedAiModel('MINIMAX:minimax-m2.7')).toBe(true);
  });

  it('normalizes stale model values to the explicit dashboard default', () => {
    expect(normalizeAiModel('anthropic:claude-3-5-haiku')).toBe(DEFAULT_AI_MODEL);
  });
});
