/**
 * Config Command
 * View, set, and reset bot configuration via slash commands
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getConfig, setConfigValue, resetConfig } from '../modules/config.js';

const VALID_SECTIONS = ['ai', 'chimeIn', 'welcome', 'moderation', 'logging', 'permissions'];

/** @type {Array<{name: string, value: string}>} Derived choices for section options */
const SECTION_CHOICES = VALID_SECTIONS.map(s => ({
  name: s.charAt(0).toUpperCase() + s.slice(1).replace(/([A-Z])/g, ' $1'),
  value: s,
}));

export const data = new SlashCommandBuilder()
  .setName('config')
  .setDescription('View or manage bot configuration (Admin only)')
  .addSubcommand(subcommand =>
    subcommand
      .setName('view')
      .setDescription('View current configuration')
      .addStringOption(option =>
        option
          .setName('section')
          .setDescription('Specific config section to view')
          .setRequired(false)
          .addChoices(...SECTION_CHOICES)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('set')
      .setDescription('Set a configuration value')
      .addStringOption(option =>
        option
          .setName('path')
          .setDescription('Dot-notation path (e.g., ai.model, welcome.enabled)')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('value')
          .setDescription('Value to set (strings, numbers, booleans, JSON arrays)')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('reset')
      .setDescription('Reset configuration to defaults from config.json')
      .addStringOption(option =>
        option
          .setName('section')
          .setDescription('Section to reset (omit to reset all)')
          .setRequired(false)
          .addChoices(...SECTION_CHOICES)
      )
  );

export const adminOnly = true;

/**
 * Recursively flatten config keys into dot-notation paths
 * @param {Object} obj - Object to flatten
 * @param {string} prefix - Current path prefix
 * @returns {string[]} Array of dot-notation paths
 */
function flattenConfigKeys(obj, prefix) {
  const paths = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullPath = `${prefix}.${key}`;
    paths.push(fullPath);
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      paths.push(...flattenConfigKeys(value, fullPath));
    }
  }
  return paths;
}

/**
 * Handle autocomplete for config paths
 * @param {Object} interaction - Discord interaction
 */
export async function autocomplete(interaction) {
  const focusedValue = interaction.options.getFocused().toLowerCase();
  const config = getConfig();

  const paths = [];
  for (const [section, value] of Object.entries(config)) {
    if (typeof value === 'object' && value !== null) {
      paths.push(...flattenConfigKeys(value, section));
    }
  }

  const filtered = paths
    .filter(p => p.toLowerCase().includes(focusedValue))
    .slice(0, 25);

  await interaction.respond(
    filtered.map(p => ({ name: p, value: p }))
  );
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
      .setColor(0x5865F2)
      .setTitle('⚙️ Bot Configuration')
      .setFooter({ text: 'Stored in PostgreSQL • Use /config set to modify' })
      .setTimestamp();

    if (section) {
      const sectionData = config[section];
      if (!sectionData) {
        return await interaction.reply({
          content: `❌ Section '${section}' not found in config`,
          ephemeral: true
        });
      }

      embed.setDescription(`**${section.toUpperCase()} Configuration**`);
      embed.addFields({
        name: 'Settings',
        value: '```json\n' + JSON.stringify(sectionData, null, 2) + '\n```'
      });
    } else {
      embed.setDescription('Current bot configuration');

      // Track cumulative embed size to stay under Discord's 6000-char limit
      let totalLength = embed.data.title.length + embed.data.description.length;
      let truncated = false;

      for (const [key, value] of Object.entries(config)) {
        const jsonStr = JSON.stringify(value, null, 2);
        const fieldValue = '```json\n' + (jsonStr.length > 1000 ? jsonStr.slice(0, 997) + '...' : jsonStr) + '\n```';
        const fieldName = key.toUpperCase();
        const fieldLength = fieldName.length + fieldValue.length;

        if (totalLength + fieldLength > EMBED_CHAR_LIMIT - 200) {
          // Reserve space for a truncation notice
          embed.addFields({
            name: '⚠️ Truncated',
            value: `Use \`/config view section:<name>\` to see remaining sections.`,
            inline: false
          });
          truncated = true;
          break;
        }

        totalLength += fieldLength;
        embed.addFields({
          name: fieldName,
          value: fieldValue,
          inline: false
        });
      }
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (err) {
    await interaction.reply({
      content: `❌ Failed to load config: ${err.message}`,
      ephemeral: true
    });
  }
}

/**
 * Handle /config set
 */
async function handleSet(interaction) {
  const path = interaction.options.getString('path');
  const value = interaction.options.getString('value');

  // Validate section exists
  const section = path.split('.')[0];
  if (!VALID_SECTIONS.includes(section)) {
    return await interaction.reply({
      content: `❌ Invalid section '${section}'. Valid sections: ${VALID_SECTIONS.join(', ')}`,
      ephemeral: true
    });
  }

  try {
    await interaction.deferReply({ ephemeral: true });

    const updatedSection = await setConfigValue(path, value);

    // Traverse to the actual leaf value for display
    const leafValue = path.split('.').slice(1).reduce((obj, k) => obj?.[k], updatedSection);

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('✅ Config Updated')
      .addFields(
        { name: 'Path', value: `\`${path}\``, inline: true },
        { name: 'New Value', value: `\`${JSON.stringify(leafValue, null, 2) ?? value}\``, inline: true }
      )
      .setFooter({ text: 'Changes take effect immediately' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    const content = `❌ Failed to set config: ${err.message}`;
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
      .setColor(0xFEE75C)
      .setTitle('🔄 Config Reset')
      .setDescription(
        section
          ? `Section **${section}** has been reset to defaults from config.json.`
          : 'All configuration has been reset to defaults from config.json.'
      )
      .setFooter({ text: 'Changes take effect immediately' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    const content = `❌ Failed to reset config: ${err.message}`;
    if (interaction.deferred) {
      await interaction.editReply({ content });
    } else {
      await interaction.reply({ content, ephemeral: true });
    }
  }
}
