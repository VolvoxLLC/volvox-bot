/**
 * Reaction Roles Module
 *
 * Allows members to self-assign roles by reacting to a pinned message.
 * Mappings are persisted in PostgreSQL so they survive bot restarts.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/162
 */

import { EmbedBuilder } from 'discord.js';
import { getPool } from '../db.js';
import { debug, info, error as logError, warn } from '../logger.js';

// ── DB helpers ────────────────────────────────────────────────────────────────

/**
 * Insert a new reaction-role menu row and return it.
 *
 * @param {string} guildId
 * @param {string} channelId
 * @param {string} messageId
 * @param {string} title
 * @param {string|null} description
 * @returns {Promise<Object>} Inserted menu row
 */
export async function insertReactionRoleMenu(guildId, channelId, messageId, title, description) {
  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO reaction_role_menus (guild_id, channel_id, message_id, title, description)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (guild_id, message_id) DO UPDATE
       SET title = EXCLUDED.title, description = EXCLUDED.description
     RETURNING *`,
    [guildId, channelId, messageId, title, description ?? null],
  );
  return result.rows[0];
}

/**
 * Find a menu by its Discord message ID.
 *
 * @param {string} messageId
 * @returns {Promise<Object|null>}
 */
export async function findMenuByMessageId(messageId) {
  const pool = getPool();
  const result = await pool.query('SELECT * FROM reaction_role_menus WHERE message_id = $1', [
    messageId,
  ]);
  return result.rows[0] ?? null;
}

/**
 * List all menus for a guild.
 *
 * @param {string} guildId
 * @returns {Promise<Object[]>}
 */
export async function listMenusForGuild(guildId) {
  const pool = getPool();
  const result = await pool.query(
    'SELECT * FROM reaction_role_menus WHERE guild_id = $1 ORDER BY created_at DESC',
    [guildId],
  );
  return result.rows;
}

/**
 * Delete a menu (cascades to entries).
 *
 * @param {number} menuId
 * @returns {Promise<boolean>} True if deleted
 */
export async function deleteMenu(menuId) {
  const pool = getPool();
  const result = await pool.query('DELETE FROM reaction_role_menus WHERE id = $1', [menuId]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Add or replace an emoji→role entry on a menu.
 *
 * @param {number} menuId
 * @param {string} emoji
 * @param {string} roleId
 * @returns {Promise<Object>} Inserted/updated entry row
 */
export async function upsertReactionRoleEntry(menuId, emoji, roleId) {
  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO reaction_role_entries (menu_id, emoji, role_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (menu_id, emoji) DO UPDATE SET role_id = EXCLUDED.role_id
     RETURNING *`,
    [menuId, emoji, roleId],
  );
  return result.rows[0];
}

/**
 * Remove an emoji mapping from a menu.
 *
 * @param {number} menuId
 * @param {string} emoji
 * @returns {Promise<boolean>}
 */
export async function removeReactionRoleEntry(menuId, emoji) {
  const pool = getPool();
  const result = await pool.query(
    'DELETE FROM reaction_role_entries WHERE menu_id = $1 AND emoji = $2',
    [menuId, emoji],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Get all entries for a menu.
 *
 * @param {number} menuId
 * @returns {Promise<Object[]>}
 */
export async function getEntriesForMenu(menuId) {
  const pool = getPool();
  const result = await pool.query(
    'SELECT * FROM reaction_role_entries WHERE menu_id = $1 ORDER BY created_at ASC',
    [menuId],
  );
  return result.rows;
}

/**
 * Find the role ID for a given message + emoji combination.
 *
 * @param {string} messageId
 * @param {string} emoji
 * @returns {Promise<string|null>} roleId or null
 */
export async function findRoleForReaction(messageId, emoji) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT e.role_id
     FROM reaction_role_entries e
     JOIN reaction_role_menus m ON m.id = e.menu_id
     WHERE m.message_id = $1 AND e.emoji = $2`,
    [messageId, emoji],
  );
  return result.rows[0]?.role_id ?? null;
}

// ── Embed builder ─────────────────────────────────────────────────────────────

/**
 * Build the embed that gets posted when a reaction-role menu is created.
 *
 * @param {string} title
 * @param {string|null} description
 * @param {Array<{emoji: string, role_id: string}>} entries
 * @returns {EmbedBuilder}
 */
export function buildReactionRoleEmbed(title, description, entries = []) {
  const embed = new EmbedBuilder().setTitle(title).setColor(0x5865f2); // Discord blurple

  const lines = entries.map((e) => `${e.emoji} → <@&${e.role_id}>`);
  const bodyText = lines.length > 0 ? lines.join('\n') : '_No roles configured yet._';

  embed.setDescription([description, description ? '\n' : '', bodyText].filter(Boolean).join(''));

  embed.setFooter({ text: 'React to this message to get or remove a role.' });

  return embed;
}

// ── Event handlers ────────────────────────────────────────────────────────────

/**
 * Handle a reaction being added to a message.
 * Grants the corresponding role if the message is a reaction-role menu.
 *
 * @param {import('discord.js').MessageReaction} reaction
 * @param {import('discord.js').User} user
 */
export async function handleReactionRoleAdd(reaction, user) {
  const pool = getPool();
  if (!pool) return;

  try {
    const emoji = resolveEmojiString(reaction.emoji);
    const messageId = reaction.message.id;

    const roleId = await findRoleForReaction(messageId, emoji);
    if (!roleId) return; // Not a reaction-role menu or emoji not mapped

    const guild = reaction.message.guild;
    if (!guild) return;

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      warn('Reaction role: could not fetch member', { userId: user.id, guildId: guild.id });
      return;
    }

    const role =
      guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null));
    if (!role) {
      warn('Reaction role: role not found', { roleId, guildId: guild.id });
      return;
    }

    if (member.roles.cache.has(roleId)) {
      debug('Reaction role: member already has role', { userId: user.id, roleId });
      return;
    }

    await member.roles.add(role, 'Reaction role assignment');
    info('Reaction role granted', { userId: user.id, roleId, guildId: guild.id });
  } catch (err) {
    logError('handleReactionRoleAdd failed', {
      messageId: reaction.message?.id,
      userId: user?.id,
      error: err?.message,
    });
  }
}

/**
 * Handle a reaction being removed from a message.
 * Revokes the corresponding role if the message is a reaction-role menu.
 *
 * @param {import('discord.js').MessageReaction} reaction
 * @param {import('discord.js').User} user
 */
export async function handleReactionRoleRemove(reaction, user) {
  const pool = getPool();
  if (!pool) return;

  try {
    const emoji = resolveEmojiString(reaction.emoji);
    const messageId = reaction.message.id;

    const roleId = await findRoleForReaction(messageId, emoji);
    if (!roleId) return;

    const guild = reaction.message.guild;
    if (!guild) return;

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      warn('Reaction role: could not fetch member for removal', {
        userId: user.id,
        guildId: guild.id,
      });
      return;
    }

    if (!member.roles.cache.has(roleId)) {
      debug('Reaction role: member does not have role to remove', { userId: user.id, roleId });
      return;
    }

    await member.roles.remove(roleId, 'Reaction role removal');
    info('Reaction role revoked', { userId: user.id, roleId, guildId: guild.id });
  } catch (err) {
    logError('handleReactionRoleRemove failed', {
      messageId: reaction.message?.id,
      userId: user?.id,
      error: err?.message,
    });
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Convert a Discord.js ReactionEmoji to a stable string key.
 * Custom emojis use `<:name:id>` format; standard Unicode emojis use the literal character.
 *
 * @param {import('discord.js').ReactionEmoji} emoji
 * @returns {string}
 */
export function resolveEmojiString(emoji) {
  if (emoji.id) {
    // Custom emoji
    return emoji.animated ? `<a:${emoji.name}:${emoji.id}>` : `<:${emoji.name}:${emoji.id}>`;
  }
  return emoji.name; // Unicode emoji
}
