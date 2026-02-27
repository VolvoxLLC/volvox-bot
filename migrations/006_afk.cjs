/**
 * Migration 006 — AFK system tables
 */

'use strict';

exports.up = (pgm) => {
  pgm.createTable(
    'afk_status',
    {
      id: { type: 'serial', primaryKey: true },
      guild_id: { type: 'text', notNull: true },
      user_id: { type: 'text', notNull: true },
      reason: { type: 'text', notNull: true, default: 'AFK' },
      set_at: { type: 'timestamptz', default: pgm.func('NOW()') },
    },
    { constraints: { unique: ['guild_id', 'user_id'] } },
  );

  pgm.createTable('afk_pings', {
    id: { type: 'serial', primaryKey: true },
    guild_id: { type: 'text', notNull: true },
    afk_user_id: { type: 'text', notNull: true },
    pinger_id: { type: 'text', notNull: true },
    channel_id: { type: 'text', notNull: true },
    message_preview: { type: 'text' },
    pinged_at: { type: 'timestamptz', default: pgm.func('NOW()') },
  });

  pgm.createIndex('afk_pings', ['guild_id', 'afk_user_id'], { name: 'idx_afk_pings_user' });
};

exports.down = (pgm) => {
  pgm.dropIndex('afk_pings', ['guild_id', 'afk_user_id'], { name: 'idx_afk_pings_user' });
  pgm.dropTable('afk_pings');
  pgm.dropTable('afk_status');
};
