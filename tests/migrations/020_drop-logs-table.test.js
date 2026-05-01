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

  it('drops logs table before running SQL statements', () => {
    const pgm = createPgm();
    const callOrder = [];

    pgm.dropTable.mockImplementation(() => callOrder.push('dropTable'));
    pgm.sql.mockImplementation(() => callOrder.push('sql'));

    migration.up(pgm);

    expect(callOrder[0]).toBe('dropTable');
    expect(callOrder[1]).toBe('sql');
    expect(callOrder[2]).toBe('sql');
  });

  it('removes the database key from the logging config in the second SQL statement', () => {
    const pgm = createPgm();

    migration.up(pgm);

    // Second SQL removes 'database' key from logging config
    const removeSql = pgm.sql.mock.calls[1][0];
    expect(removeSql).toContain("value - 'database'");
    expect(removeSql).toContain("WHERE key = 'logging'");
    expect(removeSql).toContain("value ? 'database'");
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

  it('down() creates both timestamp and level indexes on the restored logs table', () => {
    const pgm = createPgm();

    migration.down(pgm);

    expect(pgm.createIndex).toHaveBeenCalledWith('logs', 'timestamp', {
      ifNotExists: true,
      name: 'idx_logs_timestamp',
    });
    expect(pgm.createIndex).toHaveBeenCalledWith('logs', 'level', {
      ifNotExists: true,
      name: 'idx_logs_level',
    });
  });

  it('down() runs exactly 3 SQL statements: restore existing, insert missing, delete backup', () => {
    const pgm = createPgm();

    migration.down(pgm);

    expect(pgm.sql).toHaveBeenCalledTimes(3);
    // First: update existing logging configs to restore database key
    expect(pgm.sql.mock.calls[0][0]).toContain('UPDATE config AS logging');
    // Second: insert logging config for guilds that had no logging config
    expect(pgm.sql.mock.calls[1][0]).toContain('INSERT INTO config');
    // Third: delete the backup entries
    expect(pgm.sql.mock.calls[2][0]).toContain('DELETE FROM config');
  });

  it('down() logs table schema includes id, level, message, metadata, and timestamp columns', () => {
    const pgm = createPgm();

    migration.down(pgm);

    const [, schema] = pgm.createTable.mock.calls[0];
    expect(schema).toHaveProperty('id');
    expect(schema).toHaveProperty('level');
    expect(schema).toHaveProperty('message');
    expect(schema).toHaveProperty('metadata');
    expect(schema).toHaveProperty('timestamp');
  });
});
