/**
 * Status Command - Display bot health metrics
 *
 * Shows uptime, memory usage, API status, and last AI request
 * Admin mode (detailed: true) shows additional diagnostics
 */

import { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { error as logError } from '../logger.js';
import { HealthMonitor } from '../utils/health.js';

export const data = new SlashCommandBuilder()
  .setName('status')
  .setDescription('Display bot health metrics and status')
  .addBooleanOption((option) =>
    option
      .setName('detailed')
      .setDescription('Show detailed diagnostics (admin only)')
      .setRequired(false),
  );

/**
 * Format timestamp as relative time
 */
function formatRelativeTime(timestamp) {
  if (!timestamp) return 'Never';

  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (diff < 1000) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

/**
 * Get status emoji based on API status
 */
function getStatusEmoji(status) {
  switch (status) {
    case 'ok':
      return '🟢';
    case 'error':
      return '🔴';
    case 'unknown':
      return '🟡';
    default:
      return '⚪';
  }
}

/**
 * Execute the status command
 */
export async function execute(interaction) {
  try {
    const detailed = interaction.options.getBoolean('detailed') || false;
    const healthMonitor = HealthMonitor.getInstance();

    if (detailed) {
      // Check if user has admin permissions
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({
          content: '❌ Detailed diagnostics are only available to administrators.',
          ephemeral: true,
        });
        return;
      }

      // Detailed mode - admin diagnostics
      const status = healthMonitor.getDetailedStatus();

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('🔍 Bot Status - Detailed Diagnostics')
        .addFields(
          { name: '⏱️ Uptime', value: status.uptimeFormatted, inline: true },
          { name: '🧠 Memory', value: status.memory.formatted, inline: true },
          {
            name: '🌐 API',
            value: `${getStatusEmoji(status.api.status)} ${status.api.status}`,
            inline: true,
          },
          {
            name: '🤖 Last AI Request',
            value: formatRelativeTime(status.lastAIRequest),
            inline: true,
          },
          { name: '📊 Process ID', value: `${status.process.pid}`, inline: true },
          { name: '🖥️ Platform', value: status.process.platform, inline: true },
          { name: '📦 Node Version', value: status.process.nodeVersion, inline: true },
          {
            name: '⚙️ Process Uptime',
            value: `${Math.floor(status.process.uptime)}s`,
            inline: true,
          },
          { name: '🔢 Heap Used', value: `${status.memory.heapUsed}MB`, inline: true },
          { name: '💾 RSS', value: `${status.memory.rss}MB`, inline: true },
          { name: '📡 External', value: `${status.memory.external}MB`, inline: true },
          { name: '🔢 Array Buffers', value: `${status.memory.arrayBuffers}MB`, inline: true },
        )
        .setTimestamp()
        .setFooter({ text: 'Detailed diagnostics mode' });

      await interaction.reply({ embeds: [embed], ephemeral: true });
    } else {
      // Basic mode - user-friendly status
      const status = healthMonitor.getStatus();

      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('📊 Bot Status')
        .setDescription('Current health and performance metrics')
        .addFields(
          { name: '⏱️ Uptime', value: status.uptimeFormatted, inline: true },
          { name: '🧠 Memory', value: status.memory.formatted, inline: true },
          {
            name: '🌐 API Status',
            value: `${getStatusEmoji(status.api.status)} ${status.api.status.toUpperCase()}`,
            inline: true,
          },
          {
            name: '🤖 Last AI Request',
            value: formatRelativeTime(status.lastAIRequest),
            inline: false,
          },
        )
        .setTimestamp()
        .setFooter({ text: 'Use /status detailed:true for more info' });

      await interaction.reply({ embeds: [embed] });
    }
  } catch (err) {
    logError('Status command error', { error: err.message });

    const reply = {
      content: "Sorry, I couldn't retrieve the status. Try again in a moment!",
      ephemeral: true,
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
}
