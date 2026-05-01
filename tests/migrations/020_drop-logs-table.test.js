import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const migration = require('../../migrations/020_drop-logs-table.cjs');

function createPgm() {
  return {
    dropTable: vi.fn(),
    createTable: vi.fn(),
    createIndex: vi.fn(),
    func: vi.fn((name) => ({ fn: name })),
    sql: vi.fn(),
  };
}

describe('020_drop-logs-table migration', () => {
  it('backs up custom logging.database config before removing it', () => {
    const pgm = createPgm();

    migration.up(pgm);

    expect(pgm.dropTable).toHaveBeenCalledWith('logs', { ifExists: true });
    expect(pgm.sql).toHaveBeenCalledTimes(2);
    expect(pgm.sql.mock.calls[0][0]).toContain("'__migration_020_logging_database'");
    expect(pgm.sql.mock.calls[0][0]).toContain("value -> 'database'");
    expect(pgm.sql.mock.calls[0][0]).toContain('ON CONFLICT (guild_id, key)');
    expect(pgm.sql.mock.calls[1][0]).toContain("value - 'database'");
  });

  it('restores backed-up logging.database config on rollback without hard-coded defaults', () => {
    const pgm = createPgm();

    migration.down(pgm);

    const sql = pgm.sql.mock.calls.map(([statement]) => statement).join('\n');

    expect(pgm.createTable).toHaveBeenCalledWith(
      'logs',
      expect.objectContaining({ level: expect.any(Object), message: expect.any(Object) }),
      { ifNotExists: true },
    );
    expect(sql).toContain("backup.key = '__migration_020_logging_database'");
    expect(sql).toContain("jsonb_set(logging.value, '{database}', backup.value, true)");
    expect(sql).toContain("DELETE FROM config\n    WHERE key = '__migration_020_logging_database'");
    expect(sql).not.toContain('"batchSize":10');
    expect(sql).not.toContain('"flushIntervalMs":5000');
  });
});
