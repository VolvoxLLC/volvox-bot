/**
 * Initial schema migration.
 *
 * Captures ALL existing tables and indexes from the codebase so that
 * node-pg-migrate becomes the single source of truth for DDL.
 *
 * Uses IF NOT EXISTS throughout so this migration is idempotent and
 * safe to run against databases that already have these tables.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // 1. config
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS config (
      guild_id TEXT NOT NULL DEFAULT 'global',
      key TEXT NOT NULL,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (guild_id, key)
    )
  `);

  // 2. conversations
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS conversations (
      id SERIAL PRIMARY KEY,
      channel_id TEXT NOT NULL,
      guild_id TEXT,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      username TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_conversations_guild_id ON conversations (guild_id)');
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_conversations_channel_created ON conversations (channel_id, created_at)');
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations (created_at)');

  // 3. mod_cases
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS mod_cases (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      case_number INTEGER NOT NULL,
      action TEXT NOT NULL,
      target_id TEXT NOT NULL,
      target_tag TEXT NOT NULL,
      moderator_id TEXT NOT NULL,
      moderator_tag TEXT NOT NULL,
      reason TEXT,
      duration TEXT,
      expires_at TIMESTAMPTZ,
      log_message_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(guild_id, case_number)
    )
  `);
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_mod_cases_guild_target ON mod_cases (guild_id, target_id, created_at)');

  // 4. mod_scheduled_actions (FK → mod_cases)
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS mod_scheduled_actions (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target_id TEXT NOT NULL,
      case_id INTEGER REFERENCES mod_cases(id) ON DELETE SET NULL,
      execute_at TIMESTAMPTZ NOT NULL,
      executed BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_mod_scheduled_actions_pending ON mod_scheduled_actions (executed, execute_at)');

  // 5. memory_optouts
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS memory_optouts (
      user_id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // 6. ai_usage
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS ai_usage (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('classify', 'respond')),
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      user_id TEXT DEFAULT NULL,
      search_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_ai_usage_guild_created ON ai_usage (guild_id, created_at)');
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON ai_usage (created_at)');
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_ai_usage_user_created ON ai_usage (user_id, created_at) WHERE user_id IS NOT NULL');

  // 7. logs
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS logs (
      id SERIAL PRIMARY KEY,
      level VARCHAR(10) NOT NULL,
      message TEXT NOT NULL,
      metadata JSONB DEFAULT '{}',
      timestamp TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs (timestamp)');
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_logs_level ON logs (level)');

  // 8. bot_restarts
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS bot_restarts (
      id SERIAL PRIMARY KEY,
      timestamp TIMESTAMPTZ DEFAULT NOW(),
      reason TEXT NOT NULL DEFAULT 'startup',
      version TEXT,
      uptime_seconds NUMERIC
    )
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  // Drop in reverse FK order
  pgm.sql('DROP TABLE IF EXISTS bot_restarts CASCADE');
  pgm.sql('DROP TABLE IF EXISTS logs CASCADE');
  pgm.sql('DROP TABLE IF EXISTS ai_usage CASCADE');
  pgm.sql('DROP TABLE IF EXISTS memory_optouts CASCADE');
  pgm.sql('DROP TABLE IF EXISTS mod_scheduled_actions CASCADE');
  pgm.sql('DROP TABLE IF EXISTS mod_cases CASCADE');
  pgm.sql('DROP TABLE IF EXISTS conversations CASCADE');
  pgm.sql('DROP TABLE IF EXISTS config CASCADE');
};
