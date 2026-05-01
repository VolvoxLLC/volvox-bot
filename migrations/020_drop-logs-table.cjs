/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.dropTable('logs', { ifExists: true });
  pgm.sql(`
    UPDATE config
    SET value = value - 'database',
        updated_at = NOW()
    WHERE key = 'logging'
      AND jsonb_typeof(value) = 'object'
      AND value ? 'database'
  `);
};

exports.down = (pgm) => {
  pgm.createTable(
    'logs',
    {
      id: 'id',
      level: { type: 'varchar(10)', notNull: true },
      message: { type: 'text', notNull: true },
      metadata: { type: 'jsonb', default: '{}' },
      timestamp: { type: 'timestamptz', default: pgm.func('now()') },
    },
    { ifNotExists: true },
  );
  pgm.createIndex('logs', 'timestamp', { ifNotExists: true, name: 'idx_logs_timestamp' });
  pgm.createIndex('logs', 'level', { ifNotExists: true, name: 'idx_logs_level' });
  pgm.sql(`
    UPDATE config
    SET value = jsonb_set(
          value,
          '{database}',
          '{"enabled":false,"minLevel":"info","retentionDays":30,"batchSize":10,"flushIntervalMs":5000}'::jsonb,
          true
        ),
        updated_at = NOW()
    WHERE key = 'logging'
      AND jsonb_typeof(value) = 'object'
      AND NOT (value ? 'database')
  `);
};
