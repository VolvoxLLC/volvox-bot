/**
 * GitHub Command
 * Manage GitHub activity feed settings per guild.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/51
 */

import { ChannelType, SlashCommandBuilder } from 'discord.js';
import { getPool } from '../db.js';
import { info } from '../logger.js';
import { getConfig, setConfigValue } from '../modules/config.js';
import { isAdmin } from '../utils/permissions.js';
import { safeEditReply, safeReply } from '../utils/safeSend.js';

export const data = new SlashCommandBuilder()
  .setName('github')
  .setDescription('Manage GitHub activity feed')
  .addSubcommandGroup((group) =>
    group
      .setName('feed')
      .setDescription('GitHub feed settings')
      .addSubcommand((sub) =>
        sub
          .setName('add')
          .setDescription('Add a repo to track (Admin only)')
          .addStringOption((opt) =>
            opt
              .setName('repo')
              .setDescription('Repo in owner/repo format (e.g. VolvoxLLC/volvox-bot)')
              .setRequired(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName('remove')
          .setDescription('Remove a tracked repo (Admin only)')
          .addStringOption((opt) =>
            opt.setName('repo').setDescription('Repo in owner/repo format').setRequired(true),
          ),
      )
      .addSubcommand((sub) => sub.setName('list').setDescription('List tracked repos'))
      .addSubcommand((sub) =>
        sub
          .setName('channel')
          .setDescription('Set the feed channel (Admin only)')
          .addChannelOption((opt) =>
            opt
              .setName('channel')
              .setDescription('Channel to post GitHub events in')
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(true),
          ),
      ),
  );

/**
 * Validate that a string is in "owner/repo" format.
 *
 * @param {string} repo - The repo string to validate
 * @returns {boolean} True if valid
 */
export function isValidRepo(repo) {
  if (!repo || typeof repo !== 'string') return false;
  const parts = repo.split('/');
  if (parts.length !== 2) return false;
  const [owner, name] = parts;
  return /^[a-zA-Z0-9._-]+$/.test(owner) && /^[a-zA-Z0-9._-]+$/.test(name);
}

/**
 * Execute the /github command.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  const config = getConfig(interaction.guildId);

  if (!config?.github?.feed?.enabled) {
    await safeReply(interaction, {
      content: '❌ The GitHub feed is not enabled on this server.',
      ephemeral: true,
    });
    return;
  }

  const subcommandGroup = interaction.options.getSubcommandGroup();
  const subcommand = interaction.options.getSubcommand();

  // All feed subcommands except "list" require admin
  if (subcommandGroup === 'feed' && subcommand !== 'list') {
    if (!isAdmin(interaction.member, config)) {
      await safeReply(interaction, {
        content: '❌ You need Administrator permission to manage the GitHub feed.',
        ephemeral: true,
      });
      return;
    }
  }

  await interaction.deferReply({ ephemeral: true });

  if (subcommandGroup === 'feed') {
    if (subcommand === 'add') {
      await handleAdd(interaction, config);
    } else if (subcommand === 'remove') {
      await handleRemove(interaction, config);
    } else if (subcommand === 'list') {
      await handleList(interaction, config);
    } else if (subcommand === 'channel') {
      await handleChannel(interaction, config);
    }
  }
}

/**
 * Handle /github feed add
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {object} config
 */
async function handleAdd(interaction, config) {
  const repo = interaction.options.getString('repo');

  if (!isValidRepo(repo)) {
    await safeEditReply(interaction, {
      content: '❌ Invalid repo format. Use `owner/repo` (e.g. `VolvoxLLC/volvox-bot`).',
    });
    return;
  }

  const repos = [...(config.github?.feed?.repos ?? [])];

  if (repos.includes(repo)) {
    await safeEditReply(interaction, {
      content: `⚠️ \`${repo}\` is already being tracked.`,
    });
    return;
  }

  // Persist by updating config via setConfigValue
  repos.push(repo);
  await setConfigValue('github.feed.repos', repos, interaction.guildId);

  info('GitHub feed: repo added', { guildId: interaction.guildId, repo });

  await safeEditReply(interaction, {
    content: `✅ Now tracking \`${repo}\`.`,
  });
}

/**
 * Handle /github feed remove
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {object} config
 */
async function handleRemove(interaction, config) {
  const pool = getPool();
  const repo = interaction.options.getString('repo');

  const repos = config.github.feed.repos || [];

  if (!repos.includes(repo)) {
    await safeEditReply(interaction, {
      content: `⚠️ \`${repo}\` is not currently tracked.`,
    });
    return;
  }

  const updated = repos.filter((r) => r !== repo);
  await setConfigValue('github.feed.repos', updated, interaction.guildId);

  // Remove state row from DB so next add starts fresh
  await pool.query('DELETE FROM github_feed_state WHERE guild_id = $1 AND repo = $2', [
    interaction.guildId,
    repo,
  ]);

  info('GitHub feed: repo removed', { guildId: interaction.guildId, repo });

  await safeEditReply(interaction, {
    content: `✅ Stopped tracking \`${repo}\`.`,
  });
}

/**
 * Handle /github feed list
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {object} config
 */
async function handleList(interaction, config) {
  const repos = config.github.feed.repos || [];
  const channelId = config.github.feed.channelId;

  if (repos.length === 0) {
    await safeEditReply(interaction, {
      content: '📭 No repos are currently being tracked.',
    });
    return;
  }

  const lines = repos.map((r) => `• \`${r}\``).join('\n');
  const channelLine = channelId ? `\n📢 Feed channel: <#${channelId}>` : '\n⚠️ No feed channel set.';

  await safeEditReply(interaction, {
    content: `📋 **Tracked repos (${repos.length}):**\n${lines}${channelLine}`,
  });
}

/**
 * Handle /github feed channel
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {object} config
 */
async function handleChannel(interaction, _config) {
  const channel = interaction.options.getChannel('channel');

  await setConfigValue('github.feed.channelId', channel.id, interaction.guildId);

  info('GitHub feed: channel set', { guildId: interaction.guildId, channelId: channel.id });

  await safeEditReply(interaction, {
    content: `✅ GitHub feed will now post to <#${channel.id}>.`,
  });
}
