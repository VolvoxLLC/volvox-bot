/**
 * Snippet Command
 * Save and share code snippets with syntax highlighting.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/41
 */

import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { getPool } from '../db.js';
import { info, error as logError } from '../logger.js';
import { getConfig } from '../modules/config.js';
import { isModerator } from '../utils/permissions.js';
import { safeEditReply } from '../utils/safeSend.js';

/** Embed colour for snippet responses. */
const EMBED_COLOR = 0x5865f2;

/** Maximum snippet name length. */
const MAX_NAME_LENGTH = 64;

/** Maximum code length (Discord code block limit). */
const MAX_CODE_LENGTH = 4000;

/** Number of snippets per page in list view. */
const SNIPPETS_PER_PAGE = 10;

/** Supported languages for syntax highlighting autocomplete. */
const LANGUAGES = [
  'js',
  'ts',
  'python',
  'rust',
  'go',
  'java',
  'c',
  'cpp',
  'csharp',
  'html',
  'css',
  'sql',
  'bash',
  'json',
  'yaml',
  'toml',
  'markdown',
  'text',
];

export const data = new SlashCommandBuilder()
  .setName('snippet')
  .setDescription('Save and share code snippets')
  .addSubcommand((sub) =>
    sub
      .setName('save')
      .setDescription('Save a new code snippet')
      .addStringOption((opt) =>
        opt
          .setName('name')
          .setDescription('Unique name for this snippet (max 64 chars)')
          .setRequired(true)
          .setMaxLength(MAX_NAME_LENGTH),
      )
      .addStringOption((opt) =>
        opt
          .setName('language')
          .setDescription('Programming language for syntax highlighting')
          .setRequired(true)
          .setAutocomplete(true),
      )
      .addStringOption((opt) =>
        opt
          .setName('code')
          .setDescription('The code to save (max 4000 chars)')
          .setRequired(true)
          .setMaxLength(MAX_CODE_LENGTH),
      )
      .addStringOption((opt) =>
        opt
          .setName('description')
          .setDescription('Optional description of the snippet')
          .setRequired(false)
          .setMaxLength(256),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('get')
      .setDescription('Retrieve a code snippet')
      .addStringOption((opt) =>
        opt
          .setName('name')
          .setDescription('Name of the snippet to retrieve')
          .setRequired(true)
          .setAutocomplete(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('search')
      .setDescription('Search snippets by name, description, or code')
      .addStringOption((opt) =>
        opt.setName('query').setDescription('Search query').setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('list')
      .setDescription('List all snippets in this server')
      .addStringOption((opt) =>
        opt
          .setName('sort')
          .setDescription('Sort order (default: recent)')
          .setRequired(false)
          .addChoices({ name: 'Recent', value: 'recent' }, { name: 'Popular', value: 'popular' }),
      )
      .addIntegerOption((opt) =>
        opt.setName('page').setDescription('Page number').setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('delete')
      .setDescription('Delete a snippet (author or moderator only)')
      .addStringOption((opt) =>
        opt
          .setName('name')
          .setDescription('Name of the snippet to delete')
          .setRequired(true)
          .setAutocomplete(true),
      ),
  );

// ── Subcommand handlers ────────────────────────────────────────────

async function handleSave(interaction) {
  const name = interaction.options.getString('name');
  const language = interaction.options.getString('language');
  const code = interaction.options.getString('code');
  const description = interaction.options.getString('description');
  const pool = getPool();

  if (name.length > MAX_NAME_LENGTH) {
    return await safeEditReply(
      interaction,
      `❌ Snippet name must be at most ${MAX_NAME_LENGTH} characters.`,
    );
  }

  if (code.length > MAX_CODE_LENGTH) {
    return await safeEditReply(
      interaction,
      `❌ Code must be at most ${MAX_CODE_LENGTH} characters.`,
    );
  }

  try {
    await pool.query(
      `INSERT INTO snippets (guild_id, name, language, code, description, author_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [interaction.guild.id, name, language, code, description ?? null, interaction.user.id],
    );
  } catch (err) {
    if (err.code === '23505') {
      return await safeEditReply(
        interaction,
        `❌ A snippet named \`${name}\` already exists in this server.`,
      );
    }
    throw err;
  }

  info('Snippet saved', {
    guildId: interaction.guild.id,
    name,
    language,
    user: interaction.user.tag,
  });

  await safeEditReply(interaction, `✅ Snippet \`${name}\` saved (${language}).`);
}

async function handleGet(interaction) {
  const name = interaction.options.getString('name');
  const pool = getPool();

  const { rows } = await pool.query('SELECT * FROM snippets WHERE guild_id = $1 AND name = $2', [
    interaction.guild.id,
    name,
  ]);

  if (rows.length === 0) {
    return await safeEditReply(interaction, `❌ No snippet found named \`${name}\`.`);
  }

  const row = rows[0];

  // Increment usage count
  await pool.query(
    'UPDATE snippets SET usage_count = usage_count + 1, updated_at = NOW() WHERE id = $1',
    [row.id],
  );

  const codeBlock = `\`\`\`${row.language}\n${row.code}\n\`\`\``;
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(row.name.slice(0, 256))
    .setDescription(codeBlock.slice(0, 4096))
    .setFooter({
      text: `${row.language} • Used ${row.usage_count + 1} time${row.usage_count + 1 !== 1 ? 's' : ''}`,
    })
    .setTimestamp();

  if (row.description) {
    embed.addFields({ name: 'Description', value: row.description.slice(0, 1024) });
  }

  await safeEditReply(interaction, { embeds: [embed] });
}

async function handleSearch(interaction) {
  const query = interaction.options.getString('query');
  const pool = getPool();

  const safeQuery = query.replace(/[%_\\]/g, '\\$&');
  const { rows } = await pool.query(
    `SELECT name, language, description, code
     FROM snippets
     WHERE guild_id = $1
       AND (name ILIKE $2 OR description ILIKE $2 OR code ILIKE $2)
     ORDER BY usage_count DESC
     LIMIT 10`,
    [interaction.guild.id, `%${safeQuery}%`],
  );

  if (rows.length === 0) {
    return await safeEditReply(interaction, `❌ No snippets found matching \`${query}\`.`);
  }

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(`🔍 Snippet Search: ${query}`)
    .setFooter({ text: `${rows.length} result(s)` })
    .setTimestamp();

  for (const row of rows) {
    const preview = row.code.length > 80 ? `${row.code.slice(0, 77)}...` : row.code;
    const desc = row.description
      ? `${row.description}\n\`\`\`${row.language}\n${preview}\n\`\`\``
      : `\`\`\`${row.language}\n${preview}\n\`\`\``;
    embed.addFields({
      name: `${row.name} (${row.language})`.slice(0, 256),
      value: desc.slice(0, 1024),
    });
  }

  await safeEditReply(interaction, { embeds: [embed] });
}

async function handleList(interaction) {
  const sort = interaction.options.getString('sort') || 'recent';
  const page = interaction.options.getInteger('page') || 1;
  const pool = getPool();

  const countResult = await pool.query(
    'SELECT COUNT(*)::int AS total FROM snippets WHERE guild_id = $1',
    [interaction.guild.id],
  );
  const total = countResult.rows[0].total;

  if (total === 0) {
    return await safeEditReply(interaction, 'No snippets found in this server yet.');
  }

  const totalPages = Math.ceil(total / SNIPPETS_PER_PAGE);
  const safePage = Math.max(1, Math.min(page, totalPages));
  const offset = (safePage - 1) * SNIPPETS_PER_PAGE;

  const orderClause = sort === 'popular' ? 'usage_count DESC' : 'created_at DESC';

  const { rows } = await pool.query(
    `SELECT name, language, description, usage_count, created_at
     FROM snippets
     WHERE guild_id = $1
     ORDER BY ${orderClause}
     LIMIT $2 OFFSET $3`,
    [interaction.guild.id, SNIPPETS_PER_PAGE, offset],
  );

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle('📋 Code Snippets')
    .setFooter({
      text: `Page ${safePage} of ${totalPages} • ${total} snippet(s) • sorted by ${sort}`,
    })
    .setTimestamp();

  for (const row of rows) {
    const meta = `Language: \`${row.language}\` • Used: ${row.usage_count}x`;
    const value = row.description ? `${row.description}\n${meta}` : meta;
    embed.addFields({ name: row.name.slice(0, 256), value: value.slice(0, 1024) });
  }

  await safeEditReply(interaction, { embeds: [embed] });
}

async function handleDelete(interaction) {
  const name = interaction.options.getString('name');
  const pool = getPool();

  const { rows } = await pool.query('SELECT * FROM snippets WHERE guild_id = $1 AND name = $2', [
    interaction.guild.id,
    name,
  ]);

  if (rows.length === 0) {
    return await safeEditReply(interaction, `❌ No snippet found named \`${name}\`.`);
  }

  const row = rows[0];
  const config = getConfig(interaction.guildId);
  const isAuthor = row.author_id === interaction.user.id;
  const isMod = isModerator(interaction.member, config);

  if (!isAuthor && !isMod) {
    return await safeEditReply(
      interaction,
      '❌ You can only delete snippets you created. Moderators can delete any snippet.',
    );
  }

  await pool.query('DELETE FROM snippets WHERE id = $1', [row.id]);

  info('Snippet deleted', {
    guildId: interaction.guild.id,
    name,
    user: interaction.user.tag,
    byModerator: isMod && !isAuthor,
  });

  await safeEditReply(interaction, `✅ Snippet \`${name}\` deleted.`);
}

// ── Execute ────────────────────────────────────────────────────────

/**
 * Execute the snippet command.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();
  await interaction.deferReply({ ephemeral: subcommand !== 'get' });

  try {
    switch (subcommand) {
      case 'save':
        await handleSave(interaction);
        break;
      case 'get':
        await handleGet(interaction);
        break;
      case 'search':
        await handleSearch(interaction);
        break;
      case 'list':
        await handleList(interaction);
        break;
      case 'delete':
        await handleDelete(interaction);
        break;
    }
  } catch (err) {
    logError('Snippet command failed', { error: err.message, stack: err.stack, subcommand });
    await safeEditReply(interaction, '❌ Failed to execute snippet command.');
  }
}

// ── Autocomplete ───────────────────────────────────────────────────

/**
 * Handle autocomplete for snippet name and language fields.
 * @param {import('discord.js').AutocompleteInteraction} interaction
 */
export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  const subcommand = interaction.options.getSubcommand();

  try {
    // Language autocomplete for save subcommand
    if (subcommand === 'save' && focused.name === 'language') {
      const value = focused.value.toLowerCase();
      const filtered = LANGUAGES.filter((lang) => lang.startsWith(value)).map((lang) => ({
        name: lang,
        value: lang,
      }));
      return await interaction.respond(filtered.slice(0, 25));
    }

    // Snippet name autocomplete for get and delete subcommands
    if ((subcommand === 'get' || subcommand === 'delete') && focused.name === 'name') {
      const pool = getPool();
      const { rows } = await pool.query(
        'SELECT name, language FROM snippets WHERE guild_id = $1 AND name ILIKE $2 ORDER BY name LIMIT 25',
        [interaction.guild.id, `%${focused.value}%`],
      );

      const filtered = rows.map((r) => ({
        name: `${r.name} (${r.language})`.slice(0, 100),
        value: r.name,
      }));

      return await interaction.respond(filtered);
    }

    await interaction.respond([]);
  } catch (err) {
    logError('Snippet autocomplete failed', { error: err.message, stack: err.stack });
    await interaction.respond([]);
  }
}
