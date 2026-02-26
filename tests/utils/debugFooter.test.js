import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks (before imports) ───────────────────────────────────────────────────

const mockQuery = vi.fn().mockResolvedValue({});

vi.mock('../../src/db.js', () => ({
  getPool: vi.fn(() => ({ query: mockQuery })),
}));

vi.mock('../../src/logger.js', () => ({
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

import { getPool } from '../../src/db.js';
import { error as logError } from '../../src/logger.js';
import {
  buildDebugEmbed,
  buildDebugFooter,
  extractStats,
  formatCost,
  formatTokens,
  logAiUsage,
  shortModel,
} from '../../src/utils/debugFooter.js';

// ── formatTokens ────────────────────────────────────────────────────────────

describe('formatTokens', () => {
  it('should return "0" for null/undefined/negative', () => {
    expect(formatTokens(null)).toBe('0');
    expect(formatTokens(undefined)).toBe('0');
    expect(formatTokens(-1)).toBe('0');
  });

  it('should return raw number for values under 1000', () => {
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(48)).toBe('48');
    expect(formatTokens(999)).toBe('999');
  });

  it('should return K suffix for values >= 1000', () => {
    expect(formatTokens(1000)).toBe('1.0K');
    expect(formatTokens(1204)).toBe('1.2K');
    expect(formatTokens(12500)).toBe('12.5K');
  });
});

// ── formatCost ──────────────────────────────────────────────────────────────

describe('formatCost', () => {
  it('should return "$0.000" for zero/null/undefined', () => {
    expect(formatCost(0)).toBe('$0.000');
    expect(formatCost(null)).toBe('$0.000');
    expect(formatCost(undefined)).toBe('$0.000');
    expect(formatCost(-1)).toBe('$0.000');
  });

  it('should format small costs with 4 decimal places', () => {
    expect(formatCost(0.0005)).toBe('$0.0005');
    expect(formatCost(0.0001)).toBe('$0.0001');
  });

  it('should format normal costs with 3 decimal places', () => {
    expect(formatCost(0.001)).toBe('$0.001');
    expect(formatCost(0.021)).toBe('$0.021');
    expect(formatCost(0.5)).toBe('$0.500');
    expect(formatCost(1.234)).toBe('$1.234');
  });
});

// ── shortModel ──────────────────────────────────────────────────────────────

describe('shortModel', () => {
  it('should strip claude- prefix', () => {
    expect(shortModel('claude-haiku-4-5')).toBe('haiku-4-5');
    expect(shortModel('claude-sonnet-4-6')).toBe('sonnet-4-6');
  });

  it('should return as-is when no claude- prefix', () => {
    expect(shortModel('gpt-4')).toBe('gpt-4');
  });

  it('should return "unknown" for falsy input', () => {
    expect(shortModel(null)).toBe('unknown');
    expect(shortModel('')).toBe('unknown');
  });
});

// ── extractStats ────────────────────────────────────────────────────────────

describe('extractStats', () => {
  it('should extract stats from a CLIProcess result', () => {
    const result = {
      total_cost_usd: 0.005,
      duration_ms: 200,
      usage: {
        input_tokens: 1204,
        output_tokens: 340,
        cache_creation_input_tokens: 120,
        cache_read_input_tokens: 800,
      },
    };
    const stats = extractStats(result, 'claude-sonnet-4-6');
    expect(stats).toEqual({
      model: 'claude-sonnet-4-6',
      cost: 0.005,
      durationMs: 200,
      inputTokens: 1204,
      outputTokens: 340,
      cacheCreation: 120,
      cacheRead: 800,
    });
  });

  it('should handle missing usage fields gracefully', () => {
    const result = {
      total_cost_usd: 0.001,
      duration_ms: 50,
      usage: {},
    };
    const stats = extractStats(result, 'claude-haiku-4-5');
    expect(stats.inputTokens).toBe(0);
    expect(stats.outputTokens).toBe(0);
    expect(stats.cacheCreation).toBe(0);
    expect(stats.cacheRead).toBe(0);
  });

  it('should handle null result gracefully', () => {
    const stats = extractStats(null, 'model');
    expect(stats.cost).toBe(0);
    expect(stats.durationMs).toBe(0);
    expect(stats.inputTokens).toBe(0);
  });

  it('should handle camelCase usage keys', () => {
    const result = {
      total_cost_usd: 0.002,
      duration_ms: 100,
      usage: {
        inputTokens: 500,
        outputTokens: 100,
      },
    };
    const stats = extractStats(result, 'test-model');
    expect(stats.inputTokens).toBe(500);
    expect(stats.outputTokens).toBe(100);
  });
});

// ── buildDebugFooter (text version) ─────────────────────────────────────────

describe('buildDebugFooter', () => {
  const classifyStats = {
    model: 'claude-haiku-4-5',
    cost: 0.001,
    durationMs: 50,
    inputTokens: 48,
    outputTokens: 12,
    cacheCreation: 8,
    cacheRead: 0,
  };

  const respondStats = {
    model: 'claude-sonnet-4-6',
    cost: 0.02,
    durationMs: 2250,
    inputTokens: 1204,
    outputTokens: 340,
    cacheCreation: 120,
    cacheRead: 800,
  };

  describe('verbose level', () => {
    it('should produce multi-line verbose output', () => {
      const footer = buildDebugFooter(classifyStats, respondStats, 'verbose');
      expect(footer).toContain('🔍 Triage: claude-haiku-4-5');
      expect(footer).toContain('In: 48 Out: 12 Cache+: 8 CacheR: 0');
      expect(footer).toContain('💬 Response: claude-sonnet-4-6');
      expect(footer).toContain('In: 1.2K Out: 340');
      expect(footer).toContain('Σ Total: $0.021');
      expect(footer).toContain('Duration: 2.3s');
    });

    it('should be the default level', () => {
      const footer = buildDebugFooter(classifyStats, respondStats);
      expect(footer).toContain('🔍 Triage:');
      expect(footer).toContain('Σ Total:');
    });
  });

  describe('split level', () => {
    it('should produce two-line output with short model names', () => {
      const footer = buildDebugFooter(classifyStats, respondStats, 'split');
      const lines = footer.split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain('haiku-4-5');
      expect(lines[0]).toContain('48→12 tok');
      expect(lines[1]).toContain('sonnet-4-6');
      expect(lines[1]).toContain('Σ $0.021');
    });
  });

  describe('compact level', () => {
    it('should produce single-line output', () => {
      const footer = buildDebugFooter(classifyStats, respondStats, 'compact');
      const lines = footer.split('\n');
      expect(lines).toHaveLength(1);
      expect(footer).toContain('🔍 haiku-4-5 48/12');
      expect(footer).toContain('💬 sonnet-4-6 1.2K/340');
      expect(footer).toContain('Σ $0.021');
    });
  });

  it('should handle null/missing stats gracefully', () => {
    const footer = buildDebugFooter(null, null, 'verbose');
    expect(footer).toContain('🔍 Triage:');
    expect(footer).toContain('Σ Total: $0.000');
  });

  describe('search count display', () => {
    it('should append search count when > 0 (verbose)', () => {
      const footer = buildDebugFooter(classifyStats, respondStats, 'verbose', { searchCount: 3 });
      expect(footer).toContain('🔎×3');
    });

    it('should append search count when > 0 (split)', () => {
      const footer = buildDebugFooter(classifyStats, respondStats, 'split', { searchCount: 1 });
      expect(footer).toContain('🔎×1');
    });

    it('should append search count when > 0 (compact)', () => {
      const footer = buildDebugFooter(classifyStats, respondStats, 'compact', { searchCount: 2 });
      expect(footer).toContain('🔎×2');
    });

    it('should not show search indicator when searchCount is 0', () => {
      const footer = buildDebugFooter(classifyStats, respondStats, 'verbose', { searchCount: 0 });
      expect(footer).not.toContain('🔎');
    });

    it('should not show search indicator when options omitted', () => {
      const footer = buildDebugFooter(classifyStats, respondStats, 'verbose');
      expect(footer).not.toContain('🔎');
    });
  });
});

// ── buildDebugEmbed ─────────────────────────────────────────────────────────

describe('buildDebugEmbed', () => {
  const classifyStats = {
    model: 'claude-haiku-4-5',
    cost: 0.001,
    durationMs: 50,
    inputTokens: 48,
    outputTokens: 12,
    cacheCreation: 8,
    cacheRead: 0,
  };

  const respondStats = {
    model: 'claude-sonnet-4-6',
    cost: 0.02,
    durationMs: 2250,
    inputTokens: 1204,
    outputTokens: 340,
    cacheCreation: 120,
    cacheRead: 800,
  };

  it('should return an EmbedBuilder with correct color', () => {
    const embed = buildDebugEmbed(classifyStats, respondStats);
    expect(embed.data.color).toBe(0x2b2d31);
  });

  it('should have footer with total cost and duration', () => {
    const embed = buildDebugEmbed(classifyStats, respondStats);
    expect(embed.data.footer.text).toBe('Σ $0.021 • 2.3s');
  });

  describe('verbose level', () => {
    it('should have 2 inline fields', () => {
      const embed = buildDebugEmbed(classifyStats, respondStats, 'verbose');
      expect(embed.data.fields).toHaveLength(2);
      expect(embed.data.fields[0].inline).toBe(true);
      expect(embed.data.fields[1].inline).toBe(true);
    });

    it('should have short model names in field names', () => {
      const embed = buildDebugEmbed(classifyStats, respondStats, 'verbose');
      expect(embed.data.fields[0].name).toBe('🔍 haiku-4-5');
      expect(embed.data.fields[1].name).toBe('💬 sonnet-4-6');
    });

    it('should have multi-line values with tokens, cache, and cost', () => {
      const embed = buildDebugEmbed(classifyStats, respondStats, 'verbose');
      const triageValue = embed.data.fields[0].value;
      expect(triageValue).toContain('48→12 tok');
      expect(triageValue).toContain('Cache: 8+0');
      expect(triageValue).toContain('$0.001');

      const respondValue = embed.data.fields[1].value;
      expect(respondValue).toContain('1.2K→340 tok');
      expect(respondValue).toContain('Cache: 120+800');
      expect(respondValue).toContain('$0.020');
    });

    it('should be the default level', () => {
      const embed = buildDebugEmbed(classifyStats, respondStats);
      expect(embed.data.fields).toHaveLength(2);
    });
  });

  describe('compact level', () => {
    it('should have no fields and a description instead', () => {
      const embed = buildDebugEmbed(classifyStats, respondStats, 'compact');
      expect(embed.data.fields).toBeUndefined();
      expect(typeof embed.data.description).toBe('string');
    });

    it('should have 2-line description with model + tokens + cost', () => {
      const embed = buildDebugEmbed(classifyStats, respondStats, 'compact');
      const lines = embed.data.description.split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain('🔍 haiku-4-5');
      expect(lines[0]).toContain('48→12');
      expect(lines[0]).toContain('$0.001');
      expect(lines[1]).toContain('💬 sonnet-4-6');
      expect(lines[1]).toContain('1.2K→340');
      expect(lines[1]).toContain('$0.020');
    });
  });

  describe('split level', () => {
    it('should have 2 inline fields', () => {
      const embed = buildDebugEmbed(classifyStats, respondStats, 'split');
      expect(embed.data.fields).toHaveLength(2);
      expect(embed.data.fields[0].inline).toBe(true);
      expect(embed.data.fields[1].inline).toBe(true);
    });

    it('should have short model names in field names', () => {
      const embed = buildDebugEmbed(classifyStats, respondStats, 'split');
      expect(embed.data.fields[0].name).toBe('🔍 haiku-4-5');
      expect(embed.data.fields[1].name).toBe('💬 sonnet-4-6');
    });

    it('should have single-line values with tokens and cost', () => {
      const embed = buildDebugEmbed(classifyStats, respondStats, 'split');
      expect(embed.data.fields[0].value).toBe('48→12 • $0.001');
      expect(embed.data.fields[1].value).toBe('1.2K→340 • $0.020');
    });
  });

  it('should handle null/missing stats gracefully', () => {
    const embed = buildDebugEmbed(null, null, 'verbose');
    expect(embed.data.color).toBe(0x2b2d31);
    expect(embed.data.footer.text).toBe('Σ $0.000 • 0.0s');
    expect(embed.data.fields).toHaveLength(2);
    expect(embed.data.fields[0].name).toBe('🔍 unknown');
  });

  describe('search count in embed footer', () => {
    it('should append search count when > 0', () => {
      const embed = buildDebugEmbed(classifyStats, respondStats, 'verbose', { searchCount: 2 });
      expect(embed.data.footer.text).toBe('Σ $0.021 • 2.3s • 🔎×2');
    });

    it('should not show search indicator when searchCount is 0', () => {
      const embed = buildDebugEmbed(classifyStats, respondStats, 'verbose', { searchCount: 0 });
      expect(embed.data.footer.text).toBe('Σ $0.021 • 2.3s');
    });

    it('should not show search indicator when options omitted', () => {
      const embed = buildDebugEmbed(classifyStats, respondStats, 'verbose');
      expect(embed.data.footer.text).toBe('Σ $0.021 • 2.3s');
    });
  });
});

// ── logAiUsage ──────────────────────────────────────────────────────────────

describe('logAiUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue({});
  });

  it('should insert two rows (classify + respond) with user_id and search_count', () => {
    const stats = {
      classify: {
        model: 'claude-haiku-4-5',
        inputTokens: 48,
        outputTokens: 12,
        cacheCreation: 8,
        cacheRead: 0,
        cost: 0.001,
        durationMs: 50,
      },
      respond: {
        model: 'claude-sonnet-4-6',
        inputTokens: 1204,
        outputTokens: 340,
        cacheCreation: 120,
        cacheRead: 800,
        cost: 0.02,
        durationMs: 2250,
      },
      userId: 'user-123',
      searchCount: 2,
    };

    logAiUsage('guild-1', 'ch-1', stats);

    expect(mockQuery).toHaveBeenCalledTimes(2);

    // First call: classify — user_id set, search_count always 0
    const classifyArgs = mockQuery.mock.calls[0][1];
    expect(classifyArgs[0]).toBe('guild-1');
    expect(classifyArgs[1]).toBe('ch-1');
    expect(classifyArgs[2]).toBe('classify');
    expect(classifyArgs[3]).toBe('claude-haiku-4-5');
    expect(classifyArgs[4]).toBe(48);
    expect(classifyArgs[10]).toBe('user-123'); // user_id
    expect(classifyArgs[11]).toBe(0); // search_count (classify never searches)

    // Second call: respond — user_id and search_count set
    const respondArgs = mockQuery.mock.calls[1][1];
    expect(respondArgs[2]).toBe('respond');
    expect(respondArgs[3]).toBe('claude-sonnet-4-6');
    expect(respondArgs[4]).toBe(1204);
    expect(respondArgs[10]).toBe('user-123'); // user_id
    expect(respondArgs[11]).toBe(2); // search_count
  });

  it('should silently skip when database is not available', () => {
    getPool.mockImplementationOnce(() => {
      throw new Error('Database not initialized');
    });

    logAiUsage('guild-1', 'ch-1', { classify: {}, respond: {} });

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('should use defaults for missing stats fields', () => {
    logAiUsage('guild-1', 'ch-1', { classify: {}, respond: {} });

    const classifyArgs = mockQuery.mock.calls[0][1];
    expect(classifyArgs[0]).toBe('guild-1');
    expect(classifyArgs[3]).toBe('unknown'); // model
    expect(classifyArgs[4]).toBe(0); // inputTokens
    expect(classifyArgs[8]).toBe(0); // cost
    expect(classifyArgs[10]).toBeNull(); // user_id
    expect(classifyArgs[11]).toBe(0); // search_count
  });

  it('should use "unknown" for null guildId', () => {
    logAiUsage(null, 'ch-1', { classify: {}, respond: {} });

    const classifyArgs = mockQuery.mock.calls[0][1];
    expect(classifyArgs[0]).toBeNull();
  });

  it('should catch and log query errors without throwing', async () => {
    const queryError = new Error('insert failed');
    mockQuery.mockRejectedValue(queryError);

    logAiUsage('guild-1', 'ch-1', { classify: {}, respond: {} });

    // Wait for the rejected promises to settle
    await vi.waitFor(() => {
      expect(logError).toHaveBeenCalledWith(
        'Failed to log AI usage (classify)',
        expect.objectContaining({ error: 'insert failed' }),
      );
    });
  });
});
