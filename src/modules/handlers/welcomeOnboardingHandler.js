/**
 * Welcome Onboarding Handlers
 * Handles Discord button and select menu interactions for rules acceptance and role selection.
 */

import { Events } from 'discord.js';
import { error as logError } from '../../logger.js';
import { safeEditReply } from '../../utils/safeSend.js';
import { getConfig } from '../config.js';
import {
  handleRoleMenuSelection,
  handleRulesAcceptButton,
  ROLE_MENU_SELECT_ID,
  RULES_ACCEPT_BUTTON_ID,
} from '../welcomeOnboarding.js';

/**
 * Register onboarding interaction handlers:
 * - Rules acceptance button
 * - Role selection menu
 *
 * @param {Client} client - Discord client instance
 */
export function registerWelcomeOnboardingHandlers(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    const guildId = interaction.guildId;
    if (!guildId) return;

    const guildConfig = getConfig(guildId);
    if (!guildConfig.welcome?.enabled) return;

    if (interaction.isButton() && interaction.customId === RULES_ACCEPT_BUTTON_ID) {
      try {
        await handleRulesAcceptButton(interaction, guildConfig);
      } catch (err) {
        logError('Rules acceptance handler failed', {
          guildId,
          userId: interaction.user?.id,
          error: err?.message,
        });

        try {
          // Handler already deferred, so we can safely edit
          await safeEditReply(interaction, {
            content: '❌ Failed to verify. Please ping an admin.',
          });
        } catch {
          // ignore
        }
      }
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === ROLE_MENU_SELECT_ID) {
      try {
        await handleRoleMenuSelection(interaction, guildConfig);
      } catch (err) {
        logError('Role menu handler failed', {
          guildId,
          userId: interaction.user?.id,
          error: err?.message,
        });

        try {
          // Handler already deferred, so we can safely edit
          await safeEditReply(interaction, {
            content: '❌ Failed to update roles. Please try again.',
          });
        } catch {
          // ignore
        }
      }
    }
  });
}
