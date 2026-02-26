import { describe, expect, it } from 'vitest';

import {
  getDynamicInterval,
  isChannelEligible,
  resolveTriageConfig,
} from '../../src/modules/triage-config.js';

describe('triage-config', () => {
  describe('resolveTriageConfig', () => {
    it('should return defaults for an empty config', () => {
      const result = resolveTriageConfig({});
      expect(result.classifyModel).toBe('claude-haiku-4-5');
      expect(result.respondModel).toBe('claude-sonnet-4-6');
      expect(result.classifyBudget).toBe(0.05);
      expect(result.respondBudget).toBe(0.2);
      expect(result.timeout).toBe(30000);
      expect(result.tokenRecycleLimit).toBe(20000);
    });

    it('should resolve PR #68 flat format as fallback', () => {
      const result = resolveTriageConfig({ model: 'my-model', budget: 0.5, timeout: 10000 });
      expect(result.respondModel).toBe('my-model');
      expect(result.respondBudget).toBe(0.5);
      expect(result.timeout).toBe(10000);
    });

    it('should resolve original nested format as last fallback', () => {
      const result = resolveTriageConfig({
        models: { default: 'nested-model' },
        budget: { response: 0.3 },
        timeouts: { response: 5000 },
      });
      expect(result.respondModel).toBe('nested-model');
      expect(result.respondBudget).toBe(0.3);
      expect(result.timeout).toBe(5000);
    });

    it('should prefer new split format over legacy formats', () => {
      const result = resolveTriageConfig({
        respondModel: 'new-model',
        respondBudget: 0.99,
        model: 'legacy-model',
        budget: 0.1,
      });
      expect(result.respondModel).toBe('new-model');
      expect(result.respondBudget).toBe(0.99);
    });
  });

  describe('isChannelEligible', () => {
    it('should allow any channel when channels list is empty', () => {
      expect(isChannelEligible('ch-1', {})).toBe(true);
    });

    it('should allow only whitelisted channels', () => {
      expect(isChannelEligible('ch-1', { channels: ['ch-1', 'ch-2'] })).toBe(true);
      expect(isChannelEligible('ch-3', { channels: ['ch-1', 'ch-2'] })).toBe(false);
    });

    it('should exclude channels in excludeChannels even if whitelisted', () => {
      expect(isChannelEligible('ch-1', { channels: ['ch-1'], excludeChannels: ['ch-1'] })).toBe(false);
    });

    it('should exclude from global pool when excludeChannels set with empty allow-list', () => {
      expect(isChannelEligible('ch-1', { excludeChannels: ['ch-1'] })).toBe(false);
      expect(isChannelEligible('ch-2', { excludeChannels: ['ch-1'] })).toBe(true);
    });
  });

  describe('getDynamicInterval', () => {
    it('should return baseInterval for queueSize <= 1', () => {
      expect(getDynamicInterval(0)).toBe(5000);
      expect(getDynamicInterval(1)).toBe(5000);
    });

    it('should return half for 2-4 messages', () => {
      expect(getDynamicInterval(2)).toBe(2500);
      expect(getDynamicInterval(4)).toBe(2500);
    });

    it('should return fifth for 5+ messages', () => {
      expect(getDynamicInterval(5)).toBe(1000);
      expect(getDynamicInterval(10)).toBe(1000);
    });
  });
});
