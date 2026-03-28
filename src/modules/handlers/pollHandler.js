/**
 * Poll Vote Button Handler
 * Handles Discord button interactions for poll voting.
 */

import { handleButtonError } from '../../utils/interactionError.js';
import { getConfig } from '../config.js';
import { handlePollVote } from '../pollHandler.js';

/**
 * Handle a poll vote button interaction.
 * Expects button clicks with customId matching `poll_vote_<pollId>_<optionIndex>`.
 *
 * @param {import('discord.js').ButtonInteraction} interaction
 * @returns {Promise<boolean>} true if handled, false if not applicable
 */
export async function handlePollButton(interaction) {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith('poll_vote_')) return false;

  const guildConfig = getConfig(interaction.guildId);
  if (!guildConfig.poll?.enabled) return true;

  try {
    await handlePollVote(interaction);
  } catch (err) {
    await handleButtonError(interaction, err, {
      context: 'Poll vote handler failed',
      message: '❌ Something went wrong processing your vote.',
    });
  }
  return true;
}

/** @deprecated Use handlePollButton directly */
export function registerPollButtonHandler(client) {
  client.on('interactionCreate', handlePollButton);
}
