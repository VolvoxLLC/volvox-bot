/**
 * Poll Command
 * Create, manage, and vote on polls via /poll.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/47
 */

import { SlashCommandBuilder } from 'discord.js';
import { getPool } from '../db.js';
import { info, warn } from '../logger.js';
import { getConfig } from '../modules/config.js';
import { buildPollButtons, buildPollEmbed, closePoll } from '../modules/pollHandler.js';
import { isModerator } from '../utils/permissions.js';
import { safeEditReply } from '../utils/safeSend.js';

export const data = new SlashCommandBuilder()
  .setName('poll')
  .setDescription('Create and manage polls')
  .addSubcommand((sub) =>
    sub
      .setName('create')
      .setDescription('Create a new poll')
      .addStringOption((opt) =>
        opt.setName('question').setDescription('The poll question').setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName('options')
          .setDescription('Comma-separated options (2-10): "Option A, Option B, Option C"')
          .setRequired(true),
      )
      .addIntegerOption((opt) =>
        opt
          .setName('duration')
          .setDescription('Duration in minutes (auto-closes when expired)')
          .setMinValue(1)
          .setMaxValue(43200),
      )
      .addBooleanOption((opt) =>
        opt.setName('multi').setDescription('Allow multiple votes per user (default: false)'),
      )
      .addBooleanOption((opt) =>
        opt.setName('anonymous').setDescription('Hide voter identities (default: false)'),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('close')
      .setDescription('Close a poll early')
      .addIntegerOption((opt) =>
        opt.setName('id').setDescription('Poll ID to close').setRequired(true),
      ),
  )
  .addSubcommand((sub) => sub.setName('list').setDescription('List active polls in this server'));

/**
 * Execute the /poll command.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const pool = getPool();
  if (!pool) {
    await safeEditReply(interaction, { content: '❌ Database is not available.' });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'create') {
    await handleCreate(interaction, pool);
  } else if (subcommand === 'close') {
    await handleClose(interaction, pool);
  } else if (subcommand === 'list') {
    await handleList(interaction, pool);
  }
}

/**
 * Handle /poll create
 */
async function handleCreate(interaction, pool) {
  const question = interaction.options.getString('question');
  const optionsRaw = interaction.options.getString('options');
  const duration = interaction.options.getInteger('duration');
  const multiVote = interaction.options.getBoolean('multi') ?? false;
  const anonymous = interaction.options.getBoolean('anonymous') ?? false;

  // Parse comma-separated options
  const options = optionsRaw
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);

  if (options.length < 2) {
    await safeEditReply(interaction, {
      content: '❌ You need at least 2 options. Separate them with commas.',
    });
    return;
  }

  if (options.length > 10) {
    await safeEditReply(interaction, {
      content: '❌ Maximum 10 options allowed.',
    });
    return;
  }

  // Calculate closes_at if duration is set
  let closesAt = null;
  if (duration) {
    closesAt = new Date(Date.now() + duration * 60 * 1000);
  }

  // Insert poll into DB
  const { rows } = await pool.query(
    `INSERT INTO polls (guild_id, channel_id, author_id, question, options, multi_vote, anonymous, duration_minutes, closes_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      interaction.guildId,
      interaction.channelId,
      interaction.user.id,
      question,
      JSON.stringify(options),
      multiVote,
      anonymous,
      duration || null,
      closesAt ? closesAt.toISOString() : null,
    ],
  );

  const poll = rows[0];
  const embed = buildPollEmbed(poll);
  const buttons = buildPollButtons(poll.id, options);

  // Send the poll as a non-ephemeral message in the channel
  const pollMessage = await interaction.channel.send({
    embeds: [embed],
    components: buttons,
  });

  // Store message_id for later updates
  await pool.query('UPDATE polls SET message_id = $1 WHERE id = $2', [pollMessage.id, poll.id]);

  info('Poll created', {
    pollId: poll.id,
    guildId: interaction.guildId,
    question,
    optionCount: options.length,
    duration,
    multiVote,
    anonymous,
  });

  await safeEditReply(interaction, {
    content: `✅ Poll **#${poll.id}** created!${duration ? ` Auto-closes in ${duration} minutes.` : ''}`,
  });
}

/**
 * Handle /poll close
 */
async function handleClose(interaction, pool) {
  const pollId = interaction.options.getInteger('id');

  // Fetch poll
  const { rows } = await pool.query('SELECT * FROM polls WHERE id = $1 AND guild_id = $2', [
    pollId,
    interaction.guildId,
  ]);

  if (rows.length === 0) {
    await safeEditReply(interaction, {
      content: `❌ No poll with ID **#${pollId}** found in this server.`,
    });
    return;
  }

  const poll = rows[0];

  if (poll.closed) {
    await safeEditReply(interaction, {
      content: `❌ Poll **#${pollId}** is already closed.`,
    });
    return;
  }

  // Only author or moderator can close
  const config = getConfig(interaction.guildId);
  if (poll.author_id !== interaction.user.id && !isModerator(interaction.member, config)) {
    await safeEditReply(interaction, {
      content: '❌ Only the poll creator or a moderator can close this poll.',
    });
    warn('Poll close permission denied', {
      userId: interaction.user.id,
      pollId,
    });
    return;
  }

  const closed = await closePoll(pollId, interaction.client);

  if (closed) {
    await safeEditReply(interaction, {
      content: `✅ Poll **#${pollId}** has been closed.`,
    });
  } else {
    await safeEditReply(interaction, {
      content: `❌ Failed to close poll **#${pollId}**.`,
    });
  }
}

/**
 * Handle /poll list
 */
async function handleList(interaction, pool) {
  const { rows } = await pool.query(
    `SELECT id, question, author_id, options, votes, closes_at, created_at
     FROM polls
     WHERE guild_id = $1 AND closed = false
     ORDER BY created_at DESC`,
    [interaction.guildId],
  );

  if (rows.length === 0) {
    await safeEditReply(interaction, {
      content: '📭 No active polls in this server.',
    });
    return;
  }

  const header = `📊 **Active Polls (${rows.length})**\n\n`;
  const lines = [];
  let totalLen = header.length;

  for (const row of rows) {
    const voterCount = Object.keys(row.votes || {}).length;
    const timeInfo = row.closes_at
      ? `Closes <t:${Math.floor(new Date(row.closes_at).getTime() / 1000)}:R>`
      : 'No time limit';
    const preview = row.question.length > 60 ? `${row.question.slice(0, 57)}…` : row.question;
    const line = `**#${row.id}** — ${preview}\n> ${row.options.length} options • ${voterCount} voter${voterCount !== 1 ? 's' : ''} • ${timeInfo}`;

    if (totalLen + line.length + 2 > 1900) {
      lines.push(`… and ${rows.length - lines.length} more`);
      break;
    }
    lines.push(line);
    totalLen += line.length + 2;
  }

  await safeEditReply(interaction, {
    content: `${header}${lines.join('\n\n')}`,
  });
}
