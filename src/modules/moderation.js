/**
 * Moderation Module
 * Shared logic for case management, DM notifications, mod log posting,
 * auto-escalation, and tempban scheduling.
 */

import { EmbedBuilder } from 'discord.js';
import { getPool } from '../db.js';
import { info, error as logError } from '../logger.js';
import { parseDuration } from '../utils/duration.js';
import { getConfig } from './config.js';

/**
 * Color map for mod log embeds by action type.
 * @type {Record<string, number>}
 */
const ACTION_COLORS = {
  warn: 0xfee75c,
  kick: 0xed4245,
  timeout: 0xe67e22,
  untimeout: 0x57f287,
  ban: 0xed4245,
  tempban: 0xed4245,
  unban: 0x57f287,
  softban: 0xed4245,
  purge: 0x5865f2,
  lock: 0xe67e22,
  unlock: 0x57f287,
};

/**
 * Past-tense label for DM notifications by action type.
 * @type {Record<string, string>}
 */
const ACTION_PAST_TENSE = {
  warn: 'warned',
  kick: 'kicked',
  timeout: 'timed out',
  untimeout: 'had their timeout removed',
  ban: 'banned',
  tempban: 'temporarily banned',
  unban: 'unbanned',
  softban: 'soft-banned',
};

/**
 * Channel config key for each action type (maps to moderation.logging.channels.*).
 * @type {Record<string, string>}
 */
const ACTION_LOG_CHANNEL_KEY = {
  warn: 'warns',
  kick: 'kicks',
  timeout: 'timeouts',
  untimeout: 'timeouts',
  ban: 'bans',
  tempban: 'bans',
  unban: 'bans',
  softban: 'bans',
  purge: 'purges',
  lock: 'locks',
  unlock: 'locks',
};

/** @type {ReturnType<typeof setInterval> | null} */
let schedulerInterval = null;

/**
 * Get the next case number for a guild.
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<number>} Next sequential case number
 */
export async function getNextCaseNumber(guildId) {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT MAX(case_number) AS max_num FROM mod_cases WHERE guild_id = $1',
    [guildId],
  );
  return (rows[0]?.max_num || 0) + 1;
}

/**
 * Create a moderation case in the database.
 * @param {string} guildId - Discord guild ID
 * @param {Object} data - Case data
 * @param {string} data.action - Action type (warn, kick, ban, etc.)
 * @param {string} data.targetId - Target user ID
 * @param {string} data.targetTag - Target user tag
 * @param {string} data.moderatorId - Moderator user ID
 * @param {string} data.moderatorTag - Moderator user tag
 * @param {string} [data.reason] - Reason for action
 * @param {string} [data.duration] - Duration string (for timeout/tempban)
 * @param {Date} [data.expiresAt] - Expiration timestamp
 * @returns {Promise<Object>} Created case with case_number
 */
export async function createCase(guildId, data) {
  const pool = getPool();
  const caseNumber = await getNextCaseNumber(guildId);

  const { rows } = await pool.query(
    `INSERT INTO mod_cases
      (guild_id, case_number, action, target_id, target_tag, moderator_id, moderator_tag, reason, duration, expires_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *`,
    [
      guildId,
      caseNumber,
      data.action,
      data.targetId,
      data.targetTag,
      data.moderatorId,
      data.moderatorTag,
      data.reason || null,
      data.duration || null,
      data.expiresAt || null,
    ],
  );

  info('Moderation case created', {
    guildId,
    caseNumber,
    action: data.action,
    target: data.targetTag,
    moderator: data.moderatorTag,
  });

  return rows[0];
}

/**
 * Send a DM notification to a member before a moderation action.
 * Silently fails if the user has DMs disabled.
 * @param {import('discord.js').GuildMember} member - Target member
 * @param {string} action - Action type
 * @param {string|null} reason - Reason for the action
 * @param {string} guildName - Server name
 */
export async function sendDmNotification(member, action, reason, guildName) {
  const pastTense = ACTION_PAST_TENSE[action] || action;
  const embed = new EmbedBuilder()
    .setColor(ACTION_COLORS[action] || 0x5865f2)
    .setTitle(`You have been ${pastTense} in ${guildName}`)
    .addFields({ name: 'Reason', value: reason || 'No reason provided' })
    .setTimestamp();

  try {
    await member.send({ embeds: [embed] });
  } catch {
    // User has DMs disabled — silently continue
  }
}

/**
 * Send a mod log embed to the configured channel.
 * @param {import('discord.js').Client} client - Discord client
 * @param {Object} config - Bot configuration
 * @param {Object} caseData - Case data from createCase()
 * @returns {Promise<import('discord.js').Message|null>} Sent message or null
 */
export async function sendModLogEmbed(client, config, caseData) {
  const channels = config.moderation?.logging?.channels;
  if (!channels) return null;

  const actionKey = ACTION_LOG_CHANNEL_KEY[caseData.action];
  const channelId = channels[actionKey] || channels.default;
  if (!channelId) return null;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return null;

  const embed = new EmbedBuilder()
    .setColor(ACTION_COLORS[caseData.action] || 0x5865f2)
    .setTitle(`Case #${caseData.case_number} — ${caseData.action.toUpperCase()}`)
    .addFields(
      { name: 'Target', value: `<@${caseData.target_id}> (${caseData.target_tag})`, inline: true },
      {
        name: 'Moderator',
        value: `<@${caseData.moderator_id}> (${caseData.moderator_tag})`,
        inline: true,
      },
      { name: 'Reason', value: caseData.reason || 'No reason provided' },
    )
    .setTimestamp(caseData.created_at ? new Date(caseData.created_at) : new Date())
    .setFooter({ text: `Case #${caseData.case_number}` });

  if (caseData.duration) {
    embed.addFields({ name: 'Duration', value: caseData.duration, inline: true });
  }

  try {
    const sentMessage = await channel.send({ embeds: [embed] });

    // Store log message ID for future editing
    try {
      const pool = getPool();
      await pool.query('UPDATE mod_cases SET log_message_id = $1 WHERE id = $2', [
        sentMessage.id,
        caseData.id,
      ]);
    } catch {
      // Non-critical — log message ID storage failure
    }

    return sentMessage;
  } catch (err) {
    logError('Failed to send mod log embed', { error: err.message, channelId });
    return null;
  }
}

/**
 * Check auto-escalation thresholds after a warn.
 * Evaluates thresholds in order; first match triggers.
 * @param {import('discord.js').Client} client - Discord client
 * @param {string} guildId - Discord guild ID
 * @param {string} targetId - Target user ID
 * @param {string} moderatorId - Moderator user ID (bot for auto-escalation)
 * @param {string} moderatorTag - Moderator tag
 * @param {Object} config - Bot configuration
 * @returns {Promise<Object|null>} Escalation result or null
 */
export async function checkEscalation(
  client,
  guildId,
  targetId,
  moderatorId,
  moderatorTag,
  config,
) {
  if (!config.moderation?.escalation?.enabled) return null;

  const thresholds = config.moderation.escalation.thresholds;
  if (!thresholds?.length) return null;

  const pool = getPool();

  for (const threshold of thresholds) {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::integer AS count FROM mod_cases
       WHERE guild_id = $1 AND target_id = $2 AND action = 'warn'
       AND created_at > NOW() - INTERVAL '1 day' * $3`,
      [guildId, targetId, threshold.withinDays],
    );

    const warnCount = rows[0]?.count || 0;
    if (warnCount < threshold.warns) continue;

    const reason = `Auto-escalation: ${warnCount} warns in ${threshold.withinDays} days`;
    info('Escalation triggered', { guildId, targetId, warnCount, threshold });

    try {
      const guild = await client.guilds.fetch(guildId);
      const member = await guild.members.fetch(targetId).catch(() => null);

      if (threshold.action === 'timeout' && member) {
        const ms = parseDuration(threshold.duration);
        if (ms) {
          await member.timeout(ms, reason);
        }
      } else if (threshold.action === 'ban') {
        await guild.members.ban(targetId, { reason });
      }

      const escalationCase = await createCase(guildId, {
        action: threshold.action,
        targetId,
        targetTag: member?.user?.tag || targetId,
        moderatorId,
        moderatorTag,
        reason,
        duration: threshold.duration || null,
      });

      await sendModLogEmbed(client, config, escalationCase);

      return escalationCase;
    } catch (err) {
      logError('Escalation action failed', { error: err.message, guildId, targetId, threshold });
      return null;
    }
  }

  return null;
}

/**
 * Poll for expired tempbans and execute unbans.
 * @param {import('discord.js').Client} client - Discord client
 */
async function pollTempbans(client) {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT * FROM mod_scheduled_actions
       WHERE executed = FALSE AND execute_at <= NOW()`,
    );

    for (const row of rows) {
      try {
        const guild = await client.guilds.fetch(row.guild_id);
        await guild.members.unban(row.target_id, 'Tempban expired');

        await pool.query('UPDATE mod_scheduled_actions SET executed = TRUE WHERE id = $1', [
          row.id,
        ]);

        // Create unban case
        const config = getConfig();
        const unbanCase = await createCase(row.guild_id, {
          action: 'unban',
          targetId: row.target_id,
          targetTag: row.target_id,
          moderatorId: client.user.id,
          moderatorTag: client.user.tag,
          reason: `Tempban expired (case #${row.case_id ? row.case_id : 'unknown'})`,
        });

        await sendModLogEmbed(client, config, unbanCase);

        info('Tempban expired, user unbanned', {
          guildId: row.guild_id,
          targetId: row.target_id,
        });
      } catch (err) {
        logError('Failed to process expired tempban', {
          error: err.message,
          id: row.id,
          guildId: row.guild_id,
          targetId: row.target_id,
        });

        // Mark permanently failed actions to prevent infinite retry
        await pool
          .query('UPDATE mod_scheduled_actions SET executed = TRUE WHERE id = $1', [row.id])
          .catch(() => {});
      }
    }
  } catch (err) {
    logError('Tempban scheduler poll error', { error: err.message });
  }
}

/**
 * Start the tempban scheduler polling interval.
 * Polls every 60 seconds for expired tempbans.
 * Runs an immediate check on startup to catch missed unbans.
 * @param {import('discord.js').Client} client - Discord client
 */
export function startTempbanScheduler(client) {
  if (schedulerInterval) return;

  // Immediate check on startup
  pollTempbans(client).catch((err) => {
    logError('Initial tempban poll failed', { error: err.message });
  });

  schedulerInterval = setInterval(() => {
    pollTempbans(client).catch((err) => {
      logError('Tempban poll failed', { error: err.message });
    });
  }, 60000);

  info('Tempban scheduler started');
}

/**
 * Stop the tempban scheduler.
 */
export function stopTempbanScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    info('Tempban scheduler stopped');
  }
}

/**
 * Check if the bot can moderate a target member (role hierarchy check).
 * @param {import('discord.js').GuildMember} moderator - The moderator
 * @param {import('discord.js').GuildMember} target - The target member
 * @returns {string|null} Error message if cannot moderate, null if OK
 */
export function checkHierarchy(moderator, target) {
  if (target.roles.highest.position >= moderator.roles.highest.position) {
    return '❌ You cannot moderate a member with an equal or higher role than yours.';
  }
  return null;
}

/**
 * Check if DM notification is enabled for an action type.
 * @param {Object} config - Bot configuration
 * @param {string} action - Action type
 * @returns {boolean} True if DM should be sent
 */
export function shouldSendDm(config, action) {
  return config.moderation?.dmNotifications?.[action] === true;
}
