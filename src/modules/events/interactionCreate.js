/**
 * InteractionCreate Event Handlers
 * Handles all Discord interaction events (buttons, modals, select menus)
 */

import {
  ActionRowBuilder,
  ChannelType,
  Events,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { handleShowcaseModalSubmit, handleShowcaseUpvote } from '../../commands/showcase.js';
import { error as logError, warn } from '../../logger.js';
import { safeEditReply, safeReply } from '../../utils/safeSend.js';
import { handleHintButton, handleSolveButton } from '../challengeScheduler.js';
import { getConfig } from '../config.js';
import { handlePollVote } from '../pollHandler.js';
import { handleReminderDismiss, handleReminderSnooze } from '../reminderHandler.js';
import { handleReviewClaim } from '../reviewHandler.js';
import { closeTicket, getTicketConfig, openTicket } from '../ticketHandler.js';
import {
  handleRoleMenuSelection,
  handleRulesAcceptButton,
  ROLE_MENU_SELECT_ID,
  RULES_ACCEPT_BUTTON_ID,
} from '../welcomeOnboarding.js';

/**
 * Register an interactionCreate handler for poll vote buttons.
 * Listens for button clicks with customId matching `poll_vote_<pollId>_<optionIndex>`.
 *
 * @param {Client} client - Discord client instance
 */
export function registerPollButtonHandler(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith('poll_vote_')) return;

    try {
      await handlePollVote(interaction);
    } catch (err) {
      logError('Poll vote handler failed', {
        customId: interaction.customId,
        userId: interaction.user?.id,
        error: err.message,
      });

      // Try to send an ephemeral error if we haven't replied yet
      if (!interaction.replied && !interaction.deferred) {
        try {
          await safeReply(interaction, {
            content: '❌ Something went wrong processing your vote.',
            ephemeral: true,
          });
        } catch {
          // Ignore — we tried
        }
      }
    }
  });
}

/**
 * Register an interactionCreate handler for review claim buttons.
 * Listens for button clicks with customId matching `review_claim_<id>`.
 *
 * @param {Client} client - Discord client instance
 */
export function registerReviewClaimHandler(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith('review_claim_')) return;

    // Gate on review feature being enabled for this guild
    const guildConfig = getConfig(interaction.guildId);
    if (!guildConfig.review?.enabled) return;

    try {
      await handleReviewClaim(interaction);
    } catch (err) {
      logError('Review claim handler failed', {
        customId: interaction.customId,
        userId: interaction.user?.id,
        error: err.message,
      });

      if (!interaction.replied && !interaction.deferred) {
        try {
          await safeReply(interaction, {
            content: '❌ Something went wrong processing your claim.',
            ephemeral: true,
          });
        } catch {
          // Ignore — we tried
        }
      }
    }
  });
}

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

      if (!interaction.replied && !interaction.deferred) {
        try {
          await safeReply(interaction, {
            content: '❌ Something went wrong processing your upvote.',
            ephemeral: true,
          });
        } catch {
          // Ignore — we tried
        }
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
      const reply = interaction.deferred ? safeEditReply : safeReply;
      await reply(interaction, { content: '❌ Something went wrong.' });
    }
  });
}

/**
 * Register an interactionCreate handler for challenge solve and hint buttons.
 * Listens for button clicks with customId matching `challenge_solve_<index>` or `challenge_hint_<index>`.
 *
 * @param {Client} client - Discord client instance
 */
export function registerChallengeButtonHandler(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;

    const isSolve = interaction.customId.startsWith('challenge_solve_');
    const isHint = interaction.customId.startsWith('challenge_hint_');
    if (!isSolve && !isHint) return;

    const prefix = isSolve ? 'challenge_solve_' : 'challenge_hint_';
    const indexStr = interaction.customId.slice(prefix.length);
    const challengeIndex = Number.parseInt(indexStr, 10);

    if (Number.isNaN(challengeIndex)) {
      warn('Invalid challenge button customId', { customId: interaction.customId });
      return;
    }

    try {
      if (isSolve) {
        await handleSolveButton(interaction, challengeIndex);
      } else {
        await handleHintButton(interaction, challengeIndex);
      }
    } catch (err) {
      logError('Challenge button handler failed', {
        customId: interaction.customId,
        userId: interaction.user?.id,
        error: err.message,
      });

      if (!interaction.replied && !interaction.deferred) {
        try {
          await safeReply(interaction, {
            content: '❌ Something went wrong. Please try again.',
            ephemeral: true,
          });
        } catch {
          // Ignore
        }
      }
    }
  });
}

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
          if (!interaction.replied) {
            await safeEditReply(interaction, {
              content: '❌ Failed to verify. Please ping an admin.',
            });
          }
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
          if (!interaction.replied) {
            await safeEditReply(interaction, {
              content: '❌ Failed to update roles. Please try again.',
            });
          }
        } catch {
          // ignore
        }
      }
    }
  });
}

/**
 * Register an interactionCreate handler for reminder snooze/dismiss buttons.
 * Listens for button clicks with customId matching `reminder_snooze_<id>_<duration>`
 * or `reminder_dismiss_<id>`.
 *
 * @param {Client} client - Discord client instance
 */
export function registerReminderButtonHandler(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;

    const isSnooze = interaction.customId.startsWith('reminder_snooze_');
    const isDismiss = interaction.customId.startsWith('reminder_dismiss_');
    if (!isSnooze && !isDismiss) return;

    try {
      if (isSnooze) {
        await handleReminderSnooze(interaction);
      } else {
        await handleReminderDismiss(interaction);
      }
    } catch (err) {
      logError('Reminder button handler failed', {
        customId: interaction.customId,
        userId: interaction.user?.id,
        error: err.message,
      });

      if (!interaction.replied && !interaction.deferred) {
        try {
          await safeReply(interaction, {
            content: '❌ Something went wrong processing your request.',
            ephemeral: true,
          });
        } catch {
          // Ignore
        }
      }
    }
  });
}

/**
 * Register an interactionCreate handler for ticket open button clicks.
 * Listens for button clicks with customId `ticket_open` (from the persistent panel).
 * Shows a modal to collect the ticket topic, then opens the ticket.
 *
 * @param {Client} client - Discord client instance
 */
export function registerTicketOpenButtonHandler(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.customId !== 'ticket_open') return;

    const ticketConfig = getTicketConfig(interaction.guildId);
    if (!ticketConfig.enabled) {
      try {
        await safeReply(interaction, {
          content: '❌ The ticket system is not enabled on this server.',
          ephemeral: true,
        });
      } catch {
        // Ignore
      }
      return;
    }

    // Show a modal to collect the topic
    const modal = new ModalBuilder()
      .setCustomId('ticket_open_modal')
      .setTitle('Open Support Ticket');

    const topicInput = new TextInputBuilder()
      .setCustomId('ticket_topic')
      .setLabel('What do you need help with?')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Describe your issue...')
      .setMaxLength(200)
      .setRequired(false);

    const row = new ActionRowBuilder().addComponents(topicInput);
    modal.addComponents(row);

    try {
      await interaction.showModal(modal);
    } catch (err) {
      logError('Failed to show ticket modal', {
        userId: interaction.user?.id,
        error: err.message,
      });
    }
  });
}

/**
 * Register an interactionCreate handler for ticket modal submissions.
 * Listens for modal submits with customId `ticket_open_modal`.
 *
 * @param {Client} client - Discord client instance
 */
export function registerTicketModalHandler(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isModalSubmit()) return;
    if (interaction.customId !== 'ticket_open_modal') return;

    await interaction.deferReply({ ephemeral: true });

    const topic = interaction.fields.getTextInputValue('ticket_topic') || null;

    try {
      const { ticket, thread } = await openTicket(
        interaction.guild,
        interaction.user,
        topic,
        interaction.channelId,
      );

      await safeEditReply(interaction, {
        content: `✅ Ticket #${ticket.id} created! Head to <#${thread.id}>.`,
      });
    } catch (err) {
      await safeEditReply(interaction, {
        content: `❌ ${err.message}`,
      });
    }
  });
}

/**
 * Register an interactionCreate handler for ticket close button clicks.
 * Listens for button clicks with customId matching `ticket_close_<id>`.
 *
 * @param {Client} client - Discord client instance
 */
export function registerTicketCloseButtonHandler(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith('ticket_close_')) return;

    await interaction.deferReply({ ephemeral: true });

    const ticketChannel = interaction.channel;
    const isThread = typeof ticketChannel?.isThread === 'function' && ticketChannel.isThread();
    const isTextChannel = ticketChannel?.type === ChannelType.GuildText;

    if (!isThread && !isTextChannel) {
      await safeEditReply(interaction, {
        content: '❌ This button can only be used inside a ticket channel or thread.',
      });
      return;
    }

    try {
      const ticket = await closeTicket(ticketChannel, interaction.user, 'Closed via button');
      await safeEditReply(interaction, {
        content: `✅ Ticket #${ticket.id} has been closed.`,
      });
    } catch (err) {
      await safeEditReply(interaction, {
        content: `❌ ${err.message}`,
      });
    }
  });
}
