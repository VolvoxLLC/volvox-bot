/**
 * Showcase Button and Modal Handlers
 * Handles Discord button interactions for showcase upvotes and modal submissions.
 */

import { handleShowcaseModalSubmit, handleShowcaseUpvote } from '../../commands/showcase.js';
import { error as logError } from '../../logger.js';
import { safeEditReply, safeReply } from '../../utils/safeSend.js';
import { getConfig } from '../config.js';

/**
 * Handle a showcase upvote button interaction.
 * Expects button clicks with customId matching `showcase_upvote_<id>`.
 *
 * @param {import('discord.js').ButtonInteraction} interaction
 * @returns {Promise<boolean>} true if handled, false if not applicable
 */
export async function handleShowcaseButton(interaction) {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith('showcase_upvote_')) return false;

  const guildConfig = getConfig(interaction.guildId);
  if (guildConfig.showcase?.enabled === false) return true;

  let pool;
  try {
    pool = (await import('../../db.js')).getPool();
  } catch {
    try {
      await safeReply(interaction, {
        content: '❌ Database is not available.',
        ephemeral: true,
      });
    } catch {
      // Ignore
    }
    return true;
  }

  try {
    await handleShowcaseUpvote(interaction, pool);
  } catch (err) {
    logError('Showcase upvote handler failed', {
      customId: interaction.customId,
      userId: interaction.user?.id,
      error: err.message,
    });

    try {
      const reply = interaction.deferred || interaction.replied ? safeEditReply : safeReply;
      await reply(interaction, {
        content: '❌ Something went wrong processing your upvote.',
        ephemeral: true,
      });
    } catch {
      // Ignore — we tried
    }
  }
  return true;
}

/**
 * Handle a showcase modal submission interaction.
 * Expects modal submits with customId `showcase_submit_modal`.
 *
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 * @returns {Promise<boolean>} true if handled, false if not applicable
 */
export async function handleShowcaseModal(interaction) {
  if (!interaction.isModalSubmit()) return false;
  if (interaction.customId !== 'showcase_submit_modal') return false;

  const guildConfig = getConfig(interaction.guildId);
  if (guildConfig.showcase?.enabled === false) return true;

  let pool;
  try {
    pool = (await import('../../db.js')).getPool();
  } catch {
    try {
      await safeReply(interaction, {
        content: '❌ Database is not available.',
        ephemeral: true,
      });
    } catch {
      // Ignore
    }
    return true;
  }

  try {
    await handleShowcaseModalSubmit(interaction, pool);
  } catch (err) {
    logError('Showcase modal error', { error: err.message });
    try {
      const reply = interaction.deferred || interaction.replied ? safeEditReply : safeReply;
      await reply(interaction, { content: '❌ Something went wrong.' });
    } catch (replyErr) {
      logError('Failed to send fallback reply', { error: replyErr?.message });
    }
  }
  return true;
}

/** @deprecated Use handleShowcaseButton directly */
export function registerShowcaseButtonHandler(client) {
  client.on('interactionCreate', handleShowcaseButton);
}

/** @deprecated Use handleShowcaseModal directly */
export function registerShowcaseModalHandler(client) {
  client.on('interactionCreate', handleShowcaseModal);
}
