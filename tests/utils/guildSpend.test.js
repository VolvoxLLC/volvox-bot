import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks (before imports) ───────────────────────────────────────────────────

const mockQuery = vi.fn();
const mockPool = { query: mockQuery };
const mockGetPool = vi.fn(() => mockPool);

vi.mock('../../src/db.js', () => ({
  getPool: () => mockGetPool(),
}));

vi.mock('../../src/logger.js', () => ({
  warn: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

import { warn } from '../../src/logger.js';
import { checkGuildBudget, getGuildSpend } from '../../src/utils/guildSpend.js';

function setupPool() {
  mockGetPool.mockReturnValue(mockPool);
  mockQuery.mockReset();
}

// ── getGuildSpend ────────────────────────────────────────────────────────────

describe('getGuildSpend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupPool();
  });

  it('returns 0 when guildId is falsy', async () => {
    expect(await getGuildSpend(null)).toBe(0);
    expect(await getGuildSpend(undefined)).toBe(0);
    expect(await getGuildSpend('')).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns 0 when db pool is unavailable', async () => {
    mockGetPool.mockImplementation(() => {
      throw new Error('no pool');
    });
    expect(await getGuildSpend('guild-123')).toBe(0);
  });

  it('queries ai_usage with guild_id and rolling window', async () => {
    mockQuery.mockResolvedValue({ rows: [{ total: '5.2500' }] });

    const result = await getGuildSpend('guild-123', 86400000);

    expect(result).toBeCloseTo(5.25);
    expect(mockQuery).toHaveBeenCalledOnce();
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/ai_usage/);
    expect(sql).toMatch(/guild_id = \$1/);
    expect(sql).toMatch(/created_at >= \$2/);
    expect(params[0]).toBe('guild-123');
    expect(params[1]).toBeInstanceOf(Date);
  });

  it('uses 24-hour window by default', async () => {
    mockQuery.mockResolvedValue({ rows: [{ total: '0' }] });
    const before = Date.now();
    await getGuildSpend('guild-123');
    const [, params] = mockQuery.mock.calls[0];
    const since = params[1];
    const windowMs = Date.now() - since.getTime();
    // The since date should be approximately 24h ago
    expect(windowMs).toBeGreaterThan(86400000 - 2000);
    expect(windowMs).toBeLessThan(86400000 + 2000);
  });

  it('returns 0 when rows have null total (COALESCE edge case)', async () => {
    mockQuery.mockResolvedValue({ rows: [{ total: null }] });
    expect(await getGuildSpend('guild-123')).toBe(0);
  });

  it('returns 0 and logs warning on query error', async () => {
    mockQuery.mockRejectedValue(new Error('connection reset'));
    expect(await getGuildSpend('guild-123')).toBe(0);
    expect(warn).toHaveBeenCalledWith(
      'getGuildSpend query failed',
      expect.objectContaining({ guildId: 'guild-123' }),
    );
  });
});

// ── checkGuildBudget ─────────────────────────────────────────────────────────

describe('checkGuildBudget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupPool();
  });

  it('returns ok when spend is under 80% of budget', async () => {
    mockQuery.mockResolvedValue({ rows: [{ total: '2.00' }] });
    const result = await checkGuildBudget('guild-123', 10);
    expect(result.status).toBe('ok');
    expect(result.spend).toBeCloseTo(2.0);
    expect(result.budget).toBe(10);
    expect(result.pct).toBeCloseTo(0.2);
  });

  it('returns warning when spend is between 80% and 100% of budget', async () => {
    mockQuery.mockResolvedValue({ rows: [{ total: '8.50' }] });
    const result = await checkGuildBudget('guild-123', 10);
    expect(result.status).toBe('warning');
    expect(result.pct).toBeCloseTo(0.85);
  });

  it('returns warning at exactly 80% of budget', async () => {
    mockQuery.mockResolvedValue({ rows: [{ total: '8.00' }] });
    const result = await checkGuildBudget('guild-123', 10);
    expect(result.status).toBe('warning');
  });

  it('returns exceeded when spend is exactly at budget', async () => {
    mockQuery.mockResolvedValue({ rows: [{ total: '10.00' }] });
    const result = await checkGuildBudget('guild-123', 10);
    expect(result.status).toBe('exceeded');
    expect(result.pct).toBeCloseTo(1.0);
  });

  it('returns exceeded when spend exceeds budget', async () => {
    mockQuery.mockResolvedValue({ rows: [{ total: '15.50' }] });
    const result = await checkGuildBudget('guild-123', 10);
    expect(result.status).toBe('exceeded');
    expect(result.pct).toBeCloseTo(1.55);
  });

  it('returns ok with pct=0 when dailyBudgetUsd is 0', async () => {
    mockQuery.mockResolvedValue({ rows: [{ total: '5.00' }] });
    const result = await checkGuildBudget('guild-123', 0);
    expect(result.status).toBe('ok');
    expect(result.pct).toBe(0);
  });

  it('passes custom windowMs through to getGuildSpend', async () => {
    mockQuery.mockResolvedValue({ rows: [{ total: '1.00' }] });
    await checkGuildBudget('guild-123', 10, 3600000); // 1h window
    const [, params] = mockQuery.mock.calls[0];
    const since = params[1];
    const windowMs = Date.now() - since.getTime();
    expect(windowMs).toBeLessThan(3600000 + 2000);
    expect(windowMs).toBeGreaterThan(3600000 - 2000);
  });
});
