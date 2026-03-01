/**
 * Consolidated initial schema migration.
 *
 * Creates all tables and indexes for the bot. Uses IF NOT EXISTS
 * throughout so this migration is idempotent against existing databases.
 */

'use strict';

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // ── config ──────────────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS config (
      guild_id TEXT NOT NULL DEFAULT 'global',
      key TEXT NOT NULL,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (guild_id, key)
    )
  `);

  // ── conversations ──────────────────────────────────────────────────
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
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_conversations_guild_id ON conversations(guild_id)');
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_conversations_channel_created ON conversations(channel_id, created_at)');
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at)');
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_conversations_guild_channel_created ON conversations(guild_id, channel_id, created_at)');

  // ── mod_cases ──────────────────────────────────────────────────────
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
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_mod_cases_guild_target ON mod_cases(guild_id, target_id, created_at)');
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_mod_cases_guild_created ON mod_cases(guild_id, created_at)');

  // ── mod_scheduled_actions ──────────────────────────────────────────
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
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_mod_scheduled_actions_pending ON mod_scheduled_actions(executed, execute_at)');

  // ── memory_optouts ─────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS memory_optouts (
      user_id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // ── ai_usage ───────────────────────────────────────────────────────
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
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_ai_usage_guild_created ON ai_usage(guild_id, created_at)');
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON ai_usage(created_at)');
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_ai_usage_user_created ON ai_usage(user_id, created_at) WHERE user_id IS NOT NULL');

  // ── logs ───────────────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS logs (
      id SERIAL PRIMARY KEY,
      level VARCHAR(10) NOT NULL,
      message TEXT NOT NULL,
      metadata JSONB DEFAULT '{}',
      timestamp TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp)');
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level)');

  // ── bot_restarts ───────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS bot_restarts (
      id SERIAL PRIMARY KEY,
      timestamp TIMESTAMPTZ DEFAULT NOW(),
      reason TEXT NOT NULL DEFAULT 'startup',
      version TEXT,
      uptime_seconds NUMERIC
    )
  `);

  // ── help_topics ────────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS help_topics (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      topic TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      author_id TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(guild_id, topic)
    )
  `);
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_help_topics_guild ON help_topics(guild_id)');

  // ── scheduled_messages ─────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS scheduled_messages (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      content TEXT NOT NULL,
      embed_json JSONB,
      cron_expression TEXT,
      next_run TIMESTAMPTZ NOT NULL,
      author_id TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT true,
      one_time BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_scheduled_next_run ON scheduled_messages(next_run) WHERE enabled = true');

  // ── starboard_posts ────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS starboard_posts (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      source_message_id TEXT NOT NULL UNIQUE,
      source_channel_id TEXT NOT NULL,
      starboard_message_id TEXT NOT NULL,
      star_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // ── polls ──────────────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS polls (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT,
      author_id TEXT NOT NULL,
      question TEXT NOT NULL,
      options JSONB NOT NULL,
      votes JSONB NOT NULL DEFAULT '{}',
      multi_vote BOOLEAN NOT NULL DEFAULT false,
      anonymous BOOLEAN NOT NULL DEFAULT false,
      duration_minutes INTEGER,
      closes_at TIMESTAMPTZ,
      closed BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_polls_guild ON polls(guild_id)');
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_polls_open ON polls(guild_id) WHERE closed = false');

  // ── snippets ───────────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS snippets (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      name TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'text',
      code TEXT NOT NULL,
      description TEXT,
      author_id TEXT NOT NULL,
      usage_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(guild_id, name)
    )
  `);
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_snippets_guild ON snippets(guild_id)');
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_snippets_name ON snippets(guild_id, name)');

  // ── github_feed_state ──────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS github_feed_state (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      repo TEXT NOT NULL,
      last_event_id TEXT,
      last_poll_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(guild_id, repo)
    )
  `);
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_github_feed_guild ON github_feed_state(guild_id)');

  // ── afk_status ─────────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS afk_status (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT 'AFK',
      set_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(guild_id, user_id)
    )
  `);

  // ── afk_pings ──────────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS afk_pings (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      afk_user_id TEXT NOT NULL,
      pinger_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_preview TEXT,
      pinged_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_afk_pings_user ON afk_pings(guild_id, afk_user_id)');

  // ── reputation ─────────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS reputation (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      xp INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 0,
      messages_count INTEGER NOT NULL DEFAULT 0,
      voice_minutes INTEGER NOT NULL DEFAULT 0,
      helps_given INTEGER NOT NULL DEFAULT 0,
      last_xp_gain TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(guild_id, user_id)
    )
  `);
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_reputation_guild_xp ON reputation(guild_id, xp DESC)');

  // ── user_stats ─────────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS user_stats (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      messages_sent INTEGER DEFAULT 0,
      reactions_given INTEGER DEFAULT 0,
      reactions_received INTEGER DEFAULT 0,
      days_active INTEGER DEFAULT 0,
      first_seen TIMESTAMPTZ DEFAULT NOW(),
      last_active TIMESTAMPTZ DEFAULT NOW(),
      public_profile BOOLEAN NOT NULL DEFAULT FALSE,
      PRIMARY KEY (guild_id, user_id)
    )
  `);
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_user_stats_guild ON user_stats(guild_id)');
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_user_stats_guild_public ON user_stats(guild_id, public_profile) WHERE public_profile = TRUE');

  // ── showcases ──────────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS showcases (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      tech_stack TEXT[] DEFAULT '{}',
      repo_url TEXT,
      live_url TEXT,
      message_id TEXT,
      channel_id TEXT,
      upvotes INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_showcases_guild ON showcases(guild_id)');
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_showcases_author ON showcases(guild_id, author_id)');

  // ── showcase_votes ─────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS showcase_votes (
      guild_id TEXT NOT NULL,
      showcase_id INTEGER NOT NULL REFERENCES showcases(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      PRIMARY KEY (guild_id, showcase_id, user_id)
    )
  `);

  // ── reviews ────────────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS reviews (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      requester_id TEXT NOT NULL,
      reviewer_id TEXT,
      url TEXT NOT NULL,
      description TEXT NOT NULL,
      language TEXT,
      status TEXT DEFAULT 'open' CHECK (status IN ('open', 'claimed', 'completed', 'stale')),
      message_id TEXT,
      channel_id TEXT,
      thread_id TEXT,
      feedback TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      claimed_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ
    )
  `);
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_reviews_guild ON reviews(guild_id)');
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(guild_id, status)');

  // ── challenge_solves ───────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS challenge_solves (
      guild_id TEXT NOT NULL,
      challenge_date DATE NOT NULL,
      challenge_index INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      solved_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (guild_id, challenge_date, user_id)
    )
  `);
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_challenge_solves_guild ON challenge_solves(guild_id)');

  // ── flagged_messages ───────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS flagged_messages (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      conversation_first_id INTEGER NOT NULL,
      message_id INTEGER NOT NULL REFERENCES conversations(id),
      flagged_by TEXT NOT NULL,
      reason TEXT NOT NULL,
      notes TEXT,
      status TEXT DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
      resolved_by TEXT,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_flagged_messages_guild ON flagged_messages(guild_id)');
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_flagged_messages_status ON flagged_messages(guild_id, status)');

  // ── tickets ────────────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS tickets (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      topic TEXT,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
      thread_id TEXT NOT NULL,
      channel_id TEXT,
      closed_by TEXT,
      close_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      closed_at TIMESTAMPTZ,
      transcript JSONB
    )
  `);
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_tickets_guild_status ON tickets(guild_id, status)');
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(guild_id, user_id)');
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_tickets_thread_status ON tickets(thread_id, status)');

  // ── audit_logs ─────────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      guild_id VARCHAR(32) NOT NULL,
      user_id VARCHAR(32) NOT NULL,
      action VARCHAR(128) NOT NULL,
      target_type VARCHAR(64),
      target_id VARCHAR(64),
      details JSONB,
      ip_address VARCHAR(45),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_audit_logs_guild_created ON audit_logs(guild_id, created_at DESC)');
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)');

  // ── reminders ──────────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS reminders (
      id SERIAL PRIMARY KEY,
      guild_id VARCHAR NOT NULL,
      user_id VARCHAR NOT NULL,
      channel_id VARCHAR NOT NULL,
      message TEXT NOT NULL,
      remind_at TIMESTAMPTZ NOT NULL,
      recurring_cron VARCHAR,
      snoozed_count INT NOT NULL DEFAULT 0,
      failed_delivery_count INT NOT NULL DEFAULT 0,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(remind_at) WHERE completed = false');
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_reminders_user_active ON reminders(guild_id, user_id) WHERE completed = false');
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(guild_id, user_id, completed)');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql('DROP TABLE IF EXISTS reminders CASCADE');
  pgm.sql('DROP TABLE IF EXISTS audit_logs CASCADE');
  pgm.sql('DROP TABLE IF EXISTS tickets CASCADE');
  pgm.sql('DROP TABLE IF EXISTS flagged_messages CASCADE');
  pgm.sql('DROP TABLE IF EXISTS challenge_solves CASCADE');
  pgm.sql('DROP TABLE IF EXISTS reviews CASCADE');
  pgm.sql('DROP TABLE IF EXISTS showcase_votes CASCADE');
  pgm.sql('DROP TABLE IF EXISTS showcases CASCADE');
  pgm.sql('DROP TABLE IF EXISTS user_stats CASCADE');
  pgm.sql('DROP TABLE IF EXISTS reputation CASCADE');
  pgm.sql('DROP TABLE IF EXISTS afk_pings CASCADE');
  pgm.sql('DROP TABLE IF EXISTS afk_status CASCADE');
  pgm.sql('DROP TABLE IF EXISTS github_feed_state CASCADE');
  pgm.sql('DROP TABLE IF EXISTS snippets CASCADE');
  pgm.sql('DROP TABLE IF EXISTS polls CASCADE');
  pgm.sql('DROP TABLE IF EXISTS starboard_posts CASCADE');
  pgm.sql('DROP TABLE IF EXISTS scheduled_messages CASCADE');
  pgm.sql('DROP TABLE IF EXISTS help_topics CASCADE');
  pgm.sql('DROP TABLE IF EXISTS bot_restarts CASCADE');
  pgm.sql('DROP TABLE IF EXISTS logs CASCADE');
  pgm.sql('DROP TABLE IF EXISTS ai_usage CASCADE');
  pgm.sql('DROP TABLE IF EXISTS memory_optouts CASCADE');
  pgm.sql('DROP TABLE IF EXISTS mod_scheduled_actions CASCADE');
  pgm.sql('DROP TABLE IF EXISTS mod_cases CASCADE');
  pgm.sql('DROP TABLE IF EXISTS conversations CASCADE');
  pgm.sql('DROP TABLE IF EXISTS config CASCADE');
};
