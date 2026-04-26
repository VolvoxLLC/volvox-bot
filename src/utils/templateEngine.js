/**
 * Template Interpolation Engine
 * Replaces {{variable}} tokens in strings with values from a context object.
 * Used by level-up actions for DMs, announcements, embeds, and webhooks.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/367
 */

import { getPool } from '../db.js';

/** Matches `{{variableName}}` tokens. Only word characters allowed inside braces. */
const TEMPLATE_REGEX = /\{\{(\w+)\}\}/g;

/**
 * Replace `{{variable}}` tokens in a template string with values from context.
 * - Known variables with a value: replaced with the value.
 * - Known variables with null/undefined: replaced with empty string.
 * - Unknown tokens (key not in context): left as-is.
 *
 * @param {string} template - Template string with `{{variable}}` placeholders.
 * @param {Record<string, string | null | undefined>} context - Variable name → value map.
 * @returns {string} Rendered string.
 */
export function renderTemplate(template, context) {
  if (!template) return '';
  return template.replace(TEMPLATE_REGEX, (match, varName) => {
    if (!Object.hasOwn(context, varName)) return match;
    return context[varName] ?? '';
  });
}

/**
 * Check whether a string is within a character limit.
 * NOTE: renderTemplate and validateLength are currently used by tests and will be
 * used when messaging actions are implemented (Phase 2). They are not dead code.
 *
 * @param {string} text - The text to validate.
 * @param {number} limit - Maximum allowed character count.
 * @returns {{ valid: boolean, length: number, limit: number }}
 */
export function validateLength(text, limit) {
  const length = text.length;
  return { valid: length <= limit, length, limit };
}

/**
 * Format a number with comma separators.
 *
 * @param {number} n
 * @returns {string}
 */
function formatNumber(n) {
  return Number(n).toLocaleString('en-US');
}

/**
 * Collect all template variables from Discord objects and DB data.
 * DB queries (rank, messages, voiceHours, daysActive) fail gracefully — missing data
 * returns the documented fallback value.
 *
 * @param {Object} params
 * @param {import('discord.js').GuildMember} params.member
 * @param {import('discord.js').Message} params.message
 * @param {import('discord.js').Guild} params.guild
 * @param {number} params.level
 * @param {number} params.previousLevel
 * @param {number} params.xp
 * @param {number[]} params.levelThresholds
 * @param {string|null} params.roleName
 * @param {string|null} params.roleId
 * @returns {Promise<Record<string, string>>}
 */
export async function buildTemplateContext({
  member,
  message,
  guild,
  level,
  previousLevel,
  xp,
  levelThresholds,
  roleName,
  roleId,
}) {
  const nextThreshold = levelThresholds[level] ?? null;
  const xpToNext = nextThreshold !== null ? nextThreshold - xp : 0;
  const userId = member.user?.id ?? member.id ?? '';
  const guildId = guild.id ?? member.guild?.id ?? '';
  const serverName = guild.name ?? '';

  // DB queries for rank, messages, voiceHours, daysActive — all best-effort
  let rank = '?';
  let messages = '0';
  let voiceHours = '0';
  let daysActive = '0';

  try {
    const pool = getPool();

    const [rankResult, statsResult] = await Promise.all([
      pool.query('SELECT COUNT(*) + 1 AS rank FROM reputation WHERE guild_id = $1 AND xp > $2', [
        guildId,
        xp,
      ]),
      pool.query(
        `SELECT
           r.messages_count,
           us.days_active,
           COALESCE((
             SELECT SUM(duration_seconds)
             FROM voice_sessions
             WHERE guild_id = $1 AND user_id = $2 AND left_at IS NOT NULL
           ), 0) AS voice_seconds
         FROM reputation r
         LEFT JOIN user_stats us ON us.guild_id = r.guild_id AND us.user_id = r.user_id
         WHERE r.guild_id = $1 AND r.user_id = $2`,
        [guildId, userId],
      ),
    ]);

    rank = `#${rankResult.rows[0]?.rank ?? 1}`;

    if (statsResult.rows[0]) {
      const row = statsResult.rows[0];
      messages = formatNumber(row.messages_count ?? 0);
      daysActive = String(row.days_active ?? 0);
      voiceHours = String(Math.round(((row.voice_seconds ?? 0) / 3600) * 10) / 10);
    }
  } catch {
    // DB unavailable — use fallback values
  }

  return {
    // Use member.displayName (guild nickname) not member.user.displayName
    username: member.displayName ?? member.user?.displayName ?? '',
    mention: userId ? `<@${userId}>` : '',
    userId,
    avatar: member.user?.displayAvatarURL?.() ?? '',
    level: String(level),
    previousLevel: String(previousLevel),
    xp: formatNumber(xp),
    xpToNext: formatNumber(Math.max(0, xpToNext)),
    // nextLevel should be level + 1, not the XP threshold
    nextLevel: nextThreshold !== null ? String(level + 1) : '0',
    serverName,
    serverId: guildId,
    server: serverName,
    serverIcon: guild.iconURL?.() ?? '',
    memberCount: formatNumber(guild.memberCount ?? 0),
    // Guard message before reading channel
    channel: message?.channel?.name ? `#${message.channel.name}` : '',
    rank,
    messages,
    roleName: roleName ?? '',
    roleMention: roleId ? `<@&${roleId}>` : '',
    voiceHours,
    daysActive,
    joinDate: member.joinedAt
      ? member.joinedAt.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : '',
  };
}
