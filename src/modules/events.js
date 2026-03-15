/**
 * Events Module
 * Handles Discord event listeners and handlers.
 *
 * This module serves as the main entry point for all event handlers.
 * Individual handlers are organized in the events/ subdirectory.
 */

import { registerClientReadyHandler } from './events/clientReady.js';
import { registerCommandInteractionHandler } from './events/commandInteraction.js';
import { registerErrorHandlers } from './events/errors.js';
import { registerGuildMemberAddHandler } from './events/guildMemberAdd.js';
import {
  registerChallengeButtonHandler,
  registerPollButtonHandler,
  registerReminderButtonHandler,
  registerReviewClaimHandler,
  registerShowcaseButtonHandler,
  registerShowcaseModalHandler,
  registerTicketCloseButtonHandler,
  registerTicketModalHandler,
  registerTicketOpenButtonHandler,
  registerWelcomeOnboardingHandlers,
} from './events/interactionCreate.js';
import { registerMessageCreateHandler } from './events/messageCreate.js';
import { registerReactionHandlers } from './events/reactions.js';
import { registerReadyHandler } from './events/ready.js';
import { registerVoiceStateHandler } from './events/voiceState.js';

// Re-export all handlers for backward compatibility
export {
  registerClientReadyHandler,
  registerCommandInteractionHandler,
  registerReadyHandler,
  registerMessageCreateHandler,
  registerGuildMemberAddHandler,
  registerPollButtonHandler,
  registerReviewClaimHandler,
  registerShowcaseButtonHandler,
  registerShowcaseModalHandler,
  registerChallengeButtonHandler,
  registerWelcomeOnboardingHandlers,
  registerReminderButtonHandler,
  registerTicketOpenButtonHandler,
  registerTicketModalHandler,
  registerTicketCloseButtonHandler,
  registerReactionHandlers,
  registerErrorHandlers,
  registerVoiceStateHandler,
};

/**
 * Register all event handlers
 * @param {import('discord.js').Client} client - Discord client
 * @param {Object} config - Bot configuration
 * @param {import('../utils/health.js').HealthMonitor} healthMonitor - Health monitor instance
 */
export function registerEventHandlers(client, config, healthMonitor) {
  // Core lifecycle
  registerReadyHandler(client, config, healthMonitor);
  registerClientReadyHandler(client);
  registerErrorHandlers(client);

  // Message & reaction handlers
  registerGuildMemberAddHandler(client, config);
  registerMessageCreateHandler(client, config, healthMonitor);
  registerReactionHandlers(client, config);

  // Slash command dispatch
  registerCommandInteractionHandler(client);

  // Button / modal interaction handlers
  registerPollButtonHandler(client);
  registerChallengeButtonHandler(client);
  registerReviewClaimHandler(client);
  registerShowcaseButtonHandler(client);
  registerShowcaseModalHandler(client);
  registerTicketOpenButtonHandler(client);
  registerTicketModalHandler(client);
  registerTicketCloseButtonHandler(client);
  registerReminderButtonHandler(client);
  registerWelcomeOnboardingHandlers(client);

  // Voice state
  registerVoiceStateHandler(client);
}
