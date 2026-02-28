import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  GuildMemberFlagsBitField,
  StringSelectMenuBuilder,
} from 'discord.js';
import { info } from '../logger.js';
import { safeReply, safeSend } from '../utils/safeSend.js';

export const RULES_ACCEPT_BUTTON_ID = 'welcome_rules_accept';
export const ROLE_MENU_SELECT_ID = 'welcome_role_select';

const MAX_ROLE_MENU_OPTIONS = 25;

/**
 * Normalize welcome onboarding settings and apply safe defaults.
 *
 * @param {object} welcomeConfig
 * @returns {{
 *   rulesChannel: string|null,
 *   verifiedRole: string|null,
 *   introChannel: string|null,
 *   roleMenu: {enabled: boolean, options: Array<{label: string, roleId: string, description?: string}>},
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
    rulesChannel: typeof welcomeConfig?.rulesChannel === 'string' && welcomeConfig.rulesChannel.trim() ? welcomeConfig.rulesChannel.trim() : null,
    verifiedRole: typeof welcomeConfig?.verifiedRole === 'string' && welcomeConfig.verifiedRole.trim() ? welcomeConfig.verifiedRole.trim() : null,
    introChannel: typeof welcomeConfig?.introChannel === 'string' && welcomeConfig.introChannel.trim() ? welcomeConfig.introChannel.trim() : null,
    roleMenu: {
      enabled: welcomeConfig?.roleMenu?.enabled === true,
      options: roleMenuOptions,
    },
    dmSequence: {
      enabled: welcomeConfig?.dmSequence?.enabled === true,
      steps: dmSteps,
    },
  };
}

export function isReturningMember(member) {
  return member?.flags?.has?.(GuildMemberFlagsBitField.Flags.DidRejoin) === true;
}

export function buildRulesAgreementMessage() {
  const button = new ButtonBuilder()
    .setCustomId(RULES_ACCEPT_BUTTON_ID)
    .setLabel('Accept Rules')
    .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder().addComponents(button);

  return {
    content: '✅ Read the server rules, then click below to verify your access.',
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
        label: opt.label,
        value: opt.roleId,
        ...(opt.description ? { description: opt.description.slice(0, 100) } : {}),
      })),
    );

  const row = new ActionRowBuilder().addComponents(select);

  return {
    content: '🎭 Pick your roles below. You can update them anytime.',
    components: [row],
  };
}

async function fetchRole(guild, roleId) {
  return guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
}

export async function handleRulesAcceptButton(interaction, config) {
  const welcome = normalizeWelcomeOnboardingConfig(config?.welcome);

  if (!welcome.verifiedRole) {
    await safeReply(interaction, {
      content: '⚠️ Verified role is not configured yet. Ask an admin to set `welcome.verifiedRole`.',
      ephemeral: true,
    });
    return;
  }

  const member = interaction.member || (await interaction.guild.members.fetch(interaction.user.id));
  const role = await fetchRole(interaction.guild, welcome.verifiedRole);

  if (!role) {
    await safeReply(interaction, {
      content:
        '❌ I cannot find the configured verified role. Ask an admin to fix onboarding config.',
      ephemeral: true,
    });
    return;
  }

  if (!role.editable) {
    await safeReply(interaction, {
      content: '❌ I cannot assign the verified role (it is above my highest role).',
      ephemeral: true,
    });
    return;
  }

  if (member.roles.cache.has(role.id)) {
    await safeReply(interaction, {
      content: '✅ You are already verified.',
      ephemeral: true,
    });
    return;
  }

  await member.roles.add(role, 'Accepted server rules');

  if (welcome.introChannel) {
    const introChannel =
      interaction.guild.channels.cache.get(welcome.introChannel) ||
      (await interaction.guild.channels.fetch(welcome.introChannel).catch(() => null));

    if (introChannel?.isTextBased?.()) {
      await safeSend(
        introChannel,
        `👋 Welcome <@${member.id}>! Drop a quick intro so we can meet you.`,
      );
    }
  }

  if (welcome.dmSequence.enabled && welcome.dmSequence.steps.length > 0) {
    for (const step of welcome.dmSequence.steps) {
      try {
        await interaction.user.send(step);
      } catch {
        break;
      }
    }
  }

  await safeReply(interaction, {
    content: `✅ Rules accepted! You now have <@&${role.id}>.`,
    ephemeral: true,
  });

  info('User verified via rules button', {
    guildId: interaction.guildId,
    userId: interaction.user.id,
    roleId: role.id,
  });
}

export async function handleRoleMenuSelection(interaction, config) {
  const welcome = normalizeWelcomeOnboardingConfig(config?.welcome);

  if (!welcome.roleMenu.enabled || welcome.roleMenu.options.length === 0) {
    await safeReply(interaction, {
      content: '⚠️ Role menu is not configured on this server.',
      ephemeral: true,
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
    if (!role || !role.editable) continue;

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

  await safeReply(interaction, {
    content:
      addable.length === 0 && removable.length === 0
        ? '✅ No role changes were needed.'
        : `✅ Updated roles. Added: ${addable.length}, Removed: ${removable.length}.`,
    ephemeral: true,
  });
}
