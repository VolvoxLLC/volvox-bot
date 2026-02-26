/**
 * Help Command
 * FAQ / knowledge base with CRUD and autocomplete.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { getPool } from '../db.js';
import { info, error as logError } from '../logger.js';
import { getConfig } from '../modules/config.js';
import { isModerator } from '../utils/permissions.js';
import { safeEditReply } from '../utils/safeSend.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Discord blurple colour used for help embeds. */
const EMBED_COLOR = 0x5865f2;

/** Valid topic slug: lowercase alphanumeric + hyphens, 2–50 chars. */
const TOPIC_REGEX = /^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$/;

/** Number of topics displayed per page in the list subcommand. */
const TOPICS_PER_PAGE = 10;

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Browse the server FAQ / knowledge base')
  .addSubcommand((sub) =>
    sub
      .setName('view')
      .setDescription('View a help topic')
      .addStringOption((opt) =>
        opt
          .setName('topic')
          .setDescription('Topic to view')
          .setRequired(true)
          .setAutocomplete(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('Add a new help topic (moderator only)')
      .addStringOption((opt) =>
        opt.setName('topic').setDescription('Unique topic slug').setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName('title').setDescription('Display title').setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName('content').setDescription('Topic content').setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('edit')
      .setDescription('Edit an existing help topic (moderator only)')
      .addStringOption((opt) =>
        opt
          .setName('topic')
          .setDescription('Topic to edit')
          .setRequired(true)
          .setAutocomplete(true),
      )
      .addStringOption((opt) => opt.setName('title').setDescription('New title').setRequired(false))
      .addStringOption((opt) =>
        opt.setName('content').setDescription('New content').setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('Remove a help topic (moderator only)')
      .addStringOption((opt) =>
        opt
          .setName('topic')
          .setDescription('Topic to remove')
          .setRequired(true)
          .setAutocomplete(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('list')
      .setDescription('List all help topics')
      .addIntegerOption((opt) =>
        opt.setName('page').setDescription('Page number').setRequired(false),
      ),
  );

/**
 * Load the bundled default topics JSON.
 * @returns {Array<{topic: string, title: string, content: string}>}
 */
function loadDefaults() {
  const filePath = join(__dirname, '..', 'data', 'default-help-topics.json');
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

/**
 * Seed default help topics for a guild when none exist yet.
 *
 * @param {string} guildId
 * @param {string} authorId - User id to attribute seeded entries to.
 */
export async function seedDefaults(guildId, authorId) {
  const pool = getPool();
  const { rows } = await pool.query('SELECT 1 FROM help_topics WHERE guild_id = $1 LIMIT 1', [
    guildId,
  ]);
  if (rows.length > 0) return;

  const defaults = loadDefaults();
  for (const entry of defaults) {
    await pool.query(
      `INSERT INTO help_topics (guild_id, topic, title, content, author_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (guild_id, topic) DO NOTHING`,
      [guildId, entry.topic, entry.title, entry.content, authorId],
    );
  }
  info('Seeded default help topics', { guildId, count: defaults.length });
}

// ── Subcommand handlers ────────────────────────────────────────────

async function handleView(interaction) {
  const topic = interaction.options.getString('topic');
  const pool = getPool();

  const { rows } = await pool.query(
    'SELECT * FROM help_topics WHERE guild_id = $1 AND topic = $2',
    [interaction.guild.id, topic],
  );

  if (rows.length === 0) {
    return await safeEditReply(interaction, `❌ No help topic found for \`${topic}\`.`);
  }

  const row = rows[0];

  const description = row.content.length > 4096 ? `${row.content.slice(0, 4093)}...` : row.content;

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(row.title)
    .setDescription(description)
    .setFooter({
      text: `Added by ${row.author_id} • ${new Date(row.created_at).toLocaleDateString()}`,
    })
    .setTimestamp(new Date(row.updated_at));

  await safeEditReply(interaction, { embeds: [embed] });
}

async function handleAdd(interaction) {
  const config = getConfig(interaction.guildId);
  if (!isModerator(interaction.member, config)) {
    return await safeEditReply(
      interaction,
      '❌ You need moderator permissions to add help topics.',
    );
  }

  const topic = interaction.options.getString('topic');
  const title = interaction.options.getString('title');
  const content = interaction.options.getString('content');

  if (!TOPIC_REGEX.test(topic)) {
    return await safeEditReply(
      interaction,
      '❌ Topic slug must be lowercase letters, numbers, or hyphens only, and 2–50 characters (e.g. `my-topic`).',
    );
  }

  const pool = getPool();

  try {
    await pool.query(
      `INSERT INTO help_topics (guild_id, topic, title, content, author_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [interaction.guild.id, topic, title, content, interaction.user.id],
    );
  } catch (err) {
    if (err.code === '23505') {
      return await safeEditReply(
        interaction,
        `❌ A help topic with slug \`${topic}\` already exists.`,
      );
    }
    throw err;
  }

  info('Help topic added', { guildId: interaction.guild.id, topic, user: interaction.user.tag });
  await safeEditReply(interaction, `✅ Help topic \`${topic}\` created.`);
}

async function handleEdit(interaction) {
  const config = getConfig(interaction.guildId);
  if (!isModerator(interaction.member, config)) {
    return await safeEditReply(
      interaction,
      '❌ You need moderator permissions to edit help topics.',
    );
  }

  const topic = interaction.options.getString('topic');
  const title = interaction.options.getString('title');
  const content = interaction.options.getString('content');

  if (!title && !content) {
    return await safeEditReply(
      interaction,
      '❌ Provide at least a new title or content to update.',
    );
  }

  const pool = getPool();

  const setClauses = [];
  const params = [];
  let idx = 1;

  if (title) {
    setClauses.push(`title = $${idx}`);
    params.push(title);
    idx++;
  }
  if (content) {
    setClauses.push(`content = $${idx}`);
    params.push(content);
    idx++;
  }
  setClauses.push(`updated_at = NOW()`);

  params.push(interaction.guild.id);
  params.push(topic);

  const { rows } = await pool.query(
    `UPDATE help_topics SET ${setClauses.join(', ')} WHERE guild_id = $${idx} AND topic = $${idx + 1} RETURNING *`,
    params,
  );

  if (rows.length === 0) {
    return await safeEditReply(interaction, `❌ No help topic found for \`${topic}\`.`);
  }

  info('Help topic edited', { guildId: interaction.guild.id, topic, user: interaction.user.tag });
  await safeEditReply(interaction, `✅ Help topic \`${topic}\` updated.`);
}

async function handleRemove(interaction) {
  const config = getConfig(interaction.guildId);
  if (!isModerator(interaction.member, config)) {
    return await safeEditReply(
      interaction,
      '❌ You need moderator permissions to remove help topics.',
    );
  }

  const topic = interaction.options.getString('topic');
  const pool = getPool();

  const { rows } = await pool.query(
    'DELETE FROM help_topics WHERE guild_id = $1 AND topic = $2 RETURNING *',
    [interaction.guild.id, topic],
  );

  if (rows.length === 0) {
    return await safeEditReply(interaction, `❌ No help topic found for \`${topic}\`.`);
  }

  info('Help topic removed', { guildId: interaction.guild.id, topic, user: interaction.user.tag });
  await safeEditReply(interaction, `✅ Help topic \`${topic}\` removed.`);
}

async function handleList(interaction) {
  const page = interaction.options.getInteger('page') || 1;
  const pool = getPool();

  // Seed defaults if the guild has no topics yet
  await seedDefaults(interaction.guild.id, interaction.client.user.id);

  const countResult = await pool.query(
    'SELECT COUNT(*)::int AS total FROM help_topics WHERE guild_id = $1',
    [interaction.guild.id],
  );
  const total = countResult.rows[0].total;

  if (total === 0) {
    return await safeEditReply(interaction, 'No help topics found.');
  }

  const totalPages = Math.ceil(total / TOPICS_PER_PAGE);
  const safePage = Math.max(1, Math.min(page, totalPages));
  const offset = (safePage - 1) * TOPICS_PER_PAGE;

  const { rows } = await pool.query(
    'SELECT topic, title, content FROM help_topics WHERE guild_id = $1 ORDER BY topic ASC LIMIT $2 OFFSET $3',
    [interaction.guild.id, TOPICS_PER_PAGE, offset],
  );

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle('📖 Help Topics')
    .setFooter({ text: `Page ${safePage} of ${totalPages} • ${total} topic(s)` })
    .setTimestamp();

  for (const row of rows) {
    const preview = row.content.length > 80 ? `${row.content.slice(0, 77)}...` : row.content;
    embed.addFields({ name: `${row.title} (\`${row.topic}\`)`.slice(0, 256), value: preview });
  }

  await safeEditReply(interaction, { embeds: [embed] });
}

// ── Execute ────────────────────────────────────────────────────────

/**
 * Execute the help command.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const subcommand = interaction.options.getSubcommand();

  try {
    switch (subcommand) {
      case 'view':
        await handleView(interaction);
        break;
      case 'add':
        await handleAdd(interaction);
        break;
      case 'edit':
        await handleEdit(interaction);
        break;
      case 'remove':
        await handleRemove(interaction);
        break;
      case 'list':
        await handleList(interaction);
        break;
    }
  } catch (err) {
    logError('Help command failed', { error: err.message, subcommand });
    await safeEditReply(interaction, '❌ Failed to execute help command.');
  }
}

// ── Autocomplete ───────────────────────────────────────────────────

/**
 * Handle autocomplete for topic fields.
 * @param {import('discord.js').AutocompleteInteraction} interaction
 */
export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused();

  try {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT topic, title FROM help_topics WHERE guild_id = $1 AND (topic ILIKE $2 OR title ILIKE $2) ORDER BY topic ASC LIMIT 25',
      [interaction.guild.id, `%${focused}%`],
    );

    const filtered = rows.map((r) => ({
      name: `${r.title} (${r.topic})`.slice(0, 100),
      value: r.topic,
    }));

    await interaction.respond(filtered);
  } catch (err) {
    logError('Help autocomplete failed', { error: err.message });
    await interaction.respond([]);
  }
}
