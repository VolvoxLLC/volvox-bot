import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  GuildMemberFlagsBitField,
  StringSelectMenuBuilder,
} from 'discord.js';
import { info } from '../logger.js';
import { fetchChannelCached } from '../utils/discordCache.js';
import { safeEditReply, safeSend } from '../utils/safeSend.js';
import { renderTemplate } from '../utils/templateEngine.js';

export const RULES_ACCEPT_BUTTON_ID = 'welcome_rules_accept';
export const ROLE_MENU_SELECT_ID = 'welcome_role_select';
export const DEFAULT_RULES_AGREEMENT_MESSAGE =
  'Read the server rules, then click below to verify your access.';
export const DEFAULT_ROLE_MENU_MESSAGE = 'Pick your roles below. You can update them anytime.';
export const DEFAULT_INTRODUCTION_MESSAGE =
  'Welcome {{user}}! Drop a quick intro so we can meet you.';

const MAX_ROLE_MENU_OPTIONS = 25;

/**
 * Normalize welcome onboarding settings and apply safe defaults.
 *
 * @param {object} welcomeConfig
 * @returns {{
 *   rulesChannel: string|null,
 *   verifiedRole: string|null,
 *   introChannel: string|null,
 *   rulesMessage: string,
 *   roleMenu: {enabled: boolean, message: string, options: Array<{label: string, roleId: string, description?: string}>},
 *   introMessage: string,
 *   dmSequence: {enabled: boolean, steps: string[]},
 * }}
 */
export function normalizeWelcomeOnboardingConfig(welcomeConfig = {}) {
  const roleMenuOptions = Array.isArray(welcomeConfig?.roleMenu?.options)
    ? welcomeConfig.roleMenu.options
        .filter((opt) => opt && typeof opt === 'object')
        .map((opt) => ({
          label: String(opt.label || '').trim(),
          roleId: String(opt.roleId || '').trim(),
          ...(opt.description ? { description: String(opt.description).trim() } : {}),
        }))
        .filter((opt) => opt.label && opt.roleId)
        .slice(0, MAX_ROLE_MENU_OPTIONS)
    : [];

  const dmSteps = Array.isArray(welcomeConfig?.dmSequence?.steps)
    ? welcomeConfig.dmSequence.steps.map((step) => String(step || '').trim()).filter(Boolean)
    : [];

  return {
    rulesChannel:
      typeof welcomeConfig?.rulesChannel === 'string' && welcomeConfig.rulesChannel.trim()
        ? welcomeConfig.rulesChannel.trim()
        : null,
    verifiedRole:
      typeof welcomeConfig?.verifiedRole === 'string' && welcomeConfig.verifiedRole.trim()
        ? welcomeConfig.verifiedRole.trim()
        : null,
    introChannel:
      typeof welcomeConfig?.introChannel === 'string' && welcomeConfig.introChannel.trim()
        ? welcomeConfig.introChannel.trim()
        : null,
    rulesMessage:
      typeof welcomeConfig?.rulesMessage === 'string' && welcomeConfig.rulesMessage.trim()
        ? welcomeConfig.rulesMessage.trim()
        : DEFAULT_RULES_AGREEMENT_MESSAGE,
    roleMenu: {
      enabled: welcomeConfig?.roleMenu?.enabled === true,
      message:
        typeof welcomeConfig?.roleMenu?.message === 'string' &&
        welcomeConfig.roleMenu.message.trim()
          ? welcomeConfig.roleMenu.message.trim()
          : DEFAULT_ROLE_MENU_MESSAGE,
      options: roleMenuOptions,
    },
    introMessage:
      typeof welcomeConfig?.introMessage === 'string' && welcomeConfig.introMessage.trim()
        ? welcomeConfig.introMessage.trim()
        : DEFAULT_INTRODUCTION_MESSAGE,
    dmSequence: {
      enabled: welcomeConfig?.dmSequence?.enabled === true,
      steps: dmSteps,
    },
  };
}

/**
 * Check whether a guild member is rejoining (has the DidRejoin flag).
 *
 * @param {import('discord.js').GuildMember} member - The guild member to check.
 * @returns {boolean} `true` if the member has previously left and is rejoining the guild.
 */
export function isReturningMember(member) {
  return member?.flags?.has?.(GuildMemberFlagsBitField.Flags.DidRejoin) === true;
}

export function buildRulesAgreementMessage(welcomeConfig = {}) {
  const onboarding = normalizeWelcomeOnboardingConfig(welcomeConfig);
  const button = new ButtonBuilder()
    .setCustomId(RULES_ACCEPT_BUTTON_ID)
    .setLabel('Accept Rules')
    .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder().addComponents(button);

  return {
    content: onboarding.rulesMessage,
    components: [row],
  };
}

export function buildRoleMenuMessage(welcomeConfig) {
  const onboarding = normalizeWelcomeOnboardingConfig(welcomeConfig);
  if (!onboarding.roleMenu.enabled || onboarding.roleMenu.options.length === 0) {
    return null;
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(ROLE_MENU_SELECT_ID)
    .setPlaceholder('Choose your roles')
    .setMinValues(0)
    .setMaxValues(onboarding.roleMenu.options.length)
    .addOptions(
      onboarding.roleMenu.options.map((opt) => ({
        label: opt.label.slice(0, 100),
        value: opt.roleId,
        ...(opt.description ? { description: opt.description.slice(0, 100) } : {}),
      })),
    );

  const row = new ActionRowBuilder().addComponents(select);

  return {
    content: onboarding.roleMenu.message,
    components: [row],
  };
}

export function renderIntroductionMessage(template, member, guild) {
  return renderTemplate(template || DEFAULT_INTRODUCTION_MESSAGE, {
    user: `<@${member.id}>`,
    username: member.user?.username || member.username || 'Unknown',
    server: guild?.name ?? '',
  });
}

async function fetchRole(guild, roleId) {
  return guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null)); // roles.cache is in-memory; fetch only on miss
}

export async function handleRulesAcceptButton(interaction, config) {
  await interaction.deferReply({ ephemeral: true });
  const welcome = normalizeWelcomeOnboardingConfig(config?.welcome);

  if (!welcome.verifiedRole) {
    await safeEditReply(interaction, {
      content: '⚠️ Verified role is not configured yet. Ask an admin to set `welcome.verifiedRole`.',
    });
    return;
  }

  const member = interaction.member || (await interaction.guild.members.fetch(interaction.user.id));
  const role = await fetchRole(interaction.guild, welcome.verifiedRole);

  if (!role) {
    await safeEditReply(interaction, {
      content:
        '❌ I cannot find the configured verified role. Ask an admin to fix onboarding config.',
    });
    return;
  }

  if (!role.editable) {
    await safeEditReply(interaction, {
      content: '❌ I cannot assign the verified role (it is above my highest role).',
    });
    return;
  }

  if (member.roles.cache.has(role.id)) {
    await safeEditReply(interaction, {
      content: '✅ You are already verified.',
    });
    return;
  }

  try {
    await member.roles.add(role, 'Accepted server rules');
  } catch (roleErr) {
    info('Failed to assign verified role during rules acceptance', {
      guildId: interaction.guildId,
      userId: interaction.user.id,
      roleId: role.id,
      error: roleErr?.message,
    });
    await safeEditReply(interaction, {
      content: '❌ Failed to assign the verified role. Please try again or contact an admin.',
    });
    return;
  }

  if (welcome.introChannel) {
    const introChannel = await fetchChannelCached(interaction.client, welcome.introChannel);

    if (introChannel?.isTextBased?.()) {
      await safeSend(
        introChannel,
        renderIntroductionMessage(welcome.introMessage, member, interaction.guild),
      );
    }
  }

  if (welcome.dmSequence.enabled && welcome.dmSequence.steps.length > 0) {
    for (const step of welcome.dmSequence.steps) {
      try {
        await interaction.user.send(step);
      } catch (dmErr) {
        info('DM delivery failed during onboarding sequence', {
          guildId: interaction.guildId,
          userId: interaction.user.id,
          error: dmErr?.message,
        });
        break;
      }
    }
  }

  await safeEditReply(interaction, {
    content: `✅ Rules accepted! You now have <@&${role.id}>.`,
  });

  info('User verified via rules button', {
    guildId: interaction.guildId,
    userId: interaction.user.id,
    roleId: role.id,
  });
}

export async function handleRoleMenuSelection(interaction, config) {
  await interaction.deferReply({ ephemeral: true });
  const welcome = normalizeWelcomeOnboardingConfig(config?.welcome);

  if (!welcome.roleMenu.enabled || welcome.roleMenu.options.length === 0) {
    await safeEditReply(interaction, {
      content: '⚠️ Role menu is not configured on this server.',
    });
    return;
  }

  const member = interaction.member || (await interaction.guild.members.fetch(interaction.user.id));

  const configuredRoleIds = [...new Set(welcome.roleMenu.options.map((opt) => opt.roleId))];
  const selectedIds = new Set(interaction.values.filter((id) => configuredRoleIds.includes(id)));

  const removable = [];
  const addable = [];

  for (const roleId of configuredRoleIds) {
    const role = await fetchRole(interaction.guild, roleId);
    if (!role?.editable) continue;

    const hasRole = member.roles.cache.has(role.id);
    if (selectedIds.has(role.id) && !hasRole) addable.push(role);
    if (!selectedIds.has(role.id) && hasRole) removable.push(role);
  }

  if (removable.length > 0) {
    await member.roles.remove(
      removable.map((r) => r.id),
      'Updated self-assignable onboarding roles',
    );
  }
  if (addable.length > 0) {
    await member.roles.add(
      addable.map((r) => r.id),
      'Updated self-assignable onboarding roles',
    );
  }

  await safeEditReply(interaction, {
    content:
      addable.length === 0 && removable.length === 0
        ? '✅ No role changes were needed.'
        : `✅ Updated roles. Added: ${addable.length}, Removed: ${removable.length}.`,
  });
}
