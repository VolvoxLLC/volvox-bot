const LOGGING_DATABASE_BACKUP_KEY = '__migration_020_logging_database';

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.dropTable('logs', { ifExists: true });
  pgm.sql(`
    INSERT INTO config (guild_id, key, value, updated_at)
    SELECT guild_id, '${LOGGING_DATABASE_BACKUP_KEY}', value -> 'database', NOW()
    FROM config
    WHERE key = 'logging'
      AND jsonb_typeof(value) = 'object'
      AND value ? 'database'
    ON CONFLICT (guild_id, key)
    DO UPDATE SET value = EXCLUDED.value,
                  updated_at = NOW()
  `);
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
    UPDATE config AS logging
    SET value = jsonb_set(logging.value, '{database}', backup.value, true),
        updated_at = NOW()
    FROM config AS backup
    WHERE logging.guild_id = backup.guild_id
      AND logging.key = 'logging'
      AND backup.key = '${LOGGING_DATABASE_BACKUP_KEY}'
      AND jsonb_typeof(logging.value) = 'object'
      AND NOT (logging.value ? 'database')
  `);
  pgm.sql(`
    INSERT INTO config (guild_id, key, value, updated_at)
    SELECT backup.guild_id,
           'logging',
           jsonb_build_object('database', backup.value),
           NOW()
    FROM config AS backup
    WHERE backup.key = '${LOGGING_DATABASE_BACKUP_KEY}'
      AND NOT EXISTS (
        SELECT 1
        FROM config AS logging
        WHERE logging.guild_id = backup.guild_id
          AND logging.key = 'logging'
      )
  `);
  pgm.sql(`
    DELETE FROM config
    WHERE key = '${LOGGING_DATABASE_BACKUP_KEY}'
  `);
};
