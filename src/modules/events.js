/**
 * Events Module
 * Handles Discord event listeners and handlers
 *
 * This module serves as the main entry point for all event handlers.
 * Individual handlers are organized in the events/ subdirectory.
 */

import { registerErrorHandlers } from './events/errors.js';
import { registerGuildMemberAddHandler } from './events/guildMemberAdd.js';
import {
  registerComponentHandlers,
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

// Re-export for backward compatibility
export {
  registerReadyHandler,
  registerMessageCreateHandler,
  registerGuildMemberAddHandler,
  registerComponentHandlers,
  registerReactionHandlers,
  registerErrorHandlers,
  registerVoiceStateHandler,
  // Deprecated — use handler functions directly
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
};

/**
 * Register all event handlers
 * @param {Object} client - Discord client
 * @param {Object} config - Bot configuration
 * @param {Object} healthMonitor - Health monitor instance
 */
export function registerEventHandlers(client, config, healthMonitor) {
  registerReadyHandler(client, config, healthMonitor);
  registerGuildMemberAddHandler(client, config);
  registerMessageCreateHandler(client, config, healthMonitor);
  registerReactionHandlers(client, config);
  registerComponentHandlers(client);
  registerVoiceStateHandler(client);
  registerErrorHandlers(client);
}
