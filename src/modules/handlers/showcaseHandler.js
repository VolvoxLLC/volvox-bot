/**
 * Showcase Button and Modal Handlers
 * Handles Discord button interactions for showcase upvotes and modal submissions.
 */

import { Events } from 'discord.js';
import { handleShowcaseModalSubmit, handleShowcaseUpvote } from '../../commands/showcase.js';
import { error as logError } from '../../logger.js';
import { safeEditReply, safeReply } from '../../utils/safeSend.js';
import { getConfig } from '../config.js';

/**
 * Register an interactionCreate handler for showcase upvote buttons.
 * Listens for button clicks with customId matching `showcase_upvote_<id>`.
 *
 * @param {Client} client - Discord client instance
 */
export function registerShowcaseButtonHandler(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith('showcase_upvote_')) return;

    // Gate on showcase feature being enabled for this guild
    const guildConfig = getConfig(interaction.guildId);
    if (guildConfig.showcase?.enabled === false) return;

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
      return;
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
  });
}

/**
 * Register an interactionCreate handler for showcase modal submissions.
 * Listens for modal submits with customId `showcase_submit_modal`.
 *
 * @param {Client} client - Discord client instance
 */
export function registerShowcaseModalHandler(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isModalSubmit()) return;
    if (interaction.customId !== 'showcase_submit_modal') return;

    // Gate on showcase feature being enabled for this guild
    const guildConfig = getConfig(interaction.guildId);
    if (guildConfig.showcase?.enabled === false) return;

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
      return;
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
  });
}
