import { describe, expect, it } from 'vitest';
import migration006 from '../../migrations/006_command_usage.cjs';
import {
  COMMAND_USAGE_INDEXES,
  COMMAND_USAGE_TABLE,
} from '../../src/utils/commandUsageContract.js';

function createFakeMigrationBuilder() {
  const statements = [];

  return {
    sql(sqlText) {
      statements.push(sqlText);
    },
    statements,
  };
}

describe('migration 006_command_usage', () => {
  it('creates command usage table and all contract indexes in up migration', () => {
    const pgm = createFakeMigrationBuilder();
    migration006.up(pgm);

    const sqlScript = pgm.statements.join('\n');

    expect(sqlScript).toContain(`CREATE TABLE IF NOT EXISTS ${COMMAND_USAGE_TABLE}`);
    for (const indexName of COMMAND_USAGE_INDEXES) {
      expect(sqlScript).toContain(`CREATE INDEX IF NOT EXISTS ${indexName}`);
    }
  });

  it('drops indexes and table in down migration for rollback safety', () => {
    const pgm = createFakeMigrationBuilder();
    migration006.down(pgm);

    const sqlScript = pgm.statements.join('\n');
    for (const indexName of COMMAND_USAGE_INDEXES) {
      expect(sqlScript).toContain(`DROP INDEX IF EXISTS ${indexName}`);
    }
    expect(sqlScript).toContain(`DROP TABLE IF EXISTS ${COMMAND_USAGE_TABLE}`);
  });
});
