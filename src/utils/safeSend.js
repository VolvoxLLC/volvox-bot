/**
 * Safe Message Sending Wrappers
 * Defense-in-depth wrappers around Discord.js message methods.
 * Sanitizes content to strip @everyone/@here and enforces allowedMentions
 * on every outgoing message.
 *
 * @see https://github.com/BillChirico/bills-bot/issues/61
 */

import { sanitizeMessageOptions } from './sanitizeMentions.js';

/**
 * Default allowedMentions config that only permits user mentions.
 * Applied to every outgoing message as defense-in-depth.
 */
const SAFE_ALLOWED_MENTIONS = { parse: ['users'] };

/**
 * Normalize message arguments into an options object.
 * Discord.js accepts either a string or an options object.
 *
 * @param {string|object} options - Message content or options object
 * @returns {object} Normalized options object
 */
function normalizeOptions(options) {
  if (typeof options === 'string') {
    return { content: options };
  }
  return { ...options };
}

/**
 * Apply sanitization and safe allowedMentions to message options.
 *
 * @param {string|object} options - Message content or options object
 * @returns {object} Sanitized options with safe allowedMentions
 */
function prepareOptions(options) {
  const normalized = normalizeOptions(options);
  const sanitized = sanitizeMessageOptions(normalized);
  return {
    ...sanitized,
    allowedMentions: SAFE_ALLOWED_MENTIONS,
  };
}

/**
 * Safely send a message to a channel.
 * Sanitizes content and enforces allowedMentions.
 *
 * @param {import('discord.js').TextBasedChannel} channel - The channel to send to
 * @param {string|object} options - Message content or options object
 * @returns {Promise<import('discord.js').Message>} The sent message
 */
export async function safeSend(channel, options) {
  return channel.send(prepareOptions(options));
}

/**
 * Safely reply to an interaction.
 * Sanitizes content and enforces allowedMentions.
 *
 * @param {import('discord.js').CommandInteraction} interaction - The interaction to reply to
 * @param {string|object} options - Reply content or options object
 * @returns {Promise<import('discord.js').Message|void>} The reply
 */
export async function safeReply(interaction, options) {
  return interaction.reply(prepareOptions(options));
}

/**
 * Safely send a follow-up to an interaction.
 * Sanitizes content and enforces allowedMentions.
 *
 * @param {import('discord.js').CommandInteraction} interaction - The interaction to follow up on
 * @param {string|object} options - Follow-up content or options object
 * @returns {Promise<import('discord.js').Message>} The follow-up message
 */
export async function safeFollowUp(interaction, options) {
  return interaction.followUp(prepareOptions(options));
}

/**
 * Safely edit an interaction reply.
 * Sanitizes content and enforces allowedMentions.
 *
 * @param {import('discord.js').CommandInteraction} interaction - The interaction whose reply to edit
 * @param {string|object} options - Edit content or options object
 * @returns {Promise<import('discord.js').Message>} The edited message
 */
export async function safeEditReply(interaction, options) {
  return interaction.editReply(prepareOptions(options));
}
