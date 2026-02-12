/**
 * Purge Command
 * Bulk delete messages with filtering subcommands
 */

import { SlashCommandBuilder } from 'discord.js';
import { info, error as logError } from '../logger.js';
import { getConfig } from '../modules/config.js';
import { createCase, sendModLogEmbed } from '../modules/moderation.js';

export const data = new SlashCommandBuilder()
  .setName('purge')
  .setDescription('Bulk delete messages')
  .addSubcommand((sub) =>
    sub
      .setName('all')
      .setDescription('Delete recent messages')
      .addIntegerOption((opt) =>
        opt
          .setName('count')
          .setDescription('Number of recent messages to scan (1-100)')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(100),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('user')
      .setDescription('Delete messages from a specific user')
      .addUserOption((opt) => opt.setName('user').setDescription('Target user').setRequired(true))
      .addIntegerOption((opt) =>
        opt
          .setName('count')
          .setDescription('Messages to scan (1-100, deletions may be fewer after filtering)')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(100),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('bot')
      .setDescription('Delete messages from bots')
      .addIntegerOption((opt) =>
        opt
          .setName('count')
          .setDescription('Messages to scan (1-100, deletions may be fewer after filtering)')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(100),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('contains')
      .setDescription('Delete messages containing text')
      .addStringOption((opt) =>
        opt.setName('text').setDescription('Text to search for').setRequired(true),
      )
      .addIntegerOption((opt) =>
        opt
          .setName('count')
          .setDescription('Messages to scan (1-100, deletions may be fewer after filtering)')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(100),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('links')
      .setDescription('Delete messages containing links')
      .addIntegerOption((opt) =>
        opt
          .setName('count')
          .setDescription('Messages to scan (1-100, deletions may be fewer after filtering)')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(100),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('attachments')
      .setDescription('Delete messages with attachments')
      .addIntegerOption((opt) =>
        opt
          .setName('count')
          .setDescription('Messages to scan (1-100, deletions may be fewer after filtering)')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(100),
      ),
  );

export const adminOnly = true;

/**
 * Execute the purge command
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    const subcommand = interaction.options.getSubcommand();
    const count = interaction.options.getInteger('count');
    const channel = interaction.channel;
    const fetched = await channel.messages.fetch({ limit: count });

    // Filter out messages older than 14 days (Discord bulk delete limit)
    const fourteenDaysAgo = Date.now() - 14 * 86400 * 1000;
    let filtered = fetched.filter((m) => m.createdTimestamp > fourteenDaysAgo);

    let filterDetail = subcommand;

    switch (subcommand) {
      case 'user': {
        const user = interaction.options.getUser('user');
        filtered = filtered.filter((m) => m.author.id === user.id);
        filterDetail = `user:${user.id}`;
        break;
      }
      case 'bot':
        filtered = filtered.filter((m) => m.author.bot);
        break;
      case 'contains': {
        const text = interaction.options.getString('text').toLowerCase();
        filtered = filtered.filter((m) => m.content.toLowerCase().includes(text));
        filterDetail = `contains:${text}`;
        break;
      }
      case 'links':
        filtered = filtered.filter((m) => /https?:\/\/\S+/i.test(m.content));
        break;
      case 'attachments':
        filtered = filtered.filter((m) => m.attachments.size > 0);
        break;
      // 'all' — no additional filter needed
    }

    const deleted = await channel.bulkDelete(filtered, true);

    info('Purge executed', {
      guildId: interaction.guild.id,
      channelId: channel.id,
      moderator: interaction.user.tag,
      subcommand,
      deleted: deleted.size,
      scanned: fetched.size,
    });

    const config = getConfig();
    const caseData = await createCase(interaction.guild.id, {
      action: 'purge',
      targetId: channel.id,
      targetTag: `#${channel.name}`,
      moderatorId: interaction.user.id,
      moderatorTag: interaction.user.tag,
      reason: `${deleted.size} message(s) deleted | filter=${filterDetail} | scanned=${fetched.size}`,
    });

    await sendModLogEmbed(interaction.client, config, caseData);

    await interaction.editReply(
      `Deleted **${deleted.size}** message(s) from **${fetched.size}** scanned message(s).`,
    );
  } catch (err) {
    logError('Purge command failed', { error: err.message, command: 'purge' });
    await interaction
      .editReply('❌ An error occurred. Please try again or contact an administrator.')
      .catch(() => {});
  }
}
