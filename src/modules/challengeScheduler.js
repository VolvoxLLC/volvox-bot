/**
 * Daily Coding Challenge Scheduler
 * Automatically posts a new coding challenge every day at a configured time.
 * Tracks solve history and handles hint/solve button interactions.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/52
 */

import { createRequire } from 'node:module';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { getPool } from '../db.js';
import { info, error as logError, warn as logWarn } from '../logger.js';
import { getConfig } from './config.js';

const require = createRequire(import.meta.url);
/** @type {Array<import('../data/challenges.json')>} */
const CHALLENGES = require('../data/challenges.json');

/** Colour codes by difficulty */
const DIFFICULTY_COLORS = {
  easy: 0x57f287,
  medium: 0xfee75c,
  hard: 0xed4245,
};

/** Emoji prefix by difficulty */
const DIFFICULTY_EMOJI = {
  easy: '🟢',
  medium: '🟡',
  hard: '🔴',
};

/** In-memory map of guildId → last posted date string (YYYY-MM-DD) */
const lastPostedDate = new Map();

/**
 * Get the day-of-year (1-indexed) for a given date in a timezone.
 *
 * @param {Date} now - Current date
 * @param {string} timezone - IANA timezone string
 * @returns {number} Day of year
 */
export function getDayOfYear(now, timezone) {
  // Get the start of the year in the target timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(now);
  const year = Number.parseInt(parts.find((p) => p.type === 'year').value, 10);
  const month = Number.parseInt(parts.find((p) => p.type === 'month').value, 10);
  const day = Number.parseInt(parts.find((p) => p.type === 'day').value, 10);

  const startOfYear = new Date(`${year}-01-01T00:00:00`);
  const localDate = new Date(
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00`,
  );

  const diffMs = localDate.getTime() - startOfYear.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Get today's date string (YYYY-MM-DD) in the given timezone.
 *
 * @param {Date} now - Current date
 * @param {string} timezone - IANA timezone string
 * @returns {string} Date string YYYY-MM-DD
 */
export function getLocalDateString(now, timezone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Get the current time as HH:MM in the given timezone.
 *
 * @param {Date} now - Current date
 * @param {string} timezone - IANA timezone string
 * @returns {string} Time string HH:MM
 */
export function getLocalTimeString(now, timezone) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
}

/**
 * Select today's challenge based on day-of-year.
 *
 * @param {Date} now - Current date
 * @param {string} timezone - IANA timezone string
 * @returns {{ challenge: Object, index: number, dayNumber: number }}
 */
export function selectTodaysChallenge(now, timezone) {
  const dayNumber = getDayOfYear(now, timezone);
  const index = (dayNumber - 1) % CHALLENGES.length;
  return { challenge: CHALLENGES[index], index, dayNumber };
}

/**
 * Build the challenge embed message.
 *
 * @param {Object} challenge - Challenge data
 * @param {number} dayNumber - Day of year
 * @param {number} solveCount - How many users have solved it
 * @returns {EmbedBuilder}
 */
export function buildChallengeEmbed(challenge, dayNumber, solveCount = 0) {
  const color = DIFFICULTY_COLORS[challenge.difficulty] ?? 0x5865f2;
  const emoji = DIFFICULTY_EMOJI[challenge.difficulty] ?? '⚪';

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`🧩 Daily Challenge #${dayNumber} — ${challenge.title}`)
    .setDescription(challenge.description)
    .addFields(
      {
        name: 'Difficulty',
        value: `${emoji} ${challenge.difficulty.charAt(0).toUpperCase() + challenge.difficulty.slice(1)}`,
        inline: true,
      },
      {
        name: 'Languages',
        value: challenge.languages.join(', '),
        inline: true,
      },
      {
        name: 'Sample Input',
        value: `\`\`\`\n${challenge.sampleInput}\n\`\`\``,
      },
      {
        name: 'Sample Output',
        value: `\`\`\`\n${challenge.sampleOutput}\n\`\`\``,
      },
    )
    .setFooter({
      text: `${solveCount} solver${solveCount !== 1 ? 's' : ''} so far • React ✅ or click Mark Solved when you've got it!`,
    })
    .setTimestamp();
}

/**
 * Build the challenge action row buttons.
 *
 * @param {number} challengeIndex - The challenge index for button IDs
 * @returns {ActionRowBuilder}
 */
export function buildChallengeButtons(challengeIndex) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`challenge_hint_${challengeIndex}`)
      .setLabel('💡 Hint')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`challenge_solve_${challengeIndex}`)
      .setLabel('✅ Mark Solved')
      .setStyle(ButtonStyle.Success),
  );
}

/**
 * Post the daily challenge to a guild's configured channel.
 *
 * @param {import('discord.js').Client} client - Discord client
 * @param {string} guildId - Guild ID to post for
 * @returns {Promise<boolean>} true if posted successfully
 */
export async function postDailyChallenge(client, guildId) {
  const config = getConfig(guildId);
  const challengesCfg = config.challenges ?? {};

  if (!challengesCfg.enabled) return false;

  const channelId = challengesCfg.channelId;
  if (!channelId) {
    logWarn('Challenge channel not configured', { guildId });
    return false;
  }

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    logWarn('Challenge channel not found', { guildId, channelId });
    return false;
  }

  const timezone = challengesCfg.timezone ?? 'America/New_York';
  const now = new Date();
  const { challenge, index, dayNumber } = selectTodaysChallenge(now, timezone);

  const embed = buildChallengeEmbed(challenge, dayNumber, 0);
  const buttons = buildChallengeButtons(index);

  const message = await channel.send({ embeds: [embed], components: [buttons] });

  // Create a discussion thread on the message
  try {
    await message.startThread({
      name: `💬 Challenge #${dayNumber} — ${challenge.title}`,
      autoArchiveDuration: 1440, // 24 hours
      reason: 'Daily coding challenge discussion',
    });
  } catch (err) {
    logWarn('Failed to create challenge discussion thread', {
      guildId,
      messageId: message.id,
      error: err.message,
    });
  }

  // Track last posted date so we don't double-post
  lastPostedDate.set(guildId, getLocalDateString(now, timezone));

  info('Daily challenge posted', {
    guildId,
    channelId,
    dayNumber,
    challengeTitle: challenge.title,
    difficulty: challenge.difficulty,
  });

  return true;
}

/**
 * Check if it's time to post the daily challenge for a guild.
 * Called from the 60s scheduler poll loop.
 *
 * @param {import('discord.js').Client} client - Discord client
 * @param {string} guildId - Guild ID to check
 * @returns {Promise<void>}
 */
export async function checkDailyChallengeForGuild(client, guildId) {
  const config = getConfig(guildId);
  const challengesCfg = config.challenges ?? {};

  if (!challengesCfg.enabled) return;

  const timezone = challengesCfg.timezone ?? 'America/New_York';
  const postTime = challengesCfg.postTime ?? '09:00';
  const now = new Date();

  const currentTime = getLocalTimeString(now, timezone);
  const todayStr = getLocalDateString(now, timezone);

  // Check if we've already posted today
  if (lastPostedDate.get(guildId) === todayStr) return;

  // Check if it's time to post (match HH:MM)
  if (currentTime !== postTime) return;

  try {
    await postDailyChallenge(client, guildId);
  } catch (err) {
    logError('Failed to post daily challenge', { guildId, error: err.message });
  }
}

/**
 * Check all guilds for pending daily challenges.
 * Called from the scheduler's 60s polling loop.
 *
 * @param {import('discord.js').Client} client - Discord client
 * @returns {Promise<void>}
 */
export async function checkDailyChallenge(client) {
  for (const guild of client.guilds.cache.values()) {
    await checkDailyChallengeForGuild(client, guild.id).catch((err) => {
      logError('Daily challenge check failed for guild', {
        guildId: guild.id,
        error: err.message,
      });
    });
  }
}

/**
 * Handle the "Mark Solved" button interaction.
 *
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {number} challengeIndex - Parsed challenge index from customId
 * @returns {Promise<void>}
 */
export async function handleSolveButton(interaction, challengeIndex) {
  const pool = getPool();
  if (!pool) {
    await interaction.reply({ content: '❌ Database unavailable.', ephemeral: true });
    return;
  }

  const { guildId } = interaction;
  const userId = interaction.user.id;

  // Upsert the solve record (no-op on duplicate)
  await pool.query(
    `INSERT INTO challenge_solves (guild_id, challenge_index, user_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (guild_id, challenge_index, user_id) DO NOTHING`,
    [guildId, challengeIndex, userId],
  );

  // Get total solves for this user in this guild
  const { rows: totalRows } = await pool.query(
    'SELECT COUNT(*) AS total FROM challenge_solves WHERE guild_id = $1 AND user_id = $2',
    [guildId, userId],
  );
  const totalSolves = Number.parseInt(totalRows[0].total, 10);

  // Get total solvers for this challenge
  const { rows: solveRows } = await pool.query(
    'SELECT COUNT(*) AS total FROM challenge_solves WHERE guild_id = $1 AND challenge_index = $2',
    [guildId, challengeIndex],
  );
  const solveCount = Number.parseInt(solveRows[0].total, 10);

  // Update the embed footer with new solve count
  try {
    const msg = interaction.message;
    if (msg.embeds.length > 0) {
      const oldEmbed = msg.embeds[0];
      const updatedEmbed = EmbedBuilder.from(oldEmbed).setFooter({
        text: `${solveCount} solver${solveCount !== 1 ? 's' : ''} so far • React ✅ or click Mark Solved when you've got it!`,
      });
      await msg.edit({ embeds: [updatedEmbed], components: msg.components });
    }
  } catch (editErr) {
    logWarn('Could not update challenge embed after solve', {
      messageId: interaction.message.id,
      error: editErr.message,
    });
  }

  await interaction.reply({
    content: `✅ Marked as solved! You've solved **${totalSolves}** challenge${totalSolves !== 1 ? 's' : ''} total. Nice work! 🎉`,
    ephemeral: true,
  });

  info('Challenge solved', { guildId, userId, challengeIndex, totalSolves });
}

/**
 * Handle the "Hint" button interaction.
 *
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {number} challengeIndex - Parsed challenge index from customId
 * @returns {Promise<void>}
 */
export async function handleHintButton(interaction, challengeIndex) {
  const challenge = CHALLENGES[challengeIndex];
  if (!challenge) {
    await interaction.reply({ content: '❌ Challenge not found.', ephemeral: true });
    return;
  }

  const hints = challenge.hints ?? [];
  if (hints.length === 0) {
    await interaction.reply({
      content: '🤷 No hints available for this challenge.',
      ephemeral: true,
    });
    return;
  }

  const hintLines = hints.map((h, i) => `**Hint ${i + 1}:** ${h}`).join('\n');
  await interaction.reply({
    content: `💡 **Hints for "${challenge.title}":**\n\n${hintLines}`,
    ephemeral: true,
  });
}

/**
 * Get the challenges data array (for use by commands).
 *
 * @returns {Array} challenges
 */
export function getChallenges() {
  return CHALLENGES;
}

/**
 * Start the challenge scheduler — just a no-op now since we plug into
 * the existing 60s scheduler loop via checkDailyChallenge.
 * Kept for a clean startup log.
 *
 * @param {import('discord.js').Client} client - Discord client
 */
export function startChallengeScheduler(_client) {
  info('Daily challenge scheduler ready (integrated into main poll loop)');
}
