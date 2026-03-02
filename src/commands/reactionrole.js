/**
 * Reaction Role Command
 *
 * Slash command for managing reaction-role menus.
 * Requires Manage Roles permission.
 *
 * Subcommands:
 *   /reactionrole create  – Post a new reaction-role menu message
 *   /reactionrole add     – Add an emoji→role mapping to a menu
 *   /reactionrole remove  – Remove an emoji mapping from a menu
 *   /reactionrole delete  – Delete an entire reaction-role menu
 *   /reactionrole list    – List all reaction-role menus in this server
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/162
 */

import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getPool } from '../db.js';
import { warn } from '../logger.js';
import {
  buildReactionRoleEmbed,
  deleteMenu,
  findMenuByMessageId,
  getEntriesForMenu,
  insertReactionRoleMenu,
  listMenusForGuild,
  removeReactionRoleEntry,
  resolveEmojiString,
  upsertReactionRoleEntry,
} from '../modules/reactionRoles.js';
import { safeEditReply } from '../utils/safeSend.js';

export const data = new SlashCommandBuilder()
  .setName('reactionrole')
  .setDescription('Manage reaction-role menus')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  // ── create ──────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('create')
      .setDescription('Post a new reaction-role menu in a channel')
      .addStringOption((opt) =>
        opt.setName('title').setDescription('Menu title').setRequired(true),
      )
      .addChannelOption((opt) =>
        opt
          .setName('channel')
          .setDescription('Channel to post the menu in (defaults to current channel)')
          .setRequired(false),
      )
      .addStringOption((opt) =>
        opt
          .setName('description')
          .setDescription('Optional description shown above the role list')
          .setRequired(false),
      ),
  )
  // ── add ─────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('Add an emoji→role mapping to an existing menu')
      .addStringOption((opt) =>
        opt
          .setName('message_id')
          .setDescription('ID of the reaction-role menu message')
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName('emoji').setDescription('Emoji to react with').setRequired(true),
      )
      .addRoleOption((opt) =>
        opt.setName('role').setDescription('Role to grant when the emoji is used').setRequired(true),
      ),
  )
  // ── remove ──────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('Remove an emoji mapping from a menu')
      .addStringOption((opt) =>
        opt
          .setName('message_id')
          .setDescription('ID of the reaction-role menu message')
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName('emoji').setDescription('Emoji mapping to remove').setRequired(true),
      ),
  )
  // ── delete ──────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('delete')
      .setDescription('Delete an entire reaction-role menu (and optionally its Discord message)')
      .addStringOption((opt) =>
        opt
          .setName('message_id')
          .setDescription('ID of the reaction-role menu message')
          .setRequired(true),
      ),
  )
  // ── list ────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub.setName('list').setDescription('List all reaction-role menus in this server'),
  );

/**
 * Execute /reactionrole
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const pool = getPool();
  if (!pool) {
    await safeEditReply(interaction, { content: '❌ Database is not available.' });
    return;
  }

  const sub = interaction.options.getSubcommand();

  if (sub === 'create') return handleCreate(interaction);
  if (sub === 'add') return handleAdd(interaction);
  if (sub === 'remove') return handleRemove(interaction);
  if (sub === 'delete') return handleDelete(interaction);
  if (sub === 'list') return handleList(interaction);
}

// ── Subcommand handlers ───────────────────────────────────────────────────────

/**
 * /reactionrole create
 */
async function handleCreate(interaction) {
  const title = interaction.options.getString('title');
  const description = interaction.options.getString('description');
  const targetChannel =
    interaction.options.getChannel('channel') ?? interaction.channel;

  if (!targetChannel?.isTextBased?.()) {
    await safeEditReply(interaction, { content: '❌ Target channel must be a text channel.' });
    return;
  }

  // Post the embed
  const embed = buildReactionRoleEmbed(title, description, []);
  let postedMessage;
  try {
    postedMessage = await targetChannel.send({ embeds: [embed] });
  } catch (err) {
    warn('reactionrole create: could not send message', { error: err?.message });
    await safeEditReply(interaction, {
      content: `❌ Failed to post the menu in <#${targetChannel.id}>. Make sure I have Send Messages permission there.`,
    });
    return;
  }

  // Persist to DB
  await insertReactionRoleMenu(
    interaction.guildId,
    targetChannel.id,
    postedMessage.id,
    title,
    description,
  );

  await safeEditReply(interaction, {
    content:
      `✅ Reaction-role menu created in <#${targetChannel.id}>!\n` +
      `Use \`/reactionrole add\` with message ID \`${postedMessage.id}\` to add emoji→role mappings.`,
  });
}

/**
 * /reactionrole add
 */
async function handleAdd(interaction) {
  const messageId = interaction.options.getString('message_id').trim();
  const emojiInput = interaction.options.getString('emoji').trim();
  const role = interaction.options.getRole('role');

  // Validate the menu exists
  const menu = await findMenuByMessageId(messageId);
  if (!menu) {
    await safeEditReply(interaction, {
      content: `❌ No reaction-role menu found with message ID \`${messageId}\`. Did you use the right ID?`,
    });
    return;
  }

  // Guard: guild ownership
  if (menu.guild_id !== interaction.guildId) {
    await safeEditReply(interaction, { content: '❌ That menu does not belong to this server.' });
    return;
  }

  // Guard: bot must be able to assign the role
  const botMember = await interaction.guild.members.fetchMe().catch(() => null);
  if (botMember && role.position >= botMember.roles.highest.position) {
    await safeEditReply(interaction, {
      content: `❌ I can't assign **${role.name}** — it's higher than (or equal to) my highest role. Move my role above it first.`,
    });
    return;
  }

  // Normalise emoji to a stable string
  const emojiKey = normaliseInputEmoji(emojiInput);

  await upsertReactionRoleEntry(menu.id, emojiKey, role.id);

  // Refresh the menu embed with updated entries
  await refreshMenuEmbed(interaction, menu);

  // Add the reaction to the original message so users know which emojis to click
  try {
    const channel = await interaction.guild.channels.fetch(menu.channel_id);
    if (channel?.isTextBased()) {
      const msg = await channel.messages.fetch(messageId);
      await msg.react(emojiKey);
    }
  } catch {
    // Non-fatal — the mapping still works even without the bot's own reaction
  }

  await safeEditReply(interaction, {
    content: `✅ Added: ${emojiKey} → <@&${role.id}>`,
  });
}

/**
 * /reactionrole remove
 */
async function handleRemove(interaction) {
  const messageId = interaction.options.getString('message_id').trim();
  const emojiInput = interaction.options.getString('emoji').trim();

  const menu = await findMenuByMessageId(messageId);
  if (!menu) {
    await safeEditReply(interaction, {
      content: `❌ No reaction-role menu found with message ID \`${messageId}\`.`,
    });
    return;
  }

  if (menu.guild_id !== interaction.guildId) {
    await safeEditReply(interaction, { content: '❌ That menu does not belong to this server.' });
    return;
  }

  const emojiKey = normaliseInputEmoji(emojiInput);
  const removed = await removeReactionRoleEntry(menu.id, emojiKey);

  if (!removed) {
    await safeEditReply(interaction, {
      content: `❌ No mapping found for emoji \`${emojiKey}\` on that menu.`,
    });
    return;
  }

  // Refresh embed and remove bot's own reaction
  await refreshMenuEmbed(interaction, menu);
  try {
    const channel = await interaction.guild.channels.fetch(menu.channel_id);
    if (channel?.isTextBased()) {
      const msg = await channel.messages.fetch(messageId);
      const existing = msg.reactions.cache.get(emojiKey);
      if (existing) await existing.remove();
    }
  } catch {
    // Non-fatal
  }

  await safeEditReply(interaction, {
    content: `✅ Removed emoji mapping \`${emojiKey}\` from the menu.`,
  });
}

/**
 * /reactionrole delete
 */
async function handleDelete(interaction) {
  const messageId = interaction.options.getString('message_id').trim();

  const menu = await findMenuByMessageId(messageId);
  if (!menu) {
    await safeEditReply(interaction, {
      content: `❌ No reaction-role menu found with message ID \`${messageId}\`.`,
    });
    return;
  }

  if (menu.guild_id !== interaction.guildId) {
    await safeEditReply(interaction, { content: '❌ That menu does not belong to this server.' });
    return;
  }

  // Attempt to delete the Discord message
  try {
    const channel = await interaction.guild.channels.fetch(menu.channel_id);
    if (channel?.isTextBased()) {
      const msg = await channel.messages.fetch(messageId).catch(() => null);
      if (msg) await msg.delete();
    }
  } catch {
    // Non-fatal — DB cleanup happens regardless
  }

  await deleteMenu(menu.id);

  await safeEditReply(interaction, {
    content: `✅ Reaction-role menu deleted (message ID \`${messageId}\`).`,
  });
}

/**
 * /reactionrole list
 */
async function handleList(interaction) {
  const menus = await listMenusForGuild(interaction.guildId);

  if (menus.length === 0) {
    await safeEditReply(interaction, {
      content: 'No reaction-role menus found. Use `/reactionrole create` to make one.',
    });
    return;
  }

  const lines = menus.map(
    (m) => `• **${m.title}** — <#${m.channel_id}> — \`${m.message_id}\``,
  );
  await safeEditReply(interaction, {
    content: `**Reaction-role menus (${menus.length}):**\n${lines.join('\n')}`,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Re-fetch entries and edit the menu embed in Discord to reflect current state.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {Object} menu - Menu DB row
 */
async function refreshMenuEmbed(interaction, menu) {
  try {
    const entries = await getEntriesForMenu(menu.id);
    const embed = buildReactionRoleEmbed(menu.title, menu.description, entries);

    const channel = await interaction.guild.channels.fetch(menu.channel_id);
    if (!channel?.isTextBased()) return;

    const msg = await channel.messages.fetch(menu.message_id).catch(() => null);
    if (!msg) return;

    await msg.edit({ embeds: [embed] });
  } catch {
    // Non-fatal — UI update is cosmetic
  }
}

/**
 * Normalise a user-supplied emoji string.
 * Strips surrounding colons (`:thumbsup:` → emoji literal won't match, but we keep it as-is
 * since Discord custom emojis come in as `<:name:id>` format).
 *
 * @param {string} input
 * @returns {string}
 */
function normaliseInputEmoji(input) {
  return input.trim();
}
