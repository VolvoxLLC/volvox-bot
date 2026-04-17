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
  checkAndRecoverMemory,
  deleteAllMemories,
  deleteMemory,
  getMemories,
  searchMemories,
} from '../modules/memory.js';
import { isOptedOut, toggleOptOut } from '../modules/optout.js';
import { safeEditReply, safeReply, safeUpdate } from '../utils/safeSend.js';
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
  const guildId = interaction.guildId;

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

  if (!checkAndRecoverMemory(guildId)) {
    await safeReply(interaction, {
      content:
        '🧠 Memory system is currently unavailable. The bot still works, just without long-term memory.',
      ephemeral: true,
    });
    return;
  }

  if (subcommand === 'view') {
    await handleView(interaction, userId, username, guildId);
  } else if (subcommand === 'forget') {
    const topic = interaction.options.getString('topic');
    if (topic) {
      await handleForgetTopic(interaction, userId, username, topic, guildId);
    } else {
      await handleForgetAll(interaction, userId, username, guildId);
    }
  }
}

/**
 * Toggle whether the bot collects memories for a user and notify them with an ephemeral reply.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction - The command interaction used for replying and context.
 * @param {string} userId - The ID of the user whose opt-out state will be toggled.
 */
async function handleOptOut(interaction, userId) {
  const { optedOut } = await toggleOptOut(userId);

  if (optedOut) {
    await safeReply(interaction, {
      content:
        '🚫 You have **opted out** of memory collection. The bot will no longer remember things about you. Your existing memories are unchanged — use `/memory forget` to delete them.',
      ephemeral: true,
    });
  } else {
    await safeReply(interaction, {
      content:
        '✅ You have **opted back in** to memory collection. The bot will start remembering things about you again.',
      ephemeral: true,
    });
  }

  info('Memory opt-out toggled', {
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    userId,
    optedOut,
  });
}

/**
 * Display the stored memories for a user by deferring an ephemeral reply and then editing it with either a message indicating no memories or a formatted, possibly truncated list.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction - The command interaction to reply to.
 * @param {string} userId - ID of the user whose memories to retrieve.
 * @param {string} username - Display name used in the reply header.
 * @param {string} [guildId] - Optional guild ID to scope memory retrieval.
 */
async function handleView(interaction, userId, username, guildId) {
  await interaction.deferReply({ ephemeral: true });

  const memories = await getMemories(userId, guildId);

  if (memories.length === 0) {
    await safeEditReply(interaction, {
      content:
        "🧠 I don't have any memories about you yet. Chat with me and I'll start remembering!",
    });
    return;
  }

  const memoryList = memories.map((m, i) => `${i + 1}. ${m.memory}`).join('\n');
  const header = `🧠 **What I remember about ${username}:**\n\n`;
  const content = formatMemoryList(memoryList, header);

  await safeEditReply(interaction, { content });

  info('Memory view command', {
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    userId,
    username,
    count: memories.length,
  });
}

/**
 * Prompt the invoking user to confirm deletion and, if confirmed, delete all memories belonging to that user.
 *
 * Sends an ephemeral confirmation message with Confirm/Cancel buttons, waits up to 30 seconds for the same user to respond,
 * performs the deletion when confirmed, updates the reply with the outcome, and edits the reply to indicate timeout if no response is received.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction - The original command interaction used to send and update replies.
 * @param {string} userId - ID of the user whose memories will be deleted if confirmed.
 * @param {string} username - Display name of the user (used in logs/messages).
 * @param {string} [guildId] - Optional guild ID to scope the deletion to a specific guild.
 */
async function handleForgetAll(interaction, userId, username, guildId) {
  const confirmButton = new ButtonBuilder()
    .setCustomId('memory_forget_confirm')
    .setLabel('Confirm')
    .setStyle(ButtonStyle.Danger);

  const cancelButton = new ButtonBuilder()
    .setCustomId('memory_forget_cancel')
    .setLabel('Cancel')
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

  const response = await safeReply(interaction, {
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
      const success = await deleteAllMemories(userId, guildId);

      if (success) {
        await safeUpdate(buttonInteraction, {
          content: '🧹 Done! All your memories have been cleared. Fresh start!',
          components: [],
        });
        info('All memories cleared', {
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          userId,
          username,
        });
      } else {
        await safeUpdate(buttonInteraction, {
          content: '❌ Failed to clear memories. Please try again later.',
          components: [],
        });
        warn('Failed to clear memories', {
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          userId,
          username,
        });
      }
    } else {
      await safeUpdate(buttonInteraction, {
        content: '↩️ Memory deletion cancelled.',
        components: [],
      });
    }
  } catch {
    // Timeout — no interaction received within 30 seconds
    await safeEditReply(interaction, {
      content: '⏰ Confirmation timed out. No memories were deleted.',
      components: [],
    });
  }
}

/**
 * Delete a user's stored memories that match a given topic and reply with the outcome.
 *
 * Performs deletions in batches until no more matches are found or limits are reached, then informs the command issuer how many memories were forgotten or if none were found.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction - The interaction that invoked the command.
 * @param {string} userId - ID of the user whose memories will be searched.
 * @param {string} username - Display name of the user (used in logging).
 * @param {string} topic - Topic string to match against stored memories.
 * @param {string} [guildId] - Optional guild ID to scope the search/delete operations.
 */
async function handleForgetTopic(interaction, userId, username, topic, guildId) {
  await interaction.deferReply({ ephemeral: true });

  const BATCH_SIZE = 100;
  const MAX_ITERATIONS = 10;
  let totalDeleted = 0;
  let totalFound = 0;
  let iterations = 0;

  // Loop to delete all matching memories (not just the first batch)
  while (iterations < MAX_ITERATIONS) {
    iterations++;
    const { memories: matches } = await searchMemories(userId, topic, BATCH_SIZE, guildId);

    if (matches.length === 0) break;
    totalFound += matches.length;

    const matchesWithIds = matches.filter(
      (m) => m.id !== undefined && m.id !== null && m.id !== '',
    );

    if (matchesWithIds.length === 0) break;

    const results = await Promise.allSettled(
      matchesWithIds.map((m) => deleteMemory(m.id, guildId)),
    );
    const batchDeleted = results.filter((r) => r.status === 'fulfilled' && r.value === true).length;
    totalDeleted += batchDeleted;

    // If we got fewer results than the batch size, we've reached the end
    if (matches.length < BATCH_SIZE) break;
    // If nothing was deleted this round, stop to avoid infinite loop
    if (batchDeleted === 0) break;
  }

  if (totalDeleted > 0) {
    await safeEditReply(interaction, {
      content: `🧹 Forgot ${totalDeleted} memor${totalDeleted === 1 ? 'y' : 'ies'} related to "${topic}".`,
    });
    info('Topic memories cleared', {
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId,
      username,
      topic,
      count: totalDeleted,
    });
  } else if (totalFound === 0) {
    await safeEditReply(interaction, {
      content: `🔍 No memories found matching "${topic}".`,
    });
  } else {
    await safeEditReply(interaction, {
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
    await safeReply(interaction, {
      content:
        '❌ You need **Manage Server** or **Administrator** permission to use admin commands.',
      ephemeral: true,
    });
    return;
  }

  const guildId = interaction.guildId;

  if (!checkAndRecoverMemory(guildId)) {
    await safeReply(interaction, {
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
    await handleAdminView(interaction, targetId, targetUsername, guildId);
  } else if (subcommand === 'clear') {
    await handleAdminClear(interaction, targetId, targetUsername, guildId);
  }
}

/**
 * Display a target user's stored memories to an administrator in an ephemeral reply.
 *
 * Retrieves the target's memories (if any), includes an "(opted out)" marker when applicable,
 * formats the results for Discord message length limits, edits the deferred ephemeral reply with
 * the formatted content, and emits an informational log event containing Discord context.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction - The command interaction from the admin.
 * @param {string} targetId - The Discord ID of the user whose memories are being viewed.
 * @param {string} targetUsername - The display name used in the reply header for the target user.
 * @param {string} [guildId] - Optional guild ID to scope memory retrieval; when omitted, global or default storage is used.
 */
async function handleAdminView(interaction, targetId, targetUsername, guildId) {
  await interaction.deferReply({ ephemeral: true });

  const memories = await getMemories(targetId, guildId);
  const optedOutStatus = isOptedOut(targetId) ? ' *(opted out)*' : '';

  if (memories.length === 0) {
    await safeEditReply(interaction, {
      content: `🧠 No memories found for **${targetUsername}**${optedOutStatus}.`,
    });
    return;
  }

  const memoryList = memories.map((m, i) => `${i + 1}. ${m.memory}`).join('\n');
  const header = `🧠 **Memories for ${targetUsername}${optedOutStatus}:**\n\n`;
  const content = formatMemoryList(memoryList, header);

  await safeEditReply(interaction, { content });

  info('Admin memory view', {
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    adminId: interaction.user.id,
    targetId,
    targetUsername,
    count: memories.length,
  });
}

/**
 * Prompt an administrator to confirm and then clear all stored memories for a target user.
 *
 * Sends an ephemeral confirmation message with Confirm/Cancel buttons, waits up to 30 seconds
 * for the invoking admin's response, deletes the target user's memories if confirmed,
 * updates the interaction to reflect the result, and emits structured log events.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction - The command interaction from the admin.
 * @param {string} targetId - The Discord user ID whose memories will be cleared.
 * @param {string} targetUsername - The display name of the target user (used in replies).
 * @param {string} [guildId] - Optional guild ID scope for memory deletion.
 */
async function handleAdminClear(interaction, targetId, targetUsername, guildId) {
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

  const response = await safeReply(interaction, {
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
      const success = await deleteAllMemories(targetId, guildId);

      if (success) {
        await safeUpdate(buttonInteraction, {
          content: `🧹 Done! All memories for **${targetUsername}** have been cleared.`,
          components: [],
        });
        info('Admin cleared all memories', {
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          adminId,
          targetId,
          targetUsername,
        });
      } else {
        await safeUpdate(buttonInteraction, {
          content: `❌ Failed to clear memories for **${targetUsername}**. Please try again later.`,
          components: [],
        });
        warn('Admin failed to clear memories', {
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          adminId,
          targetId,
          targetUsername,
        });
      }
    } else {
      await safeUpdate(buttonInteraction, {
        content: '↩️ Memory deletion cancelled.',
        components: [],
      });
    }
  } catch {
    // Timeout — no interaction received within 30 seconds
    await safeEditReply(interaction, {
      content: '⏰ Confirmation timed out. No memories were deleted.',
      components: [],
    });
  }
}
