/**
 * DigestService Tests
 * Tests the formatting logic (formatForTeams, formatNumber).
 * generateDigest requires too many external dependencies to test in isolation.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DigestService, type DailyDigest } from '../services/digest-service.js';

// Mock dependencies
vi.mock('../services/metrics/index.js', () => ({
  getMetricsService: () => ({
    getAllMetrics: vi.fn().mockResolvedValue({
      tasks: { total: 0 },
      runs: { runs: 0, successes: 0, failures: 0, errors: 0, successRate: 0, byAgent: [] },
      tokens: { totalTokens: 0, inputTokens: 0, outputTokens: 0, byAgent: [] },
      duration: {},
    }),
    getFailedRuns: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock('../services/telemetry-service.js', () => ({
  getTelemetryService: () => ({
    getEvents: vi.fn().mockResolvedValue([]),
    getConfig: vi.fn().mockReturnValue({ traces: false }),
  }),
}));

vi.mock('../services/task-service.js', () => ({
  TaskService: class MockTaskService {
    listTasks = vi.fn().mockResolvedValue([]);
    getTask = vi.fn();
  },
}));

function makeDigest(overrides: Partial<DailyDigest> = {}): DailyDigest {
  return {
    period: {
      start: '2024-06-15T00:00:00.000Z',
      end: '2024-06-16T00:00:00.000Z',
    },
    hasActivity: true,
    tasks: {
      completed: 3,
      created: 5,
      inProgress: 2,
      blocked: 1,
      total: 15,
      completedTitles: ['Fix login bug', 'Add dark mode', 'Update docs'],
      blockedTitles: ['API migration'],
    },
    runs: {
      total: 10,
      successes: 8,
      failures: 1,
      errors: 1,
      successRate: 0.8,
      byAgent: [
        { agent: 'veritas', runs: 7, successRate: 0.857 },
        { agent: 'copilot', runs: 3, successRate: 0.667 },
      ],
    },
    tokens: {
      total: 150000,
      input: 100000,
      output: 50000,
      byAgent: [
        { agent: 'veritas', total: 100000 },
        { agent: 'copilot', total: 50000 },
      ],
    },
    issues: {
      failedRuns: [
        {
          agent: 'copilot',
          taskId: 'task_123',
          error: 'Timeout waiting for response from the model',
          timestamp: '2024-06-15T14:30:00.000Z',
        },
      ],
    },
    ...overrides,
  };
}

describe('DigestService', () => {
  let service: DigestService;

  beforeEach(() => {
    service = new DigestService();
  });

  describe('formatForTeams', () => {
    it('should return empty result for no activity', () => {
      const digest = makeDigest({ hasActivity: false });
      const result = service.formatForTeams(digest);
      expect(result.isEmpty).toBe(true);
      expect(result.markdown).toBe('');
    });

    it('should include daily digest header', () => {
      const digest = makeDigest();
      const result = service.formatForTeams(digest);
      expect(result.isEmpty).toBe(false);
      expect(result.markdown).toContain('📊 Daily Digest');
    });

    it('should include task summary section', () => {
      const digest = makeDigest();
      const result = service.formatForTeams(digest);
      expect(result.markdown).toContain('📋 Tasks');
      expect(result.markdown).toContain('**Completed:** 3');
      expect(result.markdown).toContain('**Created:** 5');
      expect(result.markdown).toContain('**In Progress:** 2');
      expect(result.markdown).toContain('**Blocked:** 1');
    });

    it('should not show blocked section when no blocked tasks', () => {
      const digest = makeDigest({
        tasks: {
          completed: 1,
          created: 1,
          inProgress: 0,
          blocked: 0,
          total: 5,
          completedTitles: ['Task 1'],
          blockedTitles: [],
        },
      });
      const result = service.formatForTeams(digest);
      expect(result.markdown).not.toContain('🚫 **Blocked:**');
    });

    it('should include accomplishments section', () => {
      const digest = makeDigest();
      const result = service.formatForTeams(digest);
      expect(result.markdown).toContain('🏆 Accomplishments');
      expect(result.markdown).toContain('Fix login bug');
      expect(result.markdown).toContain('Add dark mode');
      expect(result.markdown).toContain('Update docs');
    });

    it('should include agent runs section', () => {
      const digest = makeDigest();
      const result = service.formatForTeams(digest);
      expect(result.markdown).toContain('🤖 Agent Runs');
      expect(result.markdown).toContain('**Total:** 10 runs');
      expect(result.markdown).toContain('**Success Rate:** 80%');
      expect(result.markdown).toContain('veritas: 7 runs');
      expect(result.markdown).toContain('copilot: 3 runs');
    });

    it('should not show agent runs when total is 0', () => {
      const digest = makeDigest({
        runs: {
          total: 0,
          successes: 0,
          failures: 0,
          errors: 0,
          successRate: 0,
          byAgent: [],
        },
      });
      const result = service.formatForTeams(digest);
      expect(result.markdown).not.toContain('🤖 Agent Runs');
    });

    it('should include token usage section', () => {
      const digest = makeDigest();
      const result = service.formatForTeams(digest);
      expect(result.markdown).toContain('💰 Token Usage');
      expect(result.markdown).toContain('150.0K tokens');
    });

    it('should not show token usage when total is 0', () => {
      const digest = makeDigest({
        tokens: { total: 0, input: 0, output: 0, byAgent: [] },
      });
      const result = service.formatForTeams(digest);
      expect(result.markdown).not.toContain('💰 Token Usage');
    });

    it('should include blocked items section', () => {
      const digest = makeDigest();
      const result = service.formatForTeams(digest);
      expect(result.markdown).toContain('🚫 Blocked Items');
      expect(result.markdown).toContain('API migration');
    });

    it('should include failed runs section', () => {
      const digest = makeDigest();
      const result = service.formatForTeams(digest);
      expect(result.markdown).toContain('⚠️ Failed Runs');
      expect(result.markdown).toContain('copilot');
      expect(result.markdown).toContain('task_123');
    });
  });

  describe('formatNumber (private)', () => {
    const formatNumber = (num: number) => {
      return (service as any).formatNumber(num);
    };

    it('should format small numbers as-is', () => {
      expect(formatNumber(500)).toBe('500');
      expect(formatNumber(999)).toBe('999');
    });

    it('should format thousands with K', () => {
      expect(formatNumber(1000)).toBe('1.0K');
      expect(formatNumber(5500)).toBe('5.5K');
      expect(formatNumber(150000)).toBe('150.0K');
    });

    it('should format millions with M', () => {
      expect(formatNumber(1000000)).toBe('1.0M');
      expect(formatNumber(2500000)).toBe('2.5M');
    });
  });
});
