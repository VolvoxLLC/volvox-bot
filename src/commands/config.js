/**
 * Config Command
 * View, set, and reset bot configuration via slash commands
 */

import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { getConfig, resetConfig, setConfigValue } from '../modules/config.js';

/**
 * Escape backticks in user-provided strings to prevent breaking Discord inline code formatting.
 * @param {string} str - Raw string to sanitize
 * @returns {string} Sanitized string safe for embedding inside backtick-delimited code spans
 */
function escapeInlineCode(str) {
  return String(str).replace(/`/g, '\\`');
}

export const data = new SlashCommandBuilder()
  .setName('config')
  .setDescription('View or manage bot configuration (Admin only)')
  .addSubcommand((subcommand) =>
    subcommand
      .setName('view')
      .setDescription('View current configuration')
      .addStringOption((option) =>
        option
          .setName('section')
          .setDescription('Specific config section to view')
          .setRequired(false)
          .setAutocomplete(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('set')
      .setDescription('Set a configuration value')
      .addStringOption((option) =>
        option
          .setName('path')
          .setDescription('Dot-notation path (e.g., ai.model, welcome.enabled)')
          .setRequired(true)
          .setAutocomplete(true),
      )
      .addStringOption((option) =>
        option
          .setName('value')
          .setDescription(
            'Value (auto-coerces true/false/null/numbers; use "\\"text\\"" for literal strings)',
          )
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('reset')
      .setDescription('Reset configuration to defaults from config.json')
      .addStringOption((option) =>
        option
          .setName('section')
          .setDescription('Section to reset (omit to reset all)')
          .setRequired(false)
          .setAutocomplete(true),
      ),
  );

export const adminOnly = true;

/**
 * Recursively collect leaf-only dot-notation paths for a config object.
 * Only emits paths that point to non-object values (leaves).
 * @param {*} source - Config value to traverse
 * @param {string} [prefix] - Current path prefix
 * @param {string[]} [paths] - Accumulator array
 * @returns {string[]} Dot-notation config paths (leaf-only)
 */
function collectConfigPaths(source, prefix = '', paths = []) {
  if (Array.isArray(source)) {
    // Emit path for empty arrays so they're discoverable in autocomplete
    if (source.length === 0 && prefix) {
      paths.push(prefix);
      return paths;
    }
    source.forEach((value, index) => {
      const path = prefix ? `${prefix}.${index}` : String(index);
      if (value && typeof value === 'object') {
        collectConfigPaths(value, path, paths);
      } else {
        paths.push(path);
      }
    });
    return paths;
  }

  if (!source || typeof source !== 'object') {
    return paths;
  }

  // Emit path for empty objects so they're discoverable in autocomplete
  if (Object.keys(source).length === 0 && prefix) {
    paths.push(prefix);
    return paths;
  }

  for (const [key, value] of Object.entries(source)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') {
      collectConfigPaths(value, path, paths);
    } else {
      paths.push(path);
    }
  }

  return paths;
}

/**
 * Handle autocomplete for config paths and section names
 * @param {Object} interaction - Discord interaction
 */
export async function autocomplete(interaction) {
  const focusedOption = interaction.options.getFocused(true);
  const focusedValue = focusedOption.value.toLowerCase().trim();
  const config = getConfig();

  let choices;
  if (focusedOption.name === 'section') {
    // Autocomplete section names from live config
    choices = Object.keys(config)
      .filter((s) => s.toLowerCase().includes(focusedValue))
      .slice(0, 25)
      .map((s) => ({ name: s, value: s }));
  } else {
    // Autocomplete dot-notation paths (leaf-only)
    const paths = collectConfigPaths(config);
    choices = paths
      .filter((p) => p.toLowerCase().includes(focusedValue))
      .sort((a, b) => {
        const aLower = a.toLowerCase();
        const bLower = b.toLowerCase();
        const aStartsWithFocus = aLower.startsWith(focusedValue);
        const bStartsWithFocus = bLower.startsWith(focusedValue);
        if (aStartsWithFocus !== bStartsWithFocus) {
          return aStartsWithFocus ? -1 : 1;
        }
        return aLower.localeCompare(bLower);
      })
      .slice(0, 25)
      .map((p) => ({ name: p, value: p }));
  }

  await interaction.respond(choices);
}

/**
 * Execute the config command
 * @param {Object} interaction - Discord interaction
 */
export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'view':
      await handleView(interaction);
      break;
    case 'set':
      await handleSet(interaction);
      break;
    case 'reset':
      await handleReset(interaction);
      break;
    default:
      await interaction.reply({
        content: `❌ Unknown subcommand: \`${subcommand}\``,
        ephemeral: true,
      });
      break;
  }
}

/** @type {number} Discord embed total character limit */
const EMBED_CHAR_LIMIT = 6000;

/**
 * Handle /config view
 */
async function handleView(interaction) {
  try {
    const config = getConfig();
    const section = interaction.options.getString('section');

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('⚙️ Bot Configuration')
      .setFooter({
        text: `${process.env.DATABASE_URL ? 'Stored in PostgreSQL' : 'Stored in memory (config.json)'} • Use /config set to modify`,
      })
      .setTimestamp();

    if (section) {
      const sectionData = config[section];
      if (!sectionData) {
        const safeSection = escapeInlineCode(section);
        return await interaction.reply({
          content: `❌ Section \`${safeSection}\` not found in config`,
          ephemeral: true,
        });
      }

      embed.setDescription(`**${section.toUpperCase()} Configuration**`);
      const sectionJson = JSON.stringify(sectionData, null, 2);
      embed.addFields({
        name: 'Settings',
        value:
          '```json\n' +
          (sectionJson.length > 1000 ? `${sectionJson.slice(0, 997)}...` : sectionJson) +
          '\n```',
      });
    } else {
      embed.setDescription('Current bot configuration');

      // Track cumulative embed size to stay under Discord's 6000-char limit
      let totalLength = (embed.data.title?.length || 0) + (embed.data.description?.length || 0);
      let truncated = false;

      for (const [key, value] of Object.entries(config)) {
        const jsonStr = JSON.stringify(value, null, 2);
        const fieldValue = `\`\`\`json\n${jsonStr.length > 1000 ? `${jsonStr.slice(0, 997)}...` : jsonStr}\n\`\`\``;
        const fieldName = key.toUpperCase();
        const fieldLength = fieldName.length + fieldValue.length;

        if (totalLength + fieldLength > EMBED_CHAR_LIMIT - 200) {
          // Reserve space for a truncation notice
          embed.addFields({
            name: '⚠️ Truncated',
            value: 'Use `/config view section:<name>` to see remaining sections.',
            inline: false,
          });
          truncated = true;
          break;
        }

        totalLength += fieldLength;
        embed.addFields({
          name: fieldName,
          value: fieldValue,
          inline: false,
        });
      }

      if (truncated) {
        embed.setFooter({
          text: 'Some sections omitted • Use /config view section:<name> for details',
        });
      }
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (err) {
    const safeMessage =
      process.env.NODE_ENV === 'production' ? 'An internal error occurred.' : err.message;
    await interaction.reply({
      content: `❌ Failed to load config: ${safeMessage}`,
      ephemeral: true,
    });
  }
}

/**
 * Handle /config set
 */
async function handleSet(interaction) {
  const path = interaction.options.getString('path');
  const value = interaction.options.getString('value');

  // Validate section exists in live config
  const section = path.split('.')[0];
  const validSections = Object.keys(getConfig());
  if (!validSections.includes(section)) {
    const safeSection = escapeInlineCode(section);
    return await interaction.reply({
      content: `❌ Invalid section \`${safeSection}\`. Valid sections: ${validSections.join(', ')}`,
      ephemeral: true,
    });
  }

  try {
    await interaction.deferReply({ ephemeral: true });

    const updatedSection = await setConfigValue(path, value);

    // Traverse to the actual leaf value for display
    const leafValue = path
      .split('.')
      .slice(1)
      .reduce((obj, k) => obj?.[k], updatedSection);

    const displayValue = JSON.stringify(leafValue, null, 2) ?? value;
    const truncatedValue =
      displayValue.length > 1000 ? `${displayValue.slice(0, 997)}...` : displayValue;

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('✅ Config Updated')
      .addFields(
        { name: 'Path', value: `\`${escapeInlineCode(path)}\``, inline: true },
        { name: 'New Value', value: `\`${escapeInlineCode(truncatedValue)}\``, inline: true },
      )
      .setFooter({ text: 'Changes take effect immediately' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    const safeMessage =
      process.env.NODE_ENV === 'production' ? 'An internal error occurred.' : err.message;
    const content = `❌ Failed to set config: ${safeMessage}`;
    if (interaction.deferred) {
      await interaction.editReply({ content });
    } else {
      await interaction.reply({ content, ephemeral: true });
    }
  }
}

/**
 * Handle /config reset
 */
async function handleReset(interaction) {
  const section = interaction.options.getString('section');

  try {
    await interaction.deferReply({ ephemeral: true });

    await resetConfig(section || undefined);

    const embed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle('🔄 Config Reset')
      .setDescription(
        section
          ? `Section **${escapeInlineCode(section)}** has been reset to defaults from config.json.`
          : 'All configuration has been reset to defaults from config.json.',
      )
      .setFooter({ text: 'Changes take effect immediately' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    const safeMessage =
      process.env.NODE_ENV === 'production' ? 'An internal error occurred.' : err.message;
    const content = `❌ Failed to reset config: ${safeMessage}`;
    if (interaction.deferred) {
      await interaction.editReply({ content });
    } else {
      await interaction.reply({ content, ephemeral: true });
    }
  }
}
