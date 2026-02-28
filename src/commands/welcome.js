import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { info } from '../logger.js';
import { getConfig } from '../modules/config.js';
import {
  buildRoleMenuMessage,
  buildRulesAgreementMessage,
  normalizeWelcomeOnboardingConfig,
} from '../modules/welcomeOnboarding.js';
import { isModerator } from '../utils/permissions.js';
import { safeEditReply, safeSend } from '../utils/safeSend.js';

export const adminOnly = true;

export const data = new SlashCommandBuilder()
  .setName('welcome')
  .setDescription('Welcome/onboarding admin helpers')
  .addSubcommand((sub) =>
    sub.setName('setup').setDescription('Post rules agreement and role menu onboarding panels'),
  );

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const guildConfig = getConfig(interaction.guildId);
  if (
    !interaction.member.permissions.has(PermissionFlagsBits.Administrator) &&
    !isModerator(interaction.member, guildConfig)
  ) {
    await safeEditReply(interaction, {
      content: '❌ You need moderator or administrator permissions to run this command.',
    });
    return;
  }

  const onboarding = normalizeWelcomeOnboardingConfig(guildConfig?.welcome);
  const resultLines = [];

  if (onboarding.rulesChannel) {
    const rulesChannel =
      interaction.guild.channels.cache.get(onboarding.rulesChannel) ||
      (await interaction.guild.channels.fetch(onboarding.rulesChannel).catch(() => null));

    if (rulesChannel?.isTextBased?.()) {
      const rulesMsg = buildRulesAgreementMessage();
      await safeSend(rulesChannel, rulesMsg);
      resultLines.push(`✅ Posted rules agreement panel in <#${rulesChannel.id}>.`);
    } else {
      resultLines.push('⚠️ Could not find `welcome.rulesChannel`; rules panel not posted.');
    }
  } else {
    resultLines.push('⚠️ `welcome.rulesChannel` is not configured.');
  }

  const roleMenuMsg = buildRoleMenuMessage(guildConfig?.welcome);
  if (roleMenuMsg && guildConfig?.welcome?.channelId) {
    const welcomeChannel =
      interaction.guild.channels.cache.get(guildConfig.welcome.channelId) ||
      (await interaction.guild.channels.fetch(guildConfig.welcome.channelId).catch(() => null));

    if (welcomeChannel?.isTextBased?.()) {
      await safeSend(welcomeChannel, roleMenuMsg);
      resultLines.push(`✅ Posted role menu in <#${welcomeChannel.id}>.`);
    } else {
      resultLines.push('⚠️ Could not find `welcome.channelId`; role menu not posted.');
    }
  } else if (roleMenuMsg) {
    resultLines.push('⚠️ `welcome.channelId` is not configured; role menu not posted.');
  } else {
    resultLines.push('⚠️ `welcome.roleMenu` is disabled or has no valid options.');
  }

  await safeEditReply(interaction, {
    content: resultLines.join('\n'),
  });

  info('Welcome setup command executed', {
    guildId: interaction.guildId,
    userId: interaction.user.id,
  });
}
