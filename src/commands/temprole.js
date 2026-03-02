/**
 * Temprole Command
 * Assign a role to a user that automatically expires after a set duration.
 *
 * Subcommands:
 *   assign  — Assign a temporary role
 *   revoke  — Remove a temporary role early
 *   list    — List active temp roles in the server (or for a specific user)
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/128
 */

import { EmbedBuilder, SlashCommandBuilder, time } from 'discord.js';
import { info, warn } from '../logger.js';
import { assignTempRole, listTempRoles, revokeTempRole } from '../modules/tempRoleHandler.js';
import { formatDuration, parseDuration } from '../utils/duration.js';
import { safeEditReply } from '../utils/safeSend.js';

export const data = new SlashCommandBuilder()
  .setName('temprole')
  .setDescription('Manage temporary role assignments')
  .addSubcommand((sub) =>
    sub
      .setName('assign')
      .setDescription('Assign a role that expires after a set duration')
      .addUserOption((opt) =>
        opt.setName('user').setDescription('Target user').setRequired(true),
      )
      .addRoleOption((opt) =>
        opt.setName('role').setDescription('Role to assign').setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName('duration')
          .setDescription('Duration (e.g. 1h, 7d, 2w)')
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName('reason').setDescription('Reason for assignment').setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('revoke')
      .setDescription('Remove a temporary role before it expires')
      .addUserOption((opt) =>
        opt.setName('user').setDescription('Target user').setRequired(true),
      )
      .addRoleOption((opt) =>
        opt.setName('role').setDescription('Role to revoke').setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('list')
      .setDescription('List active temporary role assignments')
      .addUserOption((opt) =>
        opt.setName('user').setDescription('Filter by user (optional)').setRequired(false),
      ),
  );

export const adminOnly = true;

/**
 * Execute the temprole command.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const sub = interaction.options.getSubcommand();

  if (sub === 'assign') {
    await handleAssign(interaction);
  } else if (sub === 'revoke') {
    await handleRevoke(interaction);
  } else if (sub === 'list') {
    await handleList(interaction);
  }
}

/**
 * Handle the assign subcommand.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function handleAssign(interaction) {
  try {
    const user = interaction.options.getUser('user');
    const role = interaction.options.getRole('role');
    const durationStr = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason');

    const durationMs = parseDuration(durationStr);
    if (!durationMs) {
      return await safeEditReply(
        interaction,
        '❌ Invalid duration format. Use e.g. `1h`, `7d`, `2w`.',
      );
    }

    // Fetch member
    let member;
    try {
      member = await interaction.guild.members.fetch(user.id);
    } catch {
      return await safeEditReply(
        interaction,
        '❌ That user is not in this server.',
      );
    }

    // Bot hierarchy check
    const botMember = interaction.guild.members.me;
    if (role.position >= botMember.roles.highest.position) {
      return await safeEditReply(
        interaction,
        '❌ I cannot assign that role — it is higher than or equal to my highest role.',
      );
    }

    // Moderator hierarchy check
    if (role.position >= interaction.member.roles.highest.position) {
      return await safeEditReply(
        interaction,
        '❌ You cannot assign a role equal to or higher than your own highest role.',
      );
    }

    // Assign the role in Discord
    await member.roles.add(role.id, reason || 'Temp role assigned via /temprole');

    const expiresAt = new Date(Date.now() + durationMs);
    const duration = formatDuration(durationMs);

    // Persist to DB
    await assignTempRole({
      guildId: interaction.guildId,
      userId: user.id,
      userTag: user.tag,
      roleId: role.id,
      roleName: role.name,
      moderatorId: interaction.user.id,
      moderatorTag: interaction.user.tag,
      duration,
      expiresAt,
      reason,
    });

    info('Temp role assigned via command', {
      guildId: interaction.guildId,
      userId: user.id,
      roleId: role.id,
      duration,
      moderator: interaction.user.tag,
    });

    await safeEditReply(
      interaction,
      `✅ **${user.tag}** has been given the **${role.name}** role for **${duration}**. It will be removed ${time(expiresAt, 'R')}.`,
    );
  } catch (err) {
    warn('Temprole assign failed', { error: err.message, guildId: interaction.guildId });
    await safeEditReply(
      interaction,
      '❌ An error occurred while assigning the role. Please try again.',
    );
  }
}

/**
 * Handle the revoke subcommand.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function handleRevoke(interaction) {
  try {
    const user = interaction.options.getUser('user');
    const role = interaction.options.getRole('role');

    // Find active temp role record
    const record = await revokeTempRole(interaction.guildId, user.id, role.id);
    if (!record) {
      return await safeEditReply(
        interaction,
        `❌ No active temporary role assignment found for **${user.tag}** with role **${role.name}**.`,
      );
    }

    // Remove from Discord (best-effort — member may have left)
    try {
      const member = await interaction.guild.members.fetch(user.id);
      await member.roles.remove(role.id, 'Temp role manually revoked via /temprole revoke');
    } catch {
      // Member left or role already removed — DB record is already marked removed
    }

    info('Temp role manually revoked', {
      guildId: interaction.guildId,
      userId: user.id,
      roleId: role.id,
      moderator: interaction.user.tag,
    });

    await safeEditReply(
      interaction,
      `✅ Temporary role **${role.name}** has been revoked from **${user.tag}**.`,
    );
  } catch (err) {
    warn('Temprole revoke failed', { error: err.message, guildId: interaction.guildId });
    await safeEditReply(
      interaction,
      '❌ An error occurred while revoking the role. Please try again.',
    );
  }
}

/**
 * Handle the list subcommand.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function handleList(interaction) {
  try {
    const user = interaction.options.getUser('user');

    const { rows, total } = await listTempRoles(interaction.guildId, {
      userId: user?.id,
      limit: 10,
    });

    if (rows.length === 0) {
      const suffix = user ? ` for **${user.tag}**` : '';
      return await safeEditReply(
        interaction,
        `📋 No active temporary role assignments${suffix}.`,
      );
    }

    const embed = new EmbedBuilder()
      .setTitle('Active Temporary Roles')
      .setColor(0x5865f2)
      .setDescription(
        rows
          .map(
            (r) =>
              `<@${r.user_id}> → <@&${r.role_id}> — expires ${time(new Date(r.expires_at), 'R')}` +
              (r.reason ? `\n  *Reason: ${r.reason}*` : ''),
          )
          .join('\n'),
      )
      .setFooter({ text: `Showing ${rows.length} of ${total} active assignments` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    warn('Temprole list failed', { error: err.message, guildId: interaction.guildId });
    await safeEditReply(
      interaction,
      '❌ An error occurred while fetching the list. Please try again.',
    );
  }
}
