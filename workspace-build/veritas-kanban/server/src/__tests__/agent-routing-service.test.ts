import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentRoutingService } from '../services/agent-routing-service';
import type { AgentRoutingConfig, AppConfig, Task } from '@veritas-kanban/shared';

// Mock ConfigService
const mockGetConfig = vi.fn();
const mockSaveConfig = vi.fn();

vi.mock('../services/config-service.js', () => {
  return {
    ConfigService: class MockConfigService {
      getConfig = mockGetConfig;
      saveConfig = mockSaveConfig;
    },
  };
});

const BASE_CONFIG: AppConfig = {
  repos: [],
  agents: [
    { type: 'claude-code', name: 'Claude Code', command: 'claude', args: [], enabled: true },
    { type: 'amp', name: 'Amp', command: 'amp', args: [], enabled: true },
    { type: 'copilot', name: 'GitHub Copilot', command: 'copilot', args: [], enabled: true },
    { type: 'gemini', name: 'Gemini CLI', command: 'gemini', args: [], enabled: false },
  ],
  defaultAgent: 'claude-code',
  agentRouting: {
    enabled: true,
    rules: [
      {
        id: 'code-high',
        name: 'High-priority code',
        match: { type: 'code', priority: 'high' },
        agent: 'claude-code',
        model: 'opus',
        fallback: 'amp',
        enabled: true,
      },
      {
        id: 'code-default',
        name: 'Code tasks',
        match: { type: 'code' },
        agent: 'claude-code',
        model: 'sonnet',
        fallback: 'copilot',
        enabled: true,
      },
      {
        id: 'docs',
        name: 'Documentation',
        match: { type: 'docs' },
        agent: 'claude-code',
        model: 'haiku',
        enabled: true,
      },
      {
        id: 'disabled-rule',
        name: 'Disabled rule',
        match: { type: 'feature' },
        agent: 'amp',
        enabled: false,
      },
    ],
    defaultAgent: 'claude-code',
    defaultModel: 'sonnet',
    fallbackOnFailure: true,
    maxRetries: 1,
  },
};

describe('AgentRoutingService', () => {
  let service: AgentRoutingService;

  beforeEach(() => {
    mockGetConfig.mockResolvedValue(structuredClone(BASE_CONFIG));
    mockSaveConfig.mockResolvedValue(undefined);
    service = new AgentRoutingService();
  });

  describe('resolveAgent', () => {
    it('matches high-priority code task to first rule', async () => {
      const result = await service.resolveAgent({
        type: 'code',
        priority: 'high',
      });

      expect(result.agent).toBe('claude-code');
      expect(result.model).toBe('opus');
      expect(result.fallback).toBe('amp');
      expect(result.rule).toBe('code-high');
      expect(result.reason).toContain('High-priority code');
    });

    it('matches medium-priority code task to second rule', async () => {
      const result = await service.resolveAgent({
        type: 'code',
        priority: 'medium',
      });

      expect(result.agent).toBe('claude-code');
      expect(result.model).toBe('sonnet');
      expect(result.fallback).toBe('copilot');
      expect(result.rule).toBe('code-default');
    });

    it('matches docs to docs rule', async () => {
      const result = await service.resolveAgent({
        type: 'docs',
        priority: 'low',
      });

      expect(result.agent).toBe('claude-code');
      expect(result.model).toBe('haiku');
      expect(result.rule).toBe('docs');
    });

    it('skips disabled rules', async () => {
      const result = await service.resolveAgent({
        type: 'feature',
        priority: 'medium',
      });

      // disabled-rule matches feature but is disabled, so falls through to default
      expect(result.rule).toBeUndefined();
      expect(result.agent).toBe('claude-code');
      expect(result.model).toBe('sonnet');
      expect(result.reason).toContain('No routing rules matched');
    });

    it('falls back to default when no rules match', async () => {
      const result = await service.resolveAgent({
        type: 'design',
        priority: 'low',
      });

      expect(result.agent).toBe('claude-code');
      expect(result.model).toBe('sonnet');
      expect(result.rule).toBeUndefined();
      expect(result.reason).toContain('No routing rules matched');
    });

    it('returns default agent when routing is disabled', async () => {
      const config = structuredClone(BASE_CONFIG);
      config.agentRouting!.enabled = false;
      mockGetConfig.mockResolvedValue(config);

      const result = await service.resolveAgent({
        type: 'code',
        priority: 'high',
      });

      expect(result.agent).toBe('claude-code');
      expect(result.reason).toContain('Routing disabled');
    });

    it('skips rules where agent is disabled', async () => {
      const config = structuredClone(BASE_CONFIG);
      // Disable claude-code so the first two rules are skipped
      config.agents[0].enabled = false;
      mockGetConfig.mockResolvedValue(config);

      const result = await service.resolveAgent({
        type: 'code',
        priority: 'high',
      });

      // Both code rules point to claude-code which is disabled — falls to default
      // But default is also claude-code (disabled), so it returns the config default anyway
      expect(result.reason).toContain('No routing rules matched');
    });

    it('matches array criteria', async () => {
      const config = structuredClone(BASE_CONFIG);
      config.agentRouting!.rules = [
        {
          id: 'multi-type',
          name: 'Multiple types',
          match: { type: ['bug', 'hotfix'], priority: ['high', 'medium'] },
          agent: 'amp',
          enabled: true,
        },
      ];
      mockGetConfig.mockResolvedValue(config);

      const result = await service.resolveAgent({
        type: 'bug',
        priority: 'medium',
      });
      expect(result.agent).toBe('amp');
      expect(result.rule).toBe('multi-type');
    });

    it('matches minSubtasks criteria', async () => {
      const config = structuredClone(BASE_CONFIG);
      config.agentRouting!.rules = [
        {
          id: 'complex',
          name: 'Complex tasks',
          match: { minSubtasks: 5 },
          agent: 'amp',
          enabled: true,
        },
      ];
      mockGetConfig.mockResolvedValue(config);

      const result = await service.resolveAgent({
        type: 'feature',
        priority: 'medium',
        subtasks: Array.from({ length: 6 }, (_, i) => ({
          id: `s${i}`,
          title: `Sub ${i}`,
          completed: false,
          created: new Date().toISOString(),
        })),
      });
      expect(result.agent).toBe('amp');
      expect(result.rule).toBe('complex');
    });

    it('does NOT match when subtasks below threshold', async () => {
      const config = structuredClone(BASE_CONFIG);
      config.agentRouting!.rules = [
        {
          id: 'complex',
          name: 'Complex tasks',
          match: { minSubtasks: 5 },
          agent: 'amp',
          enabled: true,
        },
      ];
      mockGetConfig.mockResolvedValue(config);

      const result = await service.resolveAgent({
        type: 'feature',
        priority: 'medium',
        subtasks: [
          { id: 's1', title: 'Sub 1', completed: false, created: new Date().toISOString() },
        ],
      });
      expect(result.rule).toBeUndefined(); // No match
    });
  });

  describe('getFallback', () => {
    it('returns fallback agent from matched rule', async () => {
      const result = await service.getFallback({ type: 'code', priority: 'high' }, 'claude-code');

      expect(result).not.toBeNull();
      expect(result!.agent).toBe('amp');
      expect(result!.reason).toContain('Fallback');
    });

    it('returns null when fallback is disabled', async () => {
      const config = structuredClone(BASE_CONFIG);
      config.agentRouting!.fallbackOnFailure = false;
      mockGetConfig.mockResolvedValue(config);

      const result = await service.getFallback({ type: 'code', priority: 'high' }, 'claude-code');
      expect(result).toBeNull();
    });

    it('returns default agent as fallback when no specific fallback', async () => {
      const result = await service.getFallback(
        { type: 'docs', priority: 'low' },
        'claude-code' // docs rule has no fallback, and default is claude-code (same)
      );
      // claude-code === failedAgent, so no fallback
      expect(result).toBeNull();
    });

    it('returns default agent when it differs from failed', async () => {
      const result = await service.getFallback(
        { type: 'docs', priority: 'low' },
        'amp' // Failed agent is amp, default is claude-code → valid fallback
      );
      expect(result).not.toBeNull();
      expect(result!.agent).toBe('claude-code');
    });
  });

  describe('updateRoutingConfig', () => {
    it('saves valid config', async () => {
      const newConfig: AgentRoutingConfig = {
        enabled: true,
        rules: [],
        defaultAgent: 'amp',
        fallbackOnFailure: false,
        maxRetries: 0,
      };

      await service.updateRoutingConfig(newConfig);
      expect(mockSaveConfig).toHaveBeenCalled();
    });

    it('rejects duplicate rule IDs', async () => {
      const newConfig: AgentRoutingConfig = {
        enabled: true,
        rules: [
          { id: 'dup', name: 'A', match: {}, agent: 'amp', enabled: true },
          { id: 'dup', name: 'B', match: {}, agent: 'amp', enabled: true },
        ],
        defaultAgent: 'amp',
        fallbackOnFailure: false,
        maxRetries: 0,
      };

      await expect(service.updateRoutingConfig(newConfig)).rejects.toThrow('unique');
    });

    it('rejects maxRetries > 3', async () => {
      const newConfig: AgentRoutingConfig = {
        enabled: true,
        rules: [],
        defaultAgent: 'amp',
        fallbackOnFailure: false,
        maxRetries: 5,
      };

      await expect(service.updateRoutingConfig(newConfig)).rejects.toThrow('maxRetries');
    });
  });
});
