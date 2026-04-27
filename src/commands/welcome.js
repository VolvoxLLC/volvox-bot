import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { info } from '../logger.js';
import { getConfig } from '../modules/config.js';
import { publishWelcomePanels } from '../modules/welcomePublishing.js';
import { isModerator } from '../utils/permissions.js';
import { safeEditReply } from '../utils/safeSend.js';

export const adminOnly = true;

export const data = new SlashCommandBuilder()
  .setName('welcome')
  .setDescription('Welcome/onboarding admin helpers')
  .addSubcommand((sub) =>
    sub.setName('setup').setDescription('Publish or refresh rules and role menu onboarding panels'),
  );

function formatPublishLine(result) {
  const label = result.panelType === 'rules' ? 'Rules agreement panel' : 'Role menu panel';
  if (result.status === 'posted') {
    const action = result.action === 'updated' ? 'Updated' : 'Posted';
    return `${action} ${label.toLowerCase()} in <#${result.channelId}>.`;
  }
  if (result.status === 'unconfigured') {
    return `${label} is not configured.`;
  }
  return `${label} failed: ${result.lastError || 'unknown error'}.`;
}

/**
 * Handles `/welcome setup` by delegating to the shared welcome publisher used by the dashboard.
 *
 * @param {import('discord.js').CommandInteraction} interaction
 */
export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const guildConfig = getConfig(interaction.guildId);
  if (
    !interaction.member.permissions.has(PermissionFlagsBits.Administrator) &&
    !isModerator(interaction.member, guildConfig)
  ) {
    await safeEditReply(interaction, {
      content: 'You need moderator or administrator permissions to run this command.',
    });
    return;
  }

  const publishResult = await publishWelcomePanels(interaction.client, interaction.guildId, {
    source: 'slash-command',
    userId: interaction.user.id,
  });

  await safeEditReply(interaction, {
    content: publishResult.results.map(formatPublishLine).join('\n'),
  });

  info('Welcome setup command executed', {
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    userId: interaction.user.id,
  });
}
