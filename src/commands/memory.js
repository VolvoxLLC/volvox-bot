/**
 * Memory Command
 * Allows users to view and manage what the bot remembers about them.
 *
 * Memories are stored externally on the mem0 platform (api.mem0.ai).
 * Users can view their data with /memory view and delete it with
 * /memory forget at any time.
 *
 * Subcommands:
 *   /memory view    — Show all memories the bot has about you
 *   /memory forget  — Clear all your memories (with confirmation)
 *   /memory forget <topic> — Clear memories matching a topic
 *   /memory optout  — Toggle memory collection on/off
 *   /memory admin view @user   — (Mod) View any user's memories
 *   /memory admin clear @user  — (Mod) Clear any user's memories
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { info, warn } from '../logger.js';
import {
  deleteAllMemories,
  deleteMemory,
  getMemories,
  isMemoryAvailable,
  searchMemories,
} from '../modules/memory.js';
import { isOptedOut, toggleOptOut } from '../modules/optout.js';
import { splitMessage } from '../utils/splitMessage.js';

/**
 * Truncate a memory list to fit within Discord's 2000-char limit.
 * @param {string} memoryList - Numbered memory lines joined by newlines
 * @param {string} header - Header text prepended to the output
 * @returns {string} Final message content, truncated if necessary
 */
function formatMemoryList(memoryList, header) {
  const truncationNotice = '\n\n*(...and more)*';
  const maxBodyLength = 2000 - header.length - truncationNotice.length;

  const chunks = splitMessage(memoryList, maxBodyLength);
  const isTruncated = chunks.length > 1;
  return isTruncated ? `${header}${chunks[0]}${truncationNotice}` : `${header}${memoryList}`;
}

export const data = new SlashCommandBuilder()
  .setName('memory')
  .setDescription('Manage what the bot remembers about you (stored externally)')
  .addSubcommand((sub) =>
    sub.setName('view').setDescription('View what the bot remembers about you'),
  )
  .addSubcommand((sub) =>
    sub
      .setName('forget')
      .setDescription('Forget your memories (all or by topic)')
      .addStringOption((opt) =>
        opt
          .setName('topic')
          .setDescription('Specific topic to forget (omit to forget everything)')
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName('optout').setDescription('Toggle memory collection on/off for your account'),
  )
  .addSubcommandGroup((group) =>
    group
      .setName('admin')
      .setDescription('Admin memory management commands')
      .addSubcommand((sub) =>
        sub
          .setName('view')
          .setDescription("View a user's memories")
          .addUserOption((opt) =>
            opt.setName('user').setDescription('The user to view memories for').setRequired(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName('clear')
          .setDescription("Clear a user's memories")
          .addUserOption((opt) =>
            opt.setName('user').setDescription('The user to clear memories for').setRequired(true),
          ),
      ),
  );

/**
 * Execute the /memory command
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  const subcommandGroup = interaction.options.getSubcommandGroup(false);
  const subcommand = interaction.options.getSubcommand();
  const userId = interaction.user.id;
  const username = interaction.user.username;

  // Handle admin subcommand group
  if (subcommandGroup === 'admin') {
    await handleAdmin(interaction, subcommand);
    return;
  }

  // Handle opt-out (doesn't require memory to be available)
  if (subcommand === 'optout') {
    await handleOptOut(interaction, userId);
    return;
  }

  if (!isMemoryAvailable()) {
    await interaction.reply({
      content:
        '🧠 Memory system is currently unavailable. The bot still works, just without long-term memory.',
      ephemeral: true,
    });
    return;
  }

  if (subcommand === 'view') {
    await handleView(interaction, userId, username);
  } else if (subcommand === 'forget') {
    const topic = interaction.options.getString('topic');
    if (topic) {
      await handleForgetTopic(interaction, userId, username, topic);
    } else {
      await handleForgetAll(interaction, userId, username);
    }
  }
}

/**
 * Handle /memory optout — toggle memory collection for the user
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {string} userId
 */
async function handleOptOut(interaction, userId) {
  const { optedOut } = await toggleOptOut(userId);

  if (optedOut) {
    await interaction.reply({
      content:
        '🚫 You have **opted out** of memory collection. The bot will no longer remember things about you. Your existing memories are unchanged — use `/memory forget` to delete them.',
      ephemeral: true,
    });
  } else {
    await interaction.reply({
      content:
        '✅ You have **opted back in** to memory collection. The bot will start remembering things about you again.',
      ephemeral: true,
    });
  }

  info('Memory opt-out toggled', { userId, optedOut });
}

/**
 * Handle /memory view — show all memories for the user
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {string} userId
 * @param {string} username
 */
async function handleView(interaction, userId, username) {
  await interaction.deferReply({ ephemeral: true });

  const memories = await getMemories(userId);

  if (memories.length === 0) {
    await interaction.editReply({
      content:
        "🧠 I don't have any memories about you yet. Chat with me and I'll start remembering!",
    });
    return;
  }

  const memoryList = memories.map((m, i) => `${i + 1}. ${m.memory}`).join('\n');
  const header = `🧠 **What I remember about ${username}:**\n\n`;
  const content = formatMemoryList(memoryList, header);

  await interaction.editReply({ content });

  info('Memory view command', { userId, username, count: memories.length });
}

/**
 * Handle /memory forget (all) — delete all memories with confirmation
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {string} userId
 * @param {string} username
 */
async function handleForgetAll(interaction, userId, username) {
  const confirmButton = new ButtonBuilder()
    .setCustomId('memory_forget_confirm')
    .setLabel('Confirm')
    .setStyle(ButtonStyle.Danger);

  const cancelButton = new ButtonBuilder()
    .setCustomId('memory_forget_cancel')
    .setLabel('Cancel')
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

  const response = await interaction.reply({
    content:
      '⚠️ **Are you sure?** This will delete **ALL** your memories permanently. This cannot be undone.',
    components: [row],
    ephemeral: true,
  });

  try {
    const buttonInteraction = await response.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: (i) => i.user.id === userId,
      time: 30_000,
    });

    if (buttonInteraction.customId === 'memory_forget_confirm') {
      const success = await deleteAllMemories(userId);

      if (success) {
        await buttonInteraction.update({
          content: '🧹 Done! All your memories have been cleared. Fresh start!',
          components: [],
        });
        info('All memories cleared', { userId, username });
      } else {
        await buttonInteraction.update({
          content: '❌ Failed to clear memories. Please try again later.',
          components: [],
        });
        warn('Failed to clear memories', { userId, username });
      }
    } else {
      await buttonInteraction.update({
        content: '↩️ Memory deletion cancelled.',
        components: [],
      });
    }
  } catch {
    // Timeout — no interaction received within 30 seconds
    await interaction.editReply({
      content: '⏰ Confirmation timed out. No memories were deleted.',
      components: [],
    });
  }
}

/**
 * Handle /memory forget <topic> — delete memories matching a topic
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {string} userId
 * @param {string} username
 * @param {string} topic
 */
async function handleForgetTopic(interaction, userId, username, topic) {
  await interaction.deferReply({ ephemeral: true });

  // Search for memories matching the topic (results include IDs)
  const { memories: matches } = await searchMemories(userId, topic, 10);

  if (matches.length === 0) {
    await interaction.editReply({
      content: `🔍 No memories found matching "${topic}".`,
    });
    return;
  }

  // Use memory IDs directly from search results and delete in parallel
  const matchesWithIds = matches.filter((m) => m.id);
  const results = await Promise.allSettled(matchesWithIds.map((m) => deleteMemory(m.id)));
  const deletedCount = results.filter((r) => r.status === 'fulfilled' && r.value === true).length;

  if (deletedCount > 0) {
    await interaction.editReply({
      content: `🧹 Forgot ${deletedCount} memor${deletedCount === 1 ? 'y' : 'ies'} related to "${topic}".`,
    });
    info('Topic memories cleared', { userId, username, topic, count: deletedCount });
  } else {
    await interaction.editReply({
      content: `❌ Found memories about "${topic}" but couldn't delete them. Please try again.`,
    });
  }
}

/**
 * Handle /memory admin commands
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {string} subcommand - 'view' or 'clear'
 */
async function handleAdmin(interaction, subcommand) {
  // Permission check
  const hasPermission =
    interaction.memberPermissions &&
    (interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild) ||
      interaction.memberPermissions.has(PermissionFlagsBits.Administrator));

  if (!hasPermission) {
    await interaction.reply({
      content:
        '❌ You need **Manage Server** or **Administrator** permission to use admin commands.',
      ephemeral: true,
    });
    return;
  }

  if (!isMemoryAvailable()) {
    await interaction.reply({
      content:
        '🧠 Memory system is currently unavailable. The bot still works, just without long-term memory.',
      ephemeral: true,
    });
    return;
  }

  const targetUser = interaction.options.getUser('user');
  const targetId = targetUser.id;
  const targetUsername = targetUser.username;

  if (subcommand === 'view') {
    await handleAdminView(interaction, targetId, targetUsername);
  } else if (subcommand === 'clear') {
    await handleAdminClear(interaction, targetId, targetUsername);
  }
}

/**
 * Handle /memory admin view @user — view a user's memories (mod only)
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {string} targetId
 * @param {string} targetUsername
 */
async function handleAdminView(interaction, targetId, targetUsername) {
  await interaction.deferReply({ ephemeral: true });

  const memories = await getMemories(targetId);
  const optedOutStatus = isOptedOut(targetId) ? ' *(opted out)*' : '';

  if (memories.length === 0) {
    await interaction.editReply({
      content: `🧠 No memories found for **${targetUsername}**${optedOutStatus}.`,
    });
    return;
  }

  const memoryList = memories.map((m, i) => `${i + 1}. ${m.memory}`).join('\n');
  const header = `🧠 **Memories for ${targetUsername}${optedOutStatus}:**\n\n`;
  const content = formatMemoryList(memoryList, header);

  await interaction.editReply({ content });

  info('Admin memory view', {
    adminId: interaction.user.id,
    targetId,
    targetUsername,
    count: memories.length,
  });
}

/**
 * Handle /memory admin clear @user — clear a user's memories with confirmation (mod only)
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {string} targetId
 * @param {string} targetUsername
 */
async function handleAdminClear(interaction, targetId, targetUsername) {
  const adminId = interaction.user.id;

  const confirmButton = new ButtonBuilder()
    .setCustomId('memory_admin_clear_confirm')
    .setLabel('Confirm')
    .setStyle(ButtonStyle.Danger);

  const cancelButton = new ButtonBuilder()
    .setCustomId('memory_admin_clear_cancel')
    .setLabel('Cancel')
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

  const response = await interaction.reply({
    content: `⚠️ **Are you sure?** This will delete **ALL** memories for **${targetUsername}** permanently. This cannot be undone.`,
    components: [row],
    ephemeral: true,
  });

  try {
    const buttonInteraction = await response.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: (i) => i.user.id === adminId,
      time: 30_000,
    });

    if (buttonInteraction.customId === 'memory_admin_clear_confirm') {
      const success = await deleteAllMemories(targetId);

      if (success) {
        await buttonInteraction.update({
          content: `🧹 Done! All memories for **${targetUsername}** have been cleared.`,
          components: [],
        });
        info('Admin cleared all memories', { adminId, targetId, targetUsername });
      } else {
        await buttonInteraction.update({
          content: `❌ Failed to clear memories for **${targetUsername}**. Please try again later.`,
          components: [],
        });
        warn('Admin failed to clear memories', { adminId, targetId, targetUsername });
      }
    } else {
      await buttonInteraction.update({
        content: '↩️ Memory deletion cancelled.',
        components: [],
      });
    }
  } catch {
    // Timeout — no interaction received within 30 seconds
    await interaction.editReply({
      content: '⏰ Confirmation timed out. No memories were deleted.',
      components: [],
    });
  }
}
