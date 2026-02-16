/**
 * Safe Message Sending Wrappers
 * Defense-in-depth wrappers around Discord.js message methods.
 * Sanitizes content to strip @everyone/@here and enforces allowedMentions
 * on every outgoing message. Long messages (>2000 chars) are automatically
 * split into multiple sends.
 *
 * @see https://github.com/BillChirico/bills-bot/issues/61
 */

import { error as logError } from '../logger.js';
import { sanitizeMessageOptions } from './sanitizeMentions.js';
import { needsSplitting, splitMessage } from './splitMessage.js';

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
 * Send a single prepared options object, or split into multiple sends
 * if the content exceeds Discord's 2000-char limit.
 *
 * @param {Function} sendFn - The underlying send/reply/followUp/editReply function
 * @param {object} prepared - The sanitized options object
 * @returns {Promise<import('discord.js').Message|import('discord.js').Message[]>}
 */
async function sendOrSplit(sendFn, prepared) {
  const content = prepared.content;
  if (typeof content === 'string' && needsSplitting(content)) {
    const chunks = splitMessage(content);
    const results = [];
    for (const chunk of chunks) {
      results.push(await sendFn({ ...prepared, content: chunk }));
    }
    return results;
  }
  return sendFn(prepared);
}

/**
 * Safely send a message to a channel.
 * Sanitizes content, enforces allowedMentions, and splits long messages.
 *
 * @param {import('discord.js').TextBasedChannel} channel - The channel to send to
 * @param {string|object} options - Message content or options object
 * @returns {Promise<import('discord.js').Message|import('discord.js').Message[]>} The sent message(s)
 */
export async function safeSend(channel, options) {
  try {
    return await sendOrSplit((opts) => channel.send(opts), prepareOptions(options));
  } catch (err) {
    logError('safeSend failed', { error: err.message });
    throw err;
  }
}

/**
 * Safely reply to an interaction or message.
 * Sanitizes content, enforces allowedMentions, and splits long messages.
 * Works with both Interaction.reply() and Message.reply() — both accept
 * the same options shape including allowedMentions.
 *
 * @param {import('discord.js').CommandInteraction|import('discord.js').Message} target - The interaction or message to reply to
 * @param {string|object} options - Reply content or options object
 * @returns {Promise<import('discord.js').Message|import('discord.js').Message[]|void>} The reply
 */
export async function safeReply(target, options) {
  try {
    return await sendOrSplit((opts) => target.reply(opts), prepareOptions(options));
  } catch (err) {
    logError('safeReply failed', { error: err.message });
    throw err;
  }
}

/**
 * Safely send a follow-up to an interaction.
 * Sanitizes content, enforces allowedMentions, and splits long messages.
 *
 * @param {import('discord.js').CommandInteraction} interaction - The interaction to follow up on
 * @param {string|object} options - Follow-up content or options object
 * @returns {Promise<import('discord.js').Message|import('discord.js').Message[]>} The follow-up message(s)
 */
export async function safeFollowUp(interaction, options) {
  try {
    return await sendOrSplit((opts) => interaction.followUp(opts), prepareOptions(options));
  } catch (err) {
    logError('safeFollowUp failed', { error: err.message });
    throw err;
  }
}

/**
 * Safely edit an interaction reply.
 * Sanitizes content, enforces allowedMentions, and splits long messages.
 *
 * @param {import('discord.js').CommandInteraction} interaction - The interaction whose reply to edit
 * @param {string|object} options - Edit content or options object
 * @returns {Promise<import('discord.js').Message|import('discord.js').Message[]>} The edited message(s)
 */
export async function safeEditReply(interaction, options) {
  try {
    return await sendOrSplit((opts) => interaction.editReply(opts), prepareOptions(options));
  } catch (err) {
    logError('safeEditReply failed', { error: err.message });
    throw err;
  }
}
