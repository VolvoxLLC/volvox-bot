/**
 * InteractionCreate Event Handlers
 *
 * This file re-exports all interaction handlers from the handlers/ directory.
 * Each handler type lives in its own focused module under src/modules/handlers/.
 */

export { registerChallengeButtonHandler } from '../handlers/challengeHandler.js';
export { registerPollButtonHandler } from '../handlers/pollHandler.js';
export { registerReminderButtonHandler } from '../handlers/reminderHandler.js';
export { registerReviewClaimHandler } from '../handlers/reviewHandler.js';
export {
  registerShowcaseButtonHandler,
  registerShowcaseModalHandler,
} from '../handlers/showcaseHandler.js';
export {
  registerTicketCloseButtonHandler,
  registerTicketModalHandler,
  registerTicketOpenButtonHandler,
} from '../handlers/ticketHandler.js';
export { registerWelcomeOnboardingHandlers } from '../handlers/welcomeOnboardingHandler.js';
