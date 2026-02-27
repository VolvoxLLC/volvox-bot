/**
 * Showcase Command
 * Submit, browse, and upvote community projects via /showcase.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/50
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { getPool } from '../db.js';
import { info, warn } from '../logger.js';
import { getConfig } from '../modules/config.js';
import { safeEditReply, safeReply, safeSend } from '../utils/safeSend.js';

/** Embed colour for showcase responses. */
const EMBED_COLOR = 0x5865f2;

// ── Validation helpers ─────────────────────────────────────────────

/**
 * Basic URL validation — returns true for empty/null (optional fields).
 *
 * @param {string|null} str
 * @returns {boolean}
 */
function isValidUrl(str) {
  if (!str) return true; // optional fields
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Number of showcases per page in browse view. */
const SHOWCASES_PER_PAGE = 5;

export const data = new SlashCommandBuilder()
  .setName('showcase')
  .setDescription('Submit, browse, and upvote community projects')
  .addSubcommand((sub) =>
    sub.setName('submit').setDescription('Submit a new project to the showcase'),
  )
  .addSubcommand((sub) =>
    sub
      .setName('browse')
      .setDescription('Browse showcased projects')
      .addStringOption((opt) =>
        opt
          .setName('tag')
          .setDescription('Filter by tech stack tag (e.g. "react", "postgres")')
          .setRequired(false),
      )
      .addIntegerOption((opt) =>
        opt.setName('page').setDescription('Page number').setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName('top').setDescription('View the top 10 most upvoted projects'),
  )
  .addSubcommand((sub) =>
    sub
      .setName('view')
      .setDescription('View a specific project by ID')
      .addIntegerOption((opt) => opt.setName('id').setDescription('Project ID').setRequired(true)),
  );

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Build the showcase embed for a project.
 *
 * @param {Object} showcase - Showcase row from the database.
 * @returns {EmbedBuilder}
 */
export function buildShowcaseEmbed(showcase) {
  const submittedTs = Math.floor(new Date(showcase.created_at).getTime() / 1000);

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(showcase.name.slice(0, 256))
    .setDescription(showcase.description.slice(0, 4096))
    .setFooter({ text: `ID: ${showcase.id}` })
    .addFields({ name: 'Submitted', value: `<t:${submittedTs}:R>`, inline: true });

  if (showcase.tech_stack && showcase.tech_stack.length > 0) {
    embed.addFields({ name: 'Tech Stack', value: showcase.tech_stack.join(', ').slice(0, 1024) });
  }
  if (showcase.repo_url) {
    embed.addFields({ name: 'Repo URL', value: showcase.repo_url.slice(0, 1024) });
  }
  if (showcase.live_url) {
    embed.addFields({ name: 'Live URL', value: showcase.live_url.slice(0, 1024) });
  }

  embed.addFields(
    { name: 'Author', value: `<@${showcase.author_id}>`, inline: true },
    { name: 'Upvotes', value: String(showcase.upvotes ?? 0), inline: true },
  );

  return embed;
}

/**
 * Build the upvote action row for a showcase.
 *
 * @param {number} showcaseId
 * @param {number} upvotes
 * @returns {ActionRowBuilder}
 */
export function buildUpvoteRow(showcaseId, upvotes) {
  const button = new ButtonBuilder()
    .setCustomId(`showcase_upvote_${showcaseId}`)
    .setLabel(`👍 ${upvotes}`)
    .setStyle(ButtonStyle.Primary);

  return new ActionRowBuilder().addComponents(button);
}

// ── Subcommand handlers ────────────────────────────────────────────

/**
 * Handle /showcase submit — shows a modal.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function handleSubmit(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('showcase_submit_modal')
    .setTitle('Submit Your Project');

  const nameInput = new TextInputBuilder()
    .setCustomId('showcase_name')
    .setLabel('Project Name')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100);

  const descInput = new TextInputBuilder()
    .setCustomId('showcase_description')
    .setLabel('Description')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000);

  const techInput = new TextInputBuilder()
    .setCustomId('showcase_tech')
    .setLabel('Tech Stack (comma-separated, optional)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(200)
    .setPlaceholder('node, react, postgres');

  const repoInput = new TextInputBuilder()
    .setCustomId('showcase_repo')
    .setLabel('Repo URL (optional)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(500);

  const liveInput = new TextInputBuilder()
    .setCustomId('showcase_live')
    .setLabel('Live URL (optional)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(500);

  modal.addComponents(
    new ActionRowBuilder().addComponents(nameInput),
    new ActionRowBuilder().addComponents(descInput),
    new ActionRowBuilder().addComponents(techInput),
    new ActionRowBuilder().addComponents(repoInput),
    new ActionRowBuilder().addComponents(liveInput),
  );

  await interaction.showModal(modal);
}

/**
 * Handle the showcase_submit_modal submission.
 *
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 * @param {import('pg').Pool} pool
 */
export async function handleShowcaseModalSubmit(interaction, pool) {
  const guildId = interaction.guildId;
  if (!guildId) {
    await safeReply(interaction, {
      content: '❌ This command can only be used in a server.',
      ephemeral: true,
    });
    return;
  }

  const guildConfig = getConfig(guildId);
  if (guildConfig.showcase?.enabled === false) {
    await safeReply(interaction, {
      content: '❌ The showcase feature is disabled in this server.',
      ephemeral: true,
    });
    return;
  }

  const name = interaction.fields.getTextInputValue('showcase_name').trim();
  const description = interaction.fields.getTextInputValue('showcase_description').trim();
  const techRaw = interaction.fields.getTextInputValue('showcase_tech').trim();
  const repoUrl = interaction.fields.getTextInputValue('showcase_repo').trim() || null;
  const liveUrl = interaction.fields.getTextInputValue('showcase_live').trim() || null;

  const techStack = techRaw
    ? techRaw
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0)
    : [];

  if (!isValidUrl(repoUrl)) {
    await safeReply(interaction, {
      content: '❌ Invalid Repo URL. Please provide a valid URL (e.g. https://github.com/...).',
      ephemeral: true,
    });
    return;
  }

  if (!isValidUrl(liveUrl)) {
    await safeReply(interaction, {
      content: '❌ Invalid Live URL. Please provide a valid URL (e.g. https://myapp.com).',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const { rows } = await pool.query(
    `INSERT INTO showcases (guild_id, author_id, name, description, tech_stack, repo_url, live_url, channel_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      guildId,
      interaction.user.id,
      name,
      description,
      techStack,
      repoUrl,
      liveUrl,
      interaction.channelId,
    ],
  );

  const showcase = rows[0];
  const embed = buildShowcaseEmbed(showcase);
  const row = buildUpvoteRow(showcase.id, 0);

  if (!interaction.channel) {
    await safeEditReply(interaction, { content: '❌ Cannot post in this channel.' });
    return;
  }

  const msg = await safeSend(interaction.channel, { embeds: [embed], components: [row] });

  // Store message_id for future updates
  await pool.query('UPDATE showcases SET message_id = $1 WHERE id = $2', [msg.id, showcase.id]);

  info('Showcase submitted', {
    showcaseId: showcase.id,
    guildId,
    name,
    authorId: interaction.user.id,
  });

  await safeEditReply(interaction, {
    content: `✅ Project **${name}** submitted to the showcase! (ID: **#${showcase.id}**)`,
  });
}

/**
 * Handle /showcase browse [tag] [page]
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {import('pg').Pool} pool
 */
async function handleBrowse(interaction, pool) {
  const tag = interaction.options.getString('tag')?.toLowerCase() ?? null;
  const page = Math.max(1, interaction.options.getInteger('page') ?? 1);

  let countResult;
  let rows;

  if (tag) {
    countResult = await pool.query(
      'SELECT COUNT(*)::int AS total FROM showcases WHERE guild_id = $1 AND $2 = ANY(tech_stack)',
      [interaction.guildId, tag],
    );
    const total = countResult.rows[0].total;

    if (total === 0) {
      await safeEditReply(interaction, {
        content: `📭 No projects found with tag **${tag}**.`,
      });
      return;
    }

    const totalPages = Math.ceil(total / SHOWCASES_PER_PAGE);
    const safePage = Math.min(page, totalPages);
    const offset = (safePage - 1) * SHOWCASES_PER_PAGE;

    ({ rows } = await pool.query(
      `SELECT id, name, author_id, tech_stack, upvotes, created_at
       FROM showcases
       WHERE guild_id = $1 AND $2 = ANY(tech_stack)
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [interaction.guildId, tag, SHOWCASES_PER_PAGE, offset],
    ));

    await sendBrowseEmbed(interaction, rows, safePage, totalPages, total, tag);
  } else {
    countResult = await pool.query(
      'SELECT COUNT(*)::int AS total FROM showcases WHERE guild_id = $1',
      [interaction.guildId],
    );
    const total = countResult.rows[0].total;

    if (total === 0) {
      await safeEditReply(interaction, {
        content: '📭 No projects have been showcased yet. Be the first! Use `/showcase submit`.',
      });
      return;
    }

    const totalPages = Math.ceil(total / SHOWCASES_PER_PAGE);
    const safePage = Math.min(page, totalPages);
    const offset = (safePage - 1) * SHOWCASES_PER_PAGE;

    ({ rows } = await pool.query(
      `SELECT id, name, author_id, tech_stack, upvotes, created_at
       FROM showcases
       WHERE guild_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [interaction.guildId, SHOWCASES_PER_PAGE, offset],
    ));

    await sendBrowseEmbed(interaction, rows, safePage, totalPages, total, null);
  }
}

/**
 * Send the browse embed with paginated results.
 */
async function sendBrowseEmbed(interaction, rows, page, totalPages, total, tag) {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(tag ? `🔍 Projects tagged "${tag}"` : '🚀 Community Showcase')
    .setFooter({ text: `Page ${page} of ${totalPages} • ${total} project(s)` });

  for (const row of rows) {
    const tech = row.tech_stack?.length > 0 ? row.tech_stack.join(', ') : 'None listed';
    const value = `By <@${row.author_id}> • Tech: ${tech} • 👍 ${row.upvotes}`;
    embed.addFields({
      name: `#${row.id} — ${row.name}`.slice(0, 256),
      value: value.slice(0, 1024),
    });
  }

  await safeEditReply(interaction, { embeds: [embed] });
}

/**
 * Handle /showcase top
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {import('pg').Pool} pool
 */
async function handleTop(interaction, pool) {
  const { rows } = await pool.query(
    `SELECT id, name, author_id, tech_stack, upvotes
     FROM showcases
     WHERE guild_id = $1
     ORDER BY upvotes DESC, created_at DESC
     LIMIT 10`,
    [interaction.guildId],
  );

  if (rows.length === 0) {
    await safeEditReply(interaction, {
      content: '📭 No projects have been showcased yet. Be the first! Use `/showcase submit`.',
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle('🏆 Top 10 Showcase Projects')
    .setFooter({ text: 'Sorted by upvotes' });

  rows.forEach((row, i) => {
    const tech = row.tech_stack?.length > 0 ? row.tech_stack.join(', ') : 'None listed';
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    const value = `By <@${row.author_id}> • Tech: ${tech} • 👍 ${row.upvotes}`;
    embed.addFields({
      name: `${medal} #${row.id} — ${row.name}`.slice(0, 256),
      value: value.slice(0, 1024),
    });
  });

  await safeEditReply(interaction, { embeds: [embed] });
}

/**
 * Handle /showcase view <id>
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {import('pg').Pool} pool
 */
async function handleView(interaction, pool) {
  const id = interaction.options.getInteger('id');

  const { rows } = await pool.query('SELECT * FROM showcases WHERE id = $1 AND guild_id = $2', [
    id,
    interaction.guildId,
  ]);

  if (rows.length === 0) {
    await safeEditReply(interaction, {
      content: `❌ No project with ID **#${id}** found in this server.`,
    });
    return;
  }

  const showcase = rows[0];
  const embed = buildShowcaseEmbed(showcase);
  const row = buildUpvoteRow(showcase.id, showcase.upvotes);

  await safeEditReply(interaction, { embeds: [embed], components: [row] });
}

// ── Execute ────────────────────────────────────────────────────────

/**
 * Execute the /showcase command.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  if (!interaction.guildId) {
    await safeReply(interaction, {
      content: '❌ This command can only be used in a server.',
      ephemeral: true,
    });
    return;
  }

  const guildConfig = getConfig(interaction.guildId);
  if (guildConfig.showcase?.enabled === false) {
    await safeReply(interaction, {
      content: '❌ The showcase feature is disabled in this server.',
      ephemeral: true,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  // submit opens a modal — no defer needed
  if (subcommand === 'submit') {
    await handleSubmit(interaction);
    return;
  }

  await interaction.deferReply({ ephemeral: false });

  let pool;
  try {
    pool = getPool();
  } catch {
    return safeEditReply(interaction, { content: '❌ Database is not available.' });
  }

  try {
    if (subcommand === 'browse') {
      await handleBrowse(interaction, pool);
    } else if (subcommand === 'top') {
      await handleTop(interaction, pool);
    } else if (subcommand === 'view') {
      await handleView(interaction, pool);
    }
  } catch (err) {
    warn('Showcase command failed', { error: err.message, stack: err.stack, subcommand });
    await safeEditReply(interaction, { content: '❌ Failed to execute showcase command.' });
  }
}

/**
 * Handle the showcase upvote button interaction.
 *
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {import('pg').Pool} pool
 */
export async function handleShowcaseUpvote(interaction, pool) {
  const showcaseId = parseInt(interaction.customId.replace('showcase_upvote_', ''), 10);

  // Guard against malformed customId
  if (Number.isNaN(showcaseId)) {
    await safeReply(interaction, { content: '❌ Invalid showcase ID.', ephemeral: true });
    return;
  }

  const userId = interaction.user.id;
  const guildId = interaction.guildId;

  if (!guildId) {
    await safeReply(interaction, {
      content: '❌ This can only be used in a server.',
      ephemeral: true,
    });
    return;
  }

  const guildConfig = getConfig(guildId);
  if (guildConfig.showcase?.enabled === false) {
    await safeReply(interaction, {
      content: '❌ The showcase feature is disabled in this server.',
      ephemeral: true,
    });
    return;
  }

  // Fetch the showcase (outside transaction — read-only pre-check)
  const { rows: showcaseRows } = await pool.query(
    'SELECT * FROM showcases WHERE id = $1 AND guild_id = $2',
    [showcaseId, guildId],
  );

  if (showcaseRows.length === 0) {
    await safeReply(interaction, { content: '❌ This project no longer exists.', ephemeral: true });
    return;
  }

  const showcase = showcaseRows[0];

  // Prevent self-upvote
  if (showcase.author_id === userId) {
    await safeReply(interaction, {
      content: "❌ You can't upvote your own project.",
      ephemeral: true,
    });
    return;
  }

  // Atomically toggle vote using a transaction
  let newUpvotes;
  let removed;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: voteRows } = await client.query(
      'SELECT 1 FROM showcase_votes WHERE guild_id = $1 AND showcase_id = $2 AND user_id = $3',
      [guildId, showcaseId, userId],
    );

    if (voteRows.length > 0) {
      // Toggle off — remove vote
      await client.query(
        'DELETE FROM showcase_votes WHERE guild_id = $1 AND showcase_id = $2 AND user_id = $3',
        [guildId, showcaseId, userId],
      );
      const { rows: updated } = await client.query(
        'UPDATE showcases SET upvotes = upvotes - 1 WHERE id = $1 RETURNING upvotes',
        [showcaseId],
      );
      newUpvotes = updated[0].upvotes;
      removed = true;
    } else {
      // Add vote
      await client.query(
        'INSERT INTO showcase_votes (guild_id, showcase_id, user_id) VALUES ($1, $2, $3)',
        [guildId, showcaseId, userId],
      );
      const { rows: updated } = await client.query(
        'UPDATE showcases SET upvotes = upvotes + 1 WHERE id = $1 RETURNING upvotes',
        [showcaseId],
      );
      newUpvotes = updated[0].upvotes;
      removed = false;
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  if (removed) {
    info('Showcase upvote removed', { showcaseId, userId, guildId, newUpvotes });
    await safeReply(interaction, {
      content: `👎 Removed your upvote from **${showcase.name}**.`,
      ephemeral: true,
    });
  } else {
    info('Showcase upvoted', { showcaseId, userId, guildId, newUpvotes });
    await safeReply(interaction, { content: `👍 Upvoted **${showcase.name}**!`, ephemeral: true });
  }

  // Update the button on the message
  try {
    const updatedRow = buildUpvoteRow(showcaseId, newUpvotes);
    await interaction.message.edit({ components: [updatedRow] });
  } catch {
    // Non-critical — ignore edit failures
  }
}
