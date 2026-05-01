/**
 * Modlog Command
 * Configure moderation logging channel routing
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import { info, error as logError } from '../logger.js';
import { getConfig, setConfigValue } from '../modules/config.js';
import { getPermissionError, hasPermission } from '../utils/permissions.js';
import { safeEditReply, safeReply, safeUpdate } from '../utils/safeSend.js';

export const data = new SlashCommandBuilder()
  .setName('modlog')
  .setDescription('Configure moderation logging')
  .addSubcommand((sub) => sub.setName('setup').setDescription('Configure log channel routing'))
  .addSubcommand((sub) => sub.setName('view').setDescription('View current log routing'))
  .addSubcommand((sub) => sub.setName('disable').setDescription('Disable mod logging'));

export const adminOnly = true;

/**
 * Execute the modlog command
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  const config = getConfig();
  if (!hasPermission(interaction.member, 'modlog', config)) {
    const permLevel = config.permissions?.allowedCommands?.modlog || 'administrator';
    return await safeReply(interaction, {
      content: getPermissionError('modlog', permLevel),
      ephemeral: true,
    });
  }

  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'setup':
      await handleSetup(interaction);
      break;
    case 'view':
      await handleView(interaction);
      break;
    case 'disable':
      await handleDisable(interaction);
      break;
    default:
      logError('Unknown modlog subcommand', { subcommand, command: 'modlog' });
      await safeReply(interaction, { content: '❌ Unknown subcommand.', ephemeral: true }).catch(
        () => {},
      );
  }
}

/**
 * Run an interactive configuration flow to map moderation event categories to guild text channels.
 *
 * Prompts the command invoker with an ephemeral, menu-driven UI to select an event category and assign a text channel; each mapping is persisted to the guild's configuration. The interaction UI only accepts input from the invoking user and will time out after five minutes.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction - The command interaction that initiated setup.
 */
async function handleSetup(interaction) {
  const categorySelect = new StringSelectMenuBuilder()
    .setCustomId('modlog_category')
    .setPlaceholder('Select an event category to configure')
    .addOptions(
      {
        label: 'Default (fallback)',
        value: 'default',
        description: 'Fallback channel for unconfigured events',
      },
      { label: 'Warns', value: 'warns', description: 'Warning events' },
      { label: 'Bans', value: 'bans', description: 'Ban/unban/tempban events' },
      { label: 'Kicks', value: 'kicks', description: 'Kick events' },
      { label: 'Timeouts', value: 'timeouts', description: 'Timeout events' },
      { label: 'Purges', value: 'purges', description: 'Message purge events' },
      { label: 'Locks', value: 'locks', description: 'Channel lock/unlock events' },
    );

  const row = new ActionRowBuilder().addComponents(categorySelect);
  const doneRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('modlog_done').setLabel('Done').setStyle(ButtonStyle.Success),
  );

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📋 Mod Log Setup')
    .setDescription('Select an event category to configure its log channel.')
    .setTimestamp();

  const reply = await safeReply(interaction, {
    embeds: [embed],
    components: [row, doneRow],
    ephemeral: true,
    fetchReply: true,
  });

  const collector = reply.createMessageComponentCollector({
    filter: (i) => i.user.id === interaction.user.id,
    time: 300000,
  });

  let selectedCategory = null;

  collector.on('collect', async (i) => {
    try {
      if (i.customId === 'modlog_done') {
        await safeUpdate(i, {
          components: [],
          embeds: [embed.setDescription('✅ Mod log setup complete.')],
        });
        collector.stop();
        return;
      }

      if (i.customId === 'modlog_category') {
        selectedCategory = i.values[0];
        const channelSelect = new ChannelSelectMenuBuilder()
          .setCustomId('modlog_channel')
          .setPlaceholder(`Select channel for ${selectedCategory}`)
          .setChannelTypes(ChannelType.GuildText);
        const channelRow = new ActionRowBuilder().addComponents(channelSelect);
        await safeUpdate(i, {
          embeds: [embed.setDescription(`Select a channel for **${selectedCategory}** events.`)],
          components: [channelRow, doneRow],
        });
        return;
      }

      if (i.customId === 'modlog_channel' && selectedCategory) {
        const channelId = i.values[0];
        await setConfigValue(
          `moderation.logging.channels.${selectedCategory}`,
          channelId,
          interaction.guildId,
        );
        info('Modlog channel configured', {
          category: selectedCategory,
          channelId,
          guildId: interaction.guildId,
        });
        await safeUpdate(i, {
          embeds: [
            embed.setDescription(
              `✅ **${selectedCategory}** → <#${channelId}>\n\nSelect another category or click Done.`,
            ),
          ],
          components: [row, doneRow],
        });
        selectedCategory = null;
      }
    } catch (err) {
      logError('Modlog setup interaction failed', {
        guildId: interaction.guildId,
        channelId: i.channelId,
        error: err.message,
        customId: i.customId,
        command: 'modlog',
      });
      await safeReply(i, {
        content: '❌ Failed to update modlog configuration. Please try again.',
        ephemeral: true,
      }).catch(() => {});
    }
  });

  collector.on('end', async (_, reason) => {
    if (reason === 'time') {
      await safeEditReply(interaction, {
        components: [],
        embeds: [embed.setDescription('⏰ Setup timed out.')],
      }).catch(() => {});
    }
  });
}

/**
 * Handle /modlog view — display current log routing configuration
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function handleView(interaction) {
  try {
    const config = getConfig(interaction.guildId);
    const channels = config.moderation?.logging?.channels || {};

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('📋 Mod Log Configuration')
      .setTimestamp();

    const lines = Object.entries(channels).map(
      ([key, value]) => `**${key}:** ${value ? `<#${value}>` : '*Not set*'}`,
    );
    embed.setDescription(lines.join('\n') || 'No channels configured.');

    await safeReply(interaction, { embeds: [embed], ephemeral: true });
  } catch (err) {
    logError('Modlog view failed', { error: err.message, command: 'modlog' });
    await safeReply(interaction, {
      content: '❌ Failed to load mod log configuration.',
      ephemeral: true,
    }).catch(() => {});
  }
}

/**
 * Clear all configured moderation log channels for the current guild and confirm the action to the command invoker.
 *
 * Clears stored channel routing for moderation events, logs the change with moderator, guild, and channel context, and edits the ephemeral command reply to indicate success or failure.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction - The command interaction that invoked the disable action.
 */
async function handleDisable(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const keys = ['default', 'warns', 'bans', 'kicks', 'timeouts', 'purges', 'locks'];
    for (const key of keys) {
      await setConfigValue(`moderation.logging.channels.${key}`, null, interaction.guildId);
    }

    info('Mod logging disabled', {
      moderator: interaction.user.tag,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
    });
    await safeEditReply(
      interaction,
      '✅ Mod logging has been disabled. All log channels have been cleared.',
    );
  } catch (err) {
    logError('Modlog disable failed', {
      error: err.message,
      command: 'modlog',
      guildId: interaction.guildId,
    });
    await safeEditReply(interaction, '❌ Failed to disable mod logging.').catch(() => {});
  }
}
