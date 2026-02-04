import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, '..', '..', 'config.json');

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
          .addChoices(
            { name: 'AI Settings', value: 'ai' },
            { name: 'Welcome Messages', value: 'welcome' },
            { name: 'Moderation', value: 'moderation' },
            { name: 'Permissions', value: 'permissions' }
          )
      )
  );

export const adminOnly = true;

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'view') {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      const section = interaction.options.getString('section');

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('⚙️ Bot Configuration')
        .setTimestamp();

      if (section) {
        // Show specific section
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
        // Show all sections
        embed.setDescription('Current bot configuration');

        for (const [key, value] of Object.entries(config)) {
          const jsonStr = JSON.stringify(value, null, 2);
          const truncated = jsonStr.length > 1000
            ? jsonStr.slice(0, 997) + '...'
            : jsonStr;

          embed.addFields({
            name: `${key.toUpperCase()}`,
            value: '```json\n' + truncated + '\n```',
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
}
