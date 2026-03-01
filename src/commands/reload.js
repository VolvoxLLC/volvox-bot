/**
 * Reload Command
 * Reloads bot config, commands, triage, and opt-outs without a full restart.
 * Restricted to bot owners.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { info, error as logError } from '../logger.js';
import { getConfig, loadConfig } from '../modules/config.js';
import { loadOptOuts } from '../modules/optout.js';
import { startTriage, stopTriage } from '../modules/triage.js';
import { HealthMonitor } from '../utils/health.js';
import { loadCommandsFromDirectory } from '../utils/loadCommands.js';
import { isBotOwner } from '../utils/permissions.js';
import { registerCommands } from '../utils/registerCommands.js';
import { safeEditReply, safeReply } from '../utils/safeSend.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const data = new SlashCommandBuilder()
  .setName('reload')
  .setDescription('Reload bot config, commands, and services (Bot owner only)');

export const adminOnly = true;

/**
 * Execute the reload command.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  const config = getConfig(interaction.guildId);

  // Bot owner gate — stricter than adminOnly
  if (!isBotOwner(interaction.member, config)) {
    return await safeReply(interaction, {
      content: '❌ This command is restricted to bot owners.',
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  const startTime = Date.now();
  const results = [];

  // Step 1: Reload config from database
  try {
    await loadConfig();
    results.push({ name: 'Config', success: true });
    info('Reload: config reloaded', { userId: interaction.user.id });
  } catch (err) {
    results.push({ name: 'Config', success: false, error: err.message });
    logError('Reload: config reload failed', { error: err.message });
  }

  // Step 2: Reload commands
  try {
    interaction.client.commands.clear();
    await loadCommandsFromDirectory({
      commandsPath: __dirname,
      onCommandLoaded: (command) => {
        interaction.client.commands.set(command.data.name, command);
      },
      logLoaded: false,
    });
    results.push({ name: 'Commands', success: true, detail: `${interaction.client.commands.size} loaded` });
    info('Reload: commands reloaded', { count: interaction.client.commands.size, userId: interaction.user.id });
  } catch (err) {
    results.push({ name: 'Commands', success: false, error: err.message });
    logError('Reload: command reload failed', { error: err.message });
  }

  // Step 3: Re-register slash commands with Discord
  try {
    const commands = Array.from(interaction.client.commands.values());
    const guildId = process.env.GUILD_ID || null;
    await registerCommands(commands, interaction.client.user.id, process.env.DISCORD_TOKEN, guildId);
    results.push({ name: 'Register', success: true });
    info('Reload: commands registered with Discord', { userId: interaction.user.id });
  } catch (err) {
    results.push({ name: 'Register', success: false, error: err.message });
    logError('Reload: command registration failed', { error: err.message });
  }

  // Step 4: Restart triage
  try {
    stopTriage();
    const freshConfig = getConfig();
    const healthMonitor = HealthMonitor.getInstance();
    await startTriage(interaction.client, freshConfig, healthMonitor);
    results.push({ name: 'Triage', success: true });
    info('Reload: triage restarted', { userId: interaction.user.id });
  } catch (err) {
    results.push({ name: 'Triage', success: false, error: err.message });
    logError('Reload: triage restart failed', { error: err.message });
  }

  // Step 5: Reload opt-outs
  try {
    await loadOptOuts();
    results.push({ name: 'Opt-outs', success: true });
    info('Reload: opt-outs reloaded', { userId: interaction.user.id });
  } catch (err) {
    results.push({ name: 'Opt-outs', success: false, error: err.message });
    logError('Reload: opt-out reload failed', { error: err.message });
  }

  // Build result embed
  const allSuccess = results.every((r) => r.success);
  const elapsed = Date.now() - startTime;

  const description = results
    .map((r) => {
      const icon = r.success ? '✅' : '❌';
      const detail = r.detail ? ` (${r.detail})` : '';
      const errMsg = r.error ? ` — ${r.error}` : '';
      return `${icon} **${r.name}**${detail}${errMsg}`;
    })
    .join('\n');

  const embed = new EmbedBuilder()
    .setTitle('🔄 Bot Reload')
    .setColor(allSuccess ? 0x57f287 : 0xfee75c)
    .setDescription(description)
    .setFooter({ text: `Completed in ${elapsed}ms` })
    .setTimestamp();

  await safeEditReply(interaction, { embeds: [embed] });
}
