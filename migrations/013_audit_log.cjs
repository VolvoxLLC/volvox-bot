/**
 * Migration 013 — Audit Log
 *
 * Creates the `audit_logs` table for recording all admin actions performed
 * via the bot API (config changes, XP adjustments, warnings, etc.).
 *
 * Indexes:
 *   - (guild_id, created_at DESC) — primary query pattern for the dashboard
 *   - (guild_id, user_id)         — filter by admin user within a guild
 */

/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  pgm.createTable('audit_logs', {
    id: {
      type: 'SERIAL',
      primaryKey: true,
    },
    guild_id: {
      type: 'VARCHAR(20)',
      notNull: true,
    },
    user_id: {
      type: 'VARCHAR(20)',
      notNull: true,
    },
    user_tag: {
      type: 'VARCHAR(100)',
      notNull: false,
    },
    action: {
      type: 'VARCHAR(100)',
      notNull: true,
    },
    target_type: {
      type: 'VARCHAR(50)',
      notNull: false,
    },
    target_id: {
      type: 'VARCHAR(100)',
      notNull: false,
    },
    details: {
      type: 'JSONB',
      notNull: false,
    },
    ip_address: {
      type: 'VARCHAR(45)',
      notNull: false,
    },
    created_at: {
      type: 'TIMESTAMPTZ',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  }, {
    ifNotExists: true,
  });

  // Primary access pattern: guild's audit log ordered by recency
  pgm.createIndex('audit_logs', ['guild_id', 'created_at'], {
    name: 'idx_audit_logs_guild_created',
    order: { created_at: 'DESC' },
    ifNotExists: true,
  });

  // Filter by admin user within a guild
  pgm.createIndex('audit_logs', ['guild_id', 'user_id'], {
    name: 'idx_audit_logs_guild_user',
    ifNotExists: true,
  });
};

/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.down = (pgm) => {
  pgm.dropTable('audit_logs');
};
