/**
 * Events Module
 * Handles Discord event listeners and handlers
 */

import {
  ActionRowBuilder,
  ChannelType,
  Client,
  Events,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { handleShowcaseModalSubmit, handleShowcaseUpvote } from '../commands/showcase.js';
import { info, error as logError, warn } from '../logger.js';
import { getUserFriendlyMessage } from '../utils/errors.js';
// safeReply works with both Interactions (.reply()) and Messages (.reply()).
// Both accept the same options shape including allowedMentions, so the
// safe wrapper applies identically to either target type.
import { safeEditReply, safeReply } from '../utils/safeSend.js';
import { handleAfkMentions } from './afkHandler.js';
import { handleHintButton, handleSolveButton } from './challengeScheduler.js';
import { getConfig } from './config.js';
import { trackMessage, trackReaction } from './engagement.js';
import { checkLinks } from './linkFilter.js';
import { handlePollVote } from './pollHandler.js';
import { checkRateLimit } from './rateLimit.js';
import { handleReminderDismiss, handleReminderSnooze } from './reminderHandler.js';
import { handleXpGain } from './reputation.js';
import { handleReviewClaim } from './reviewHandler.js';
import { isSpam, sendSpamAlert } from './spam.js';
import { handleReactionAdd, handleReactionRemove } from './starboard.js';
import { closeTicket, getTicketConfig, openTicket } from './ticketHandler.js';
import { accumulateMessage, evaluateNow } from './triage.js';
import { recordCommunityActivity, sendWelcomeMessage } from './welcome.js';
import {
  handleRoleMenuSelection,
  handleRulesAcceptButton,
  ROLE_MENU_SELECT_ID,
  RULES_ACCEPT_BUTTON_ID,
} from './welcomeOnboarding.js';

/** @type {boolean} Guard against duplicate process-level handler registration */
let processHandlersRegistered = false;

/**
 * Register a one-time handler that runs when the Discord client becomes ready.
 *
 * When fired, the handler logs the bot's online status and server count, records
 * start time with the provided health monitor (if any), and logs which features
 * are enabled (welcome messages with channel ID, AI triage model selection, and moderation).
 *
 * @param {Client} client - The Discord client instance.
 * @param {Object} config - Startup/global bot configuration used only for one-time feature-gate logging (not per-guild).
 * @param {Object} [healthMonitor] - Optional health monitor with a `recordStart` method to mark service start time.
 */
export function registerReadyHandler(client, config, healthMonitor) {
  client.once(Events.ClientReady, () => {
    info(`${client.user.tag} is online`, { servers: client.guilds.cache.size });

    // Record bot start time
    if (healthMonitor) {
      healthMonitor.recordStart();
    }

    if (config.welcome?.enabled) {
      info('Welcome messages enabled', { channelId: config.welcome.channelId });
    }
    if (config.ai?.enabled) {
      const triageCfg = config.triage || {};
      const classifyModel = triageCfg.classifyModel ?? 'claude-haiku-4-5';
      const respondModel =
        triageCfg.respondModel ??
        (typeof triageCfg.model === 'string'
          ? triageCfg.model
          : (triageCfg.models?.default ?? 'claude-sonnet-4-5'));
      info('AI chat enabled', { classifyModel, respondModel });
    }
    if (config.moderation?.enabled) {
      info('Moderation enabled');
    }
    if (config.starboard?.enabled) {
      info('Starboard enabled', {
        channelId: config.starboard.channelId,
        threshold: config.starboard.threshold,
      });
    }
  });
}

/**
 * Register a handler that sends the configured welcome message when a user joins a guild.
 * @param {Client} client - Discord client instance to attach the event listener to.
 * @param {Object} _config - Unused (kept for API compatibility); handler resolves per-guild config via getConfig().
 */
export function registerGuildMemberAddHandler(client, _config) {
  client.on(Events.GuildMemberAdd, async (member) => {
    const guildConfig = getConfig(member.guild.id);
    await sendWelcomeMessage(member, client, guildConfig);
  });
}

/**
 * Register the MessageCreate event handler that processes incoming messages
 * for spam detection, community activity recording, and triage-based AI routing.
 *
 * Flow:
 * 1. Ignore bots/DMs
 * 2. Spam detection
 * 3. Community activity tracking
 * 4. @mention/reply → evaluateNow (triage classifies + responds internally)
 * 5. Otherwise → accumulateMessage (buffer for periodic triage eval)
 *
 * @param {Client} client - Discord client instance
 * @param {Object} _config - Unused (kept for API compatibility); handler resolves per-guild config via getConfig().
 * @param {Object} healthMonitor - Optional health monitor for metrics
 */
export function registerMessageCreateHandler(client, _config, healthMonitor) {
  client.on(Events.MessageCreate, async (message) => {
    // Ignore bots and DMs
    if (message.author.bot) return;
    if (!message.guild) return;

    // Resolve per-guild config so feature gates respect guild overrides
    const guildConfig = getConfig(message.guild.id);

    // AFK handler — check if sender is AFK or if any mentioned user is AFK
    try {
      await handleAfkMentions(message);
    } catch (afkErr) {
      logError('AFK handler failed', {
        channelId: message.channel.id,
        userId: message.author.id,
        error: afkErr?.message,
      });
    }

    // Rate limit + link filter — both gated on moderation.enabled.
    // Each check is isolated so a failure in one doesn't prevent the other from running.
    if (guildConfig.moderation?.enabled) {
      try {
        const { limited } = await checkRateLimit(message, guildConfig);
        if (limited) return;
      } catch (rlErr) {
        logError('Rate limit check failed', {
          channelId: message.channel.id,
          userId: message.author.id,
          error: rlErr?.message,
        });
      }

      try {
        const { blocked } = await checkLinks(message, guildConfig);
        if (blocked) return;
      } catch (lfErr) {
        logError('Link filter check failed', {
          channelId: message.channel.id,
          userId: message.author.id,
          error: lfErr?.message,
        });
      }
    }

    // Spam detection
    if (guildConfig.moderation?.enabled && isSpam(message.content)) {
      warn('Spam detected', { userId: message.author.id, contentPreview: '[redacted]' });
      await sendSpamAlert(message, client, guildConfig);
      return;
    }

    // Feed welcome-context activity tracker
    recordCommunityActivity(message, guildConfig);

    // Engagement tracking (fire-and-forget, non-blocking)
    trackMessage(message).catch(() => {});

    // XP gain (fire-and-forget, non-blocking)
    handleXpGain(message).catch((err) => {
      logError('XP gain handler failed', {
        userId: message.author.id,
        guildId: message.guild.id,
        error: err?.message,
      });
    });

    // AI chat — @mention or reply to bot → instant triage evaluation
    if (guildConfig.ai?.enabled) {
      const isMentioned = message.mentions.has(client.user);

      // Detect replies to the bot. The mentions.repliedUser check covers the
      // common case, but fails when the user toggles off "mention on reply"
      // in Discord. Fall back to fetching the referenced message directly.
      let isReply = false;
      if (message.reference?.messageId) {
        if (message.mentions.repliedUser?.id === client.user.id) {
          isReply = true;
        } else {
          try {
            const ref = await message.channel.messages.fetch(message.reference.messageId);
            isReply = ref.author.id === client.user.id;
          } catch (fetchErr) {
            warn('Could not fetch referenced message for reply detection', {
              channelId: message.channel.id,
              messageId: message.reference.messageId,
              error: fetchErr?.message,
            });
          }
        }
      }

      // Check if in allowed channel (if configured)
      // When inside a thread, check the parent channel ID against the allowlist
      // so thread replies aren't blocked by the whitelist.
      const allowedChannels = guildConfig.ai?.channels || [];
      const channelIdToCheck = message.channel.isThread?.()
        ? message.channel.parentId
        : message.channel.id;
      const isAllowedChannel =
        allowedChannels.length === 0 || allowedChannels.includes(channelIdToCheck);

      if ((isMentioned || isReply) && isAllowedChannel) {
        // Accumulate the message into the triage buffer (for context).
        // Even bare @mentions with no text go through triage so the classifier
        // can use recent channel history to produce a meaningful response.
        accumulateMessage(message, guildConfig);

        // Show typing indicator immediately so the user sees feedback
        message.channel.sendTyping().catch(() => {});

        // Force immediate triage evaluation — triage owns the full response lifecycle
        try {
          await evaluateNow(message.channel.id, guildConfig, client, healthMonitor);
        } catch (err) {
          logError('Triage evaluation failed for mention', {
            channelId: message.channel.id,
            error: err.message,
          });
          try {
            await safeReply(message, getUserFriendlyMessage(err));
          } catch (replyErr) {
            warn('safeReply failed for error fallback', {
              channelId: message.channel.id,
              userId: message.author.id,
              error: replyErr?.message,
            });
          }
        }

        return; // Don't accumulate again below
      }
    }

    // Triage: accumulate message for periodic evaluation (fire-and-forget)
    // Gated on ai.enabled — this is the master kill-switch for all AI responses.
    // accumulateMessage also checks triage.enabled internally.
    if (guildConfig.ai?.enabled) {
      try {
        const p = accumulateMessage(message, guildConfig);
        p?.catch((err) => {
          logError('Triage accumulate error', { error: err?.message });
        });
      } catch (err) {
        logError('Triage accumulate error', { error: err?.message });
      }
    }
  });
}

/**
 * Register reaction event handlers for the starboard feature.
 * Listens to both MessageReactionAdd and MessageReactionRemove to
 * post, update, or remove starboard embeds based on star count.
 *
 * @param {Client} client - Discord client instance
 * @param {Object} _config - Unused (kept for API compatibility); handler resolves per-guild config via getConfig().
 */
export function registerReactionHandlers(client, _config) {
  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    // Ignore bot reactions
    if (user.bot) return;

    // Fetch partial messages so we have full guild/channel data
    if (reaction.message.partial) {
      try {
        await reaction.message.fetch();
      } catch {
        return;
      }
    }
    const guildId = reaction.message.guild?.id;
    if (!guildId) return;

    const guildConfig = getConfig(guildId);

    // Engagement tracking (fire-and-forget)
    trackReaction(reaction, user).catch(() => {});

    if (!guildConfig.starboard?.enabled) return;

    try {
      await handleReactionAdd(reaction, user, client, guildConfig);
    } catch (err) {
      logError('Starboard reaction add handler failed', {
        messageId: reaction.message.id,
        error: err.message,
      });
    }
  });

  client.on(Events.MessageReactionRemove, async (reaction, user) => {
    if (user.bot) return;

    if (reaction.message.partial) {
      try {
        await reaction.message.fetch();
      } catch {
        return;
      }
    }
    const guildId = reaction.message.guild?.id;
    if (!guildId) return;

    const guildConfig = getConfig(guildId);
    if (!guildConfig.starboard?.enabled) return;

    try {
      await handleReactionRemove(reaction, user, client, guildConfig);
    } catch (err) {
      logError('Starboard reaction remove handler failed', {
        messageId: reaction.message.id,
        error: err.message,
      });
    }
  });
}

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
      pool = (await import('../db.js')).getPool();
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
      pool = (await import('../db.js')).getPool();
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
 * Register error event handlers
 * @param {Client} client - Discord client
 */
export function registerErrorHandlers(client) {
  client.on(Events.Error, (err) => {
    logError('Discord error', { error: err.message, stack: err.stack });
  });

  if (!processHandlersRegistered) {
    process.on('unhandledRejection', (err) => {
      logError('Unhandled rejection', { error: err?.message || String(err), stack: err?.stack });
    });
    process.on('uncaughtException', (err) => {
      logError('Uncaught exception', { error: err.message, stack: err.stack });
    });
    processHandlersRegistered = true;
  }
}

/**
 * Register an interactionCreate handler for challenge solve and hint buttons.
 * Listens for button clicks with customId matching `challenge_solve_<index>` or `challenge_hint_<index>`.
 *
 * @param {Client} client - Discord client instance
 */

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
 * Register all event handlers
 * @param {Object} client - Discord client
 * @param {Object} config - Bot configuration
 * @param {Object} healthMonitor - Health monitor instance
 */

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

export function registerEventHandlers(client, config, healthMonitor) {
  registerReadyHandler(client, config, healthMonitor);
  registerGuildMemberAddHandler(client, config);
  registerMessageCreateHandler(client, config, healthMonitor);
  registerReactionHandlers(client, config);
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
  registerErrorHandlers(client);
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
