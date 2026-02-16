/**
 * Memory Command
 * Allows users to view and manage what the bot remembers about them.
 *
 * Subcommands:
 *   /memory view   — Show all memories the bot has about you
 *   /memory forget — Clear all your memories
 *   /memory forget <topic> — Clear memories matching a topic
 */

import { SlashCommandBuilder } from 'discord.js';
import { info, warn } from '../logger.js';
import {
  deleteAllMemories,
  deleteMemory,
  getMemories,
  isMemoryAvailable,
  searchMemories,
} from '../modules/memory.js';

export const data = new SlashCommandBuilder()
  .setName('memory')
  .setDescription('Manage what the bot remembers about you')
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
  );

/**
 * Execute the /memory command
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const userId = interaction.user.id;
  const username = interaction.user.username;

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

  // Truncate for Discord's 2000 char limit
  const header = `🧠 **What I remember about ${username}:**\n\n`;
  const maxContent = 2000 - header.length - 50; // padding
  const truncated =
    memoryList.length > maxContent
      ? `${memoryList.substring(0, maxContent)}...\n\n*(...and more)*`
      : memoryList;

  await interaction.editReply({
    content: `${header}${truncated}`,
  });

  info('Memory view command', { userId, username, count: memories.length });
}

/**
 * Handle /memory forget (all) — delete all memories for the user
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {string} userId
 * @param {string} username
 */
async function handleForgetAll(interaction, userId, username) {
  await interaction.deferReply({ ephemeral: true });

  const success = await deleteAllMemories(userId);

  if (success) {
    await interaction.editReply({
      content: '🧹 Done! All your memories have been cleared. Fresh start!',
    });
    info('All memories cleared', { userId, username });
  } else {
    await interaction.editReply({
      content: '❌ Failed to clear memories. Please try again later.',
    });
    warn('Failed to clear memories', { userId, username });
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

  // Search for memories matching the topic
  const { memories: matches } = await searchMemories(userId, topic, 10);

  if (matches.length === 0) {
    await interaction.editReply({
      content: `🔍 No memories found matching "${topic}".`,
    });
    return;
  }

  // Get full memories with IDs so we can delete them
  const allMemories = await getMemories(userId);

  // Find memories whose text matches the search results
  let deletedCount = 0;
  for (const match of matches) {
    const found = allMemories.find((m) => m.memory === match.memory && m.id);
    if (found) {
      const deleted = await deleteMemory(found.id);
      if (deleted) deletedCount++;
    }
  }

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
