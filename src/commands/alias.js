/**
 * Alias Command
 *
 * Allows guild admins to create, list, and remove custom command aliases.
 * e.g. /alias add w warn  →  creates /w as an alias for /warn
 */

import { SlashCommandBuilder } from 'discord.js';
import { getPool } from '../db.js';
import { info, error as logError } from '../logger.js';
import { addAlias, listAliases, removeAlias } from '../modules/commandAliases.js';
import { safeEditReply, safeReply } from '../utils/safeSend.js';

/**
 * Discord limits command names to 1–32 lowercase letters, numbers, hyphens, underscores.
 * @param {string} name
 * @returns {boolean}
 */
function isValidCommandName(name) {
  return /^[\w-]{1,32}$/.test(name) && name === name.toLowerCase();
}

export const data = new SlashCommandBuilder()
  .setName('alias')
  .setDescription('Manage custom command aliases for this server')
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('Create a new command alias (e.g. /w → /warn)')
      .addStringOption((opt) =>
        opt
          .setName('alias')
          .setDescription('The alias name to create (e.g. "w")')
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName('command')
          .setDescription('The existing bot command to alias (e.g. "warn")')
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('Remove an existing command alias')
      .addStringOption((opt) =>
        opt.setName('alias').setDescription('The alias name to remove').setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName('list').setDescription('List all command aliases for this server'),
  );

export const adminOnly = true;

/**
 * Execute the alias command
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();

  // All subcommands require a database
  let pool;
  try {
    pool = getPool();
  } catch {
    await safeReply(interaction, {
      content: '❌ Database is not available — aliases require a database connection.',
      ephemeral: true,
    });
    return;
  }

  if (subcommand === 'list') {
    await handleList(interaction);
    return;
  }

  if (subcommand === 'add') {
    await handleAdd(interaction, pool);
    return;
  }

  if (subcommand === 'remove') {
    await handleRemove(interaction, pool);
  }
}

/**
 * List all aliases for the current guild.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function handleList(interaction) {
  const aliases = listAliases(interaction.guildId);

  if (aliases.length === 0) {
    await safeReply(interaction, {
      content: 'ℹ️ No command aliases set for this server. Use `/alias add` to create one.',
      ephemeral: true,
    });
    return;
  }

  const lines = aliases
    .sort((a, b) => a.alias.localeCompare(b.alias))
    .map(({ alias, targetCommand }) => `• \`/${alias}\` → \`/${targetCommand}\``);

  await safeReply(interaction, {
    content: `**Command Aliases** (${aliases.length})\n${lines.join('\n')}`,
    ephemeral: true,
  });
}

/**
 * Create a new command alias for the guild.
 *
 * Validates the requested alias and target command, persists the alias to the database,
 * and sends an ephemeral reply indicating success or the reason for failure.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction - The invoking interaction; must include string options `alias` and `command` and be executed in a guild context.
 */
async function handleAdd(interaction, pool) {
  const alias = interaction.options.getString('alias').toLowerCase().trim();
  const targetCommand = interaction.options.getString('command').toLowerCase().trim();

  // Validate alias name
  if (!isValidCommandName(alias)) {
    await safeReply(interaction, {
      content:
        '❌ Invalid alias name. Use only lowercase letters, numbers, hyphens, and underscores (1–32 chars).',
      ephemeral: true,
    });
    return;
  }

  // Prevent shadowing built-in commands
  const existingCommand = interaction.client.commands.get(alias);
  if (existingCommand) {
    await safeReply(interaction, {
      content: `❌ \`/${alias}\` is already a built-in command and cannot be used as an alias.`,
      ephemeral: true,
    });
    return;
  }

  // Verify target command exists
  const target = interaction.client.commands.get(targetCommand);
  if (!target) {
    const availableCommands = Array.from(interaction.client.commands.keys())
      .sort((a, b) => a.localeCompare(b))
      .map((c) => `\`/${c}\``)
      .join(', ');
    await safeReply(interaction, {
      content: `❌ Unknown command \`/${targetCommand}\`.\n\nAvailable commands: ${availableCommands}`,
      ephemeral: true,
    });
    return;
  }

  // Prevent aliasing the alias command itself (circular)
  if (targetCommand === 'alias') {
    await safeReply(interaction, {
      content: '❌ Cannot create an alias for the `/alias` command.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    await addAlias({
      pool,
      guildId: interaction.guildId,
      alias,
      targetCommand,
      createdBy: interaction.user.id,
      clientId: interaction.client.user.id,
      targetCommandData: target.data,
    });

    info('Alias created', {
      alias,
      targetCommand,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      createdBy: interaction.user.tag,
    });

    await safeEditReply(interaction, {
      content: `✅ Created alias \`/${alias}\` → \`/${targetCommand}\`.\nUsers can now use \`/${alias}\` in this server.`,
    });
  } catch (err) {
    logError('Failed to add alias', {
      alias,
      targetCommand,
      guildId: interaction.guildId,
      error: err.message,
    });
    await safeEditReply(interaction, {
      content: `❌ Failed to create alias: ${err.message}`,
    });
  }
}

/**
 * Remove a guild-level command alias and notify the user.
 *
 * Attempts to remove the specified alias from the guild's alias store, sends an ephemeral reply
 * with the result, and records success or failure in structured logs.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction - The command interaction that invoked the removal; used for options, guild context, replying, and actor identity.
 * @param {import('pg').Pool} pool - PostgreSQL connection pool used to perform the alias removal.
 */
async function handleRemove(interaction, pool) {
  const alias = interaction.options.getString('alias').toLowerCase().trim();

  await interaction.deferReply({ ephemeral: true });

  try {
    await removeAlias({
      pool,
      guildId: interaction.guildId,
      alias,
      clientId: interaction.client.user.id,
    });

    info('Alias removed', {
      alias,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      removedBy: interaction.user.tag,
    });

    await safeEditReply(interaction, {
      content: `✅ Alias \`/${alias}\` has been removed.`,
    });
  } catch (err) {
    logError('Failed to remove alias', {
      alias,
      guildId: interaction.guildId,
      error: err.message,
    });
    await safeEditReply(interaction, {
      content: `❌ ${err.message}`,
    });
  }
}
