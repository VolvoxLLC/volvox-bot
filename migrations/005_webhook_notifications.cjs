/* eslint-disable */
'use strict';

/**
 * Migration 005: Webhook notifications delivery log
 *
 * Creates webhook_delivery_log table to store delivery attempts
 * per webhook endpoint. Endpoint configs live in the per-guild config JSON.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS webhook_delivery_log (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      endpoint_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload JSONB NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'pending')),
      response_code INTEGER,
      response_body TEXT,
      attempt INTEGER NOT NULL DEFAULT 1,
      delivered_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_webhook_delivery_log_guild
      ON webhook_delivery_log (guild_id, delivered_at DESC);

    CREATE INDEX IF NOT EXISTS idx_webhook_delivery_log_endpoint
      ON webhook_delivery_log (endpoint_id, delivered_at DESC);
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_webhook_delivery_log_endpoint;
    DROP INDEX IF EXISTS idx_webhook_delivery_log_guild;
    DROP TABLE IF EXISTS webhook_delivery_log;
  `);
};
