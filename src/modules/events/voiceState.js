/**
 * Voice State Event Handler
 * Handles Discord voice state updates
 */

import { Events } from 'discord.js';
import { error as logError } from '../../logger.js';
import { handleVoiceStateUpdate } from '../voice.js';

/**
 * Register the voiceStateUpdate handler for voice channel activity tracking.
 *
 * @param {Client} client - Discord client instance
 */
export function registerVoiceStateHandler(client) {
  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    await handleVoiceStateUpdate(oldState, newState).catch((err) => {
      logError('Voice state update handler error', { error: err.message });
    });
  });
}
