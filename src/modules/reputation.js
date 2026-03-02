/**
 * Reputation / XP Module
 * Gamified XP system that rewards community participation with levels and role rewards.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/45
 */

import { EmbedBuilder } from 'discord.js';
import { getPool } from '../db.js';
import { info, error as logError } from '../logger.js';
import { safeSend } from '../utils/safeSend.js';
import { sanitizeMentions } from '../utils/sanitizeMentions.js';
import { getConfig } from './config.js';
import { REPUTATION_DEFAULTS } from './reputationDefaults.js';
import { invalidateReputationCache } from '../utils/reputationCache.js';

/** In-memory cooldown map: `${guildId}:${userId}` → Date of last XP gain */
const cooldowns = new Map();

/** Evict stale cooldown entries (exported for testability). */
export function sweepCooldowns() {
  const now = Date.now();
  for (const [key, ts] of cooldowns) {
    if (now - ts > 120_000) cooldowns.delete(key);
  }
}

// Periodic sweep — evict stale cooldown entries instead of one setTimeout per user.
setInterval(sweepCooldowns, 5 * 60 * 1000).unref();

/**
 * Resolve the reputation config for a guild, merging defaults.
 *
 * @param {string} guildId
 * @returns {object}
 */
function getRepConfig(guildId) {
  const cfg = getConfig(guildId);
  return { ...REPUTATION_DEFAULTS, ...cfg.reputation };
}

/**
 * Determine current level from total XP and threshold array.
 *
 * @param {number} xp - Total XP
 * @param {number[]} thresholds - Level threshold array (index = level - 1)
 * @returns {number} Level (0 = no level yet)
 */
export function computeLevel(xp, thresholds) {
  let level = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (xp >= thresholds[i]) {
      level = i + 1;
    } else {
      break;
    }
  }
  return level;
}

/**
 * Build a progress bar string.
 *
 * @param {number} current - XP within current level
 * @param {number} needed - XP needed for next level
 * @param {number} [width=10] - Bar width in segments
 * @returns {string} e.g. "▓▓▓▓▓▓░░░░ 60%"
 */
export function buildProgressBar(current, needed, width = 10) {
  if (needed <= 0) return `${'▓'.repeat(width)} 100%`;
  const pct = Math.min(1, current / needed);
  const filled = Math.round(pct * width);
  const empty = width - filled;
  const bar = '▓'.repeat(filled) + '░'.repeat(empty);
  return `${bar} ${Math.round(pct * 100)}%`;
}

/**
 * Handle XP gain for a non-bot guild message.
 * Skips if reputation is disabled, message is too short, or user is on cooldown.
 *
 * @param {import('discord.js').Message} message
 */
export async function handleXpGain(message) {
  if (!message.guild) return;
  const repCfg = getRepConfig(message.guild.id);
  if (!repCfg.enabled) return;

  // Minimum length check (anti-spam)
  if (message.content.length < 10) return;

  const key = `${message.guild.id}:${message.author.id}`;
  const now = Date.now();
  const cooldownMs = (repCfg.xpCooldownSeconds ?? 60) * 1000;

  const lastGain = cooldowns.get(key);
  if (lastGain && now - lastGain < cooldownMs) return;

  // Award random XP in [min, max]
  const [minXp, maxXp] = repCfg.xpPerMessage ?? [5, 15];
  const xpGained = Math.floor(Math.random() * (maxXp - minXp + 1)) + minXp;

  const pool = getPool();

  // Upsert reputation row
  const { rows } = await pool.query(
    `INSERT INTO reputation (guild_id, user_id, xp, messages_count, last_xp_gain)
     VALUES ($1, $2, $3, 1, NOW())
     ON CONFLICT (guild_id, user_id) DO UPDATE
       SET xp = reputation.xp + $3,
           messages_count = reputation.messages_count + 1,
           last_xp_gain = NOW()
     RETURNING xp, level`,
    [message.guild.id, message.author.id, xpGained],
  );

  // Set cooldown AFTER successful DB write (sweep interval handles eviction)
  cooldowns.set(key, now);

  const { xp: newXp, level: currentLevel } = rows[0];
  const thresholds = repCfg.levelThresholds;
  const newLevel = computeLevel(newXp, thresholds);

  if (newLevel > currentLevel) {
    // Update stored level
    try {
      await pool.query('UPDATE reputation SET level = $1 WHERE guild_id = $2 AND user_id = $3', [
        newLevel,
        message.guild.id,
        message.author.id,
      ]);
    } catch (err) {
      logError('Failed to update level', {
        userId: message.author.id,
        guildId: message.guild.id,
        error: err.message,
      });
      return; // Don't proceed with role/announcement if level update failed
    }

    info('User leveled up', {
      userId: message.author.id,
      guildId: message.guild.id,
      level: newLevel,
      xp: newXp,
    });

    // Auto-assign role reward if configured
    const roleId = repCfg.roleRewards?.[String(newLevel)];
    if (roleId) {
      try {
        await message.member.roles.add(roleId);
        info('Role reward assigned', { userId: message.author.id, roleId, level: newLevel });
      } catch (err) {
        logError('Failed to assign role reward', {
          userId: message.author.id,
          roleId,
          level: newLevel,
          error: err.message,
        });
      }
    }

    // Send level-up announcement
    const announceChannelId = repCfg.announceChannelId;
    if (announceChannelId) {
      const announceChannel = message.guild.channels.cache.get(announceChannelId);
      if (announceChannel) {
        const embed = new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle('🎉 Level Up!')
          .setDescription(
            sanitizeMentions(
              `${message.author} reached **Level ${newLevel}**!${roleId ? ' 🏅 Role reward assigned!' : ''}`,
            ),
          )
          .setThumbnail(message.author.displayAvatarURL())
          .addFields({ name: 'Total XP', value: String(newXp), inline: true })
          .setTimestamp();

        try {
          await safeSend(announceChannel, { embeds: [embed] });
        } catch (err) {
          logError('Failed to send level-up announcement', {
            userId: message.author.id,
            channelId: announceChannelId,
            error: err.message,
          });
        }
      }
    }
  }

  // Invalidate cached reputation/leaderboard data AFTER all DB writes complete
  // to prevent stale data from being re-cached in the gap between invalidation and write
  invalidateReputationCache(message.guild.id, message.author.id).catch(() => {});
}
