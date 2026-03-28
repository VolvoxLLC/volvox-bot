/**
 * nickPrefix / nickSuffix Action Handlers
 * Update a user's server nickname with a templated prefix or suffix.
 * Respects Discord's 32-char nickname limit and permission requirements.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/369
 */

import { PermissionFlagsBits } from 'discord.js';
import { info, warn } from '../../logger.js';
import { renderTemplate } from '../../utils/templateEngine.js';

/** Discord nickname character limit. */
const NICK_LIMIT = 32;

/**
 * Check if the bot can manage nicknames in the guild.
 *
 * @param {import('discord.js').Guild} guild
 * @returns {boolean}
 */
function canManageNicknames(guild) {
  const me = guild.members?.me;
  if (!me) return false;
  return me.permissions.has(PermissionFlagsBits.ManageNicknames);
}

/**
 * Check if the member is the server owner (whose nickname cannot be changed by bots).
 *
 * @param {import('discord.js').GuildMember} member
 * @param {import('discord.js').Guild} guild
 * @returns {boolean}
 */
function isServerOwner(member, guild) {
  return member.id === guild.ownerId;
}

/**
 * Apply a prefix to the member's nickname.
 * Template tokens in the prefix are rendered using the pipeline's template context.
 *
 * @param {Object} action - { type: "nickPrefix", template: string }
 * @param {Object} context - Pipeline context
 */
export async function handleNickPrefix(action, context) {
  const { member, guild, templateContext } = context;
  const guildId = guild.id;
  const userId = member.user?.id;

  if (!canManageNicknames(guild)) {
    warn('nickPrefix skipped — missing MANAGE_NICKNAMES permission', { guildId, userId });
    return;
  }

  if (isServerOwner(member, guild)) {
    warn('nickPrefix skipped — cannot change server owner nickname', { guildId, userId });
    return;
  }

  const prefix = renderTemplate(action.template ?? '', templateContext);
  if (!prefix) {
    warn('nickPrefix skipped — rendered template is empty', { guildId, userId });
    return;
  }

  // Use the member's current display name (or username as fallback)
  const currentName = member.displayName ?? member.user?.displayName ?? '';

  // Strip any existing instance of an old prefix if it matches the same pattern start
  // For simplicity, just prepend and truncate
  const newNick = `${prefix}${currentName}`.slice(0, NICK_LIMIT);

  await member.setNickname(newNick);
  info('nickPrefix applied', { guildId, userId, newNick });
}

/**
 * Apply a suffix to the member's nickname.
 * Template tokens in the suffix are rendered using the pipeline's template context.
 *
 * @param {Object} action - { type: "nickSuffix", template: string }
 * @param {Object} context - Pipeline context
 */
export async function handleNickSuffix(action, context) {
  const { member, guild, templateContext } = context;
  const guildId = guild.id;
  const userId = member.user?.id;

  if (!canManageNicknames(guild)) {
    warn('nickSuffix skipped — missing MANAGE_NICKNAMES permission', { guildId, userId });
    return;
  }

  if (isServerOwner(member, guild)) {
    warn('nickSuffix skipped — cannot change server owner nickname', { guildId, userId });
    return;
  }

  const suffix = renderTemplate(action.template ?? '', templateContext);
  if (!suffix) {
    warn('nickSuffix skipped — rendered template is empty', { guildId, userId });
    return;
  }

  const currentName = member.displayName ?? member.user?.displayName ?? '';

  // Truncate the base name to make room for the suffix, then append
  const maxBase = NICK_LIMIT - suffix.length;
  const baseName = maxBase > 0 ? currentName.slice(0, maxBase) : '';
  const newNick = `${baseName}${suffix}`.slice(0, NICK_LIMIT);

  await member.setNickname(newNick);
  info('nickSuffix applied', { guildId, userId, newNick });
}
