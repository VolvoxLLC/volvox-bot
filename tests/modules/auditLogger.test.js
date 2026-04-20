/**
 * Unit tests for src/modules/auditLogger.js
 *
 * Covers:
 *   - logAuditEvent: successful insert, graceful degradation, missing fields
 *   - purgeOldAuditLogs: normal purge, disabled (retentionDays=0), missing table, DB error
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import * as logger from '../../src/logger.js';
import { logAuditEvent, purgeOldAuditLogs } from '../../src/modules/auditLogger.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

function makePool(overrides = {}) {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    ...overrides,
  };
}

const BASE_EVENT = {
  guildId: 'guild1',
  userId: 'user1',
  userTag: 'Admin#0001',
  action: 'config.update',
  targetType: 'config',
  targetId: 'guild1',
  targetTag: 'Admin#0001',
  details: { before: { key: 'old' }, after: { key: 'new' } },
  ipAddress: '127.0.0.1',
};

// ─── logAuditEvent ────────────────────────────────────────────────────────────

describe('logAuditEvent', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('inserts a row with all provided fields', async () => {
    const pool = makePool();
    await logAuditEvent(pool, BASE_EVENT);

    expect(pool.query).toHaveBeenCalledOnce();
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO audit_logs/i);
    expect(params[0]).toBe('guild1');
    expect(params[1]).toBe('user1');
    expect(params[2]).toBe('Admin#0001');
    expect(params[3]).toBe('config.update');
    expect(params[4]).toBe('config');
    expect(params[5]).toBe('guild1');
    expect(params[6]).toBe('Admin#0001');
    expect(JSON.parse(params[7])).toEqual(BASE_EVENT.details);
    expect(params[8]).toBe('127.0.0.1');
  });

  it('logs info after successful insert', async () => {
    const pool = makePool();
    await logAuditEvent(pool, BASE_EVENT);
    expect(logger.info).toHaveBeenCalledWith(
      'auditLogger: event recorded',
      expect.objectContaining({ action: 'config.update', guildId: 'guild1' }),
    );
  });

  it('uses null for optional fields when omitted', async () => {
    const pool = makePool();
    await logAuditEvent(pool, {
      guildId: 'g1',
      userId: 'u1',
      action: 'member.update',
    });
    const params = pool.query.mock.calls[0][1];
    expect(params[2]).toBeNull(); // userTag
    expect(params[4]).toBeNull(); // targetType
    expect(params[5]).toBeNull(); // targetId
    expect(params[6]).toBe(''); // targetTag (NOT NULL column)
    expect(params[7]).toBeNull(); // details
    expect(params[8]).toBeNull(); // ipAddress
  });

  it('serialises details as JSON string', async () => {
    const pool = makePool();
    const details = { amount: 100, reason: 'test' };
    await logAuditEvent(pool, { ...BASE_EVENT, details });
    const params = pool.query.mock.calls[0][1];
    expect(params[7]).toBe(JSON.stringify(details));
  });

  it('warns and skips when pool is null', async () => {
    await logAuditEvent(null, BASE_EVENT);
    expect(logger.warn).toHaveBeenCalledWith(
      'auditLogger: DB pool unavailable, skipping audit event',
      expect.objectContaining({ action: 'config.update' }),
    );
  });

  it('warns and skips when pool is undefined', async () => {
    await logAuditEvent(undefined, BASE_EVENT);
    expect(logger.warn).toHaveBeenCalledWith(
      'auditLogger: DB pool unavailable, skipping audit event',
      expect.any(Object),
    );
  });

  it('warns when guildId is missing', async () => {
    const pool = makePool();
    await logAuditEvent(pool, { userId: 'u1', action: 'x.y' });
    expect(pool.query).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('missing required fields'),
      expect.any(Object),
    );
  });

  it('warns when userId is missing', async () => {
    const pool = makePool();
    await logAuditEvent(pool, { guildId: 'g1', action: 'x.y' });
    expect(pool.query).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('warns when action is missing', async () => {
    const pool = makePool();
    await logAuditEvent(pool, { guildId: 'g1', userId: 'u1' });
    expect(pool.query).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('logs error but does NOT throw when DB query fails', async () => {
    const pool = makePool({
      query: vi.fn().mockRejectedValue(new Error('connection refused')),
    });
    await expect(logAuditEvent(pool, BASE_EVENT)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      'auditLogger: failed to insert audit event',
      expect.objectContaining({ error: 'connection refused' }),
    );
  });

  it('does not throw when event is nullish', async () => {
    const pool = makePool();
    await expect(logAuditEvent(pool, null)).resolves.toBeUndefined();
    await expect(logAuditEvent(pool, undefined)).resolves.toBeUndefined();
  });
});

// ─── purgeOldAuditLogs ────────────────────────────────────────────────────────

describe('purgeOldAuditLogs', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('deletes rows older than retentionDays and returns count', async () => {
    const pool = makePool({ query: vi.fn().mockResolvedValue({ rowCount: 42 }) });
    const count = await purgeOldAuditLogs(pool, 90);
    expect(count).toBe(42);
    expect(pool.query).toHaveBeenCalledOnce();
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/DELETE FROM audit_logs/i);
    expect(params[0]).toBe(90);
  });

  it('logs info when rows are purged', async () => {
    const pool = makePool({ query: vi.fn().mockResolvedValue({ rowCount: 5 }) });
    await purgeOldAuditLogs(pool, 30);
    expect(logger.info).toHaveBeenCalledWith(
      'auditLogger: purged old audit log entries',
      expect.objectContaining({ count: 5, retentionDays: 30 }),
    );
  });

  it('does not log info when no rows purged', async () => {
    const pool = makePool();
    await purgeOldAuditLogs(pool, 90);
    const purgeInfoCalls = logger.info.mock.calls.filter(
      ([msg]) => typeof msg === 'string' && msg.includes('purged'),
    );
    expect(purgeInfoCalls).toHaveLength(0);
  });

  it('skips purge and returns 0 when retentionDays is 0', async () => {
    const pool = makePool();
    const count = await purgeOldAuditLogs(pool, 0);
    expect(count).toBe(0);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('skips purge and returns 0 when pool is null', async () => {
    const count = await purgeOldAuditLogs(null, 90);
    expect(count).toBe(0);
  });

  it('returns 0 and warns when audit_logs table does not exist (42P01)', async () => {
    const err = Object.assign(new Error('relation does not exist'), { code: '42P01' });
    const pool = makePool({ query: vi.fn().mockRejectedValue(err) });
    const count = await purgeOldAuditLogs(pool, 90);
    expect(count).toBe(0);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('audit_logs table does not exist'),
      expect.any(Object),
    );
  });

  it('returns 0 and logs error on unexpected DB failure', async () => {
    const pool = makePool({
      query: vi.fn().mockRejectedValue(new Error('disk full')),
    });
    const count = await purgeOldAuditLogs(pool, 90);
    expect(count).toBe(0);
    expect(logger.error).toHaveBeenCalledWith(
      'auditLogger: failed to purge old audit log entries',
      expect.objectContaining({ error: 'disk full' }),
    );
  });

  it('uses default retentionDays of 90 when not provided', async () => {
    const pool = makePool();
    await purgeOldAuditLogs(pool);
    const params = pool.query.mock.calls[0][1];
    expect(params[0]).toBe(90);
  });
});
