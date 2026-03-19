/**
 * MessageCreate Event Handler
 * Handles incoming Discord messages
 */

import { Events } from 'discord.js';
import { error as logError, warn } from '../../logger.js';
import { getUserFriendlyMessage } from '../../utils/errors.js';
import { safeReply } from '../../utils/safeSend.js';
import { handleAfkMentions } from '../afkHandler.js';
import { getChannelMode, isChannelBlocked } from '../ai.js';
import { checkAiAutoMod } from '../aiAutoMod.js';
import { getConfig } from '../config.js';
import { trackMessage } from '../engagement.js';
import { checkLinks } from '../linkFilter.js';
import { handleQuietCommand, isQuietMode } from '../quietMode.js';
import { checkRateLimit } from '../rateLimit.js';
import { handleXpGain } from '../reputation.js';
import { isSpam, sendSpamAlert } from '../spam.js';
import { accumulateMessage, evaluateNow } from '../triage.js';
import { clearChannelState } from '../triage-buffer.js';
import { recordCommunityActivity } from '../welcome.js';

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
      try {
        await sendSpamAlert(message, client, guildConfig);
      } catch (alertErr) {
        logError('Failed to send spam alert', {
          channelId: message.channel.id,
          userId: message.author.id,
          error: alertErr?.message,
        });
      }
      return;
    }

    // AI Auto-Moderation — analyze message with Claude for toxicity/spam/harassment
    // Runs after basic spam check; gated on aiAutoMod.enabled in config
    try {
      const { flagged } = await checkAiAutoMod(message, client, guildConfig);
      if (flagged) return;
    } catch (aiModErr) {
      logError('AI auto-mod check failed', {
        channelId: message.channel.id,
        userId: message.author.id,
        error: aiModErr?.message,
      });
    }

    // Feed welcome-context activity tracker
    recordCommunityActivity(message, guildConfig);

    // Engagement tracking (fire-and-forget, non-blocking)
    void (async () => {
      try {
        await trackMessage(message);
      } catch (err) {
        logError('Engagement tracking failed', {
          channelId: message.channel.id,
          userId: message.author.id,
          error: err?.message,
        });
      }
    })();

    // XP gain (fire-and-forget, non-blocking)
    void (async () => {
      try {
        await handleXpGain(message);
      } catch (err) {
        logError('XP gain handler failed', {
          userId: message.author.id,
          guildId: message.guild.id,
          error: err?.message,
        });
      }
    })();

    // AI chat — mode-based routing (off / mention / vibe)
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

      // Check if in allowed channel (if configured) — backward compat whitelist.
      // When inside a thread, check the parent channel ID against the allowlist
      // so thread replies aren't blocked by the whitelist.
      const allowedChannels = guildConfig.ai?.channels || [];
      const channelIdToCheck = message.channel.isThread?.()
        ? message.channel.parentId
        : message.channel.id;
      const isAllowedChannel =
        allowedChannels.length === 0 || allowedChannels.includes(channelIdToCheck);

      // Resolve per-channel mode (off/mention/vibe).
      // getChannelMode already handles blockedChannelIds internally.
      const parentId = message.channel.isThread?.() ? message.channel.parentId : null;
      const mode = getChannelMode(message.channel.id, parentId, message.guild.id);

      // 'off' → No AI at all (no accumulate, no evaluate)
      if (mode === 'off') {
        clearChannelState(message.channel.id);
        return;
      }

      // Backward-compat: isChannelBlocked is now folded into getChannelMode,
      // but keep the explicit call as a safety net for any callers that bypass mode.
      if (isChannelBlocked(message.channel.id, parentId, message.guild.id)) return;

      /**
       * Helper: run quiet-mode command handler + quiet-mode gate + evaluateNow.
       * Used by both 'mention' and 'vibe' paths when isMentioned || isReply.
       */
      const handleDirectMention = async () => {
        // Quiet mode: handle commands first (even during quiet mode so users can unquiet)
        if (isMentioned) {
          try {
            const wasQuietCommand = await handleQuietCommand(message, guildConfig);
            if (wasQuietCommand) return true; // signal caller to return
          } catch (qmErr) {
            logError('Quiet mode command handler failed', {
              channelId: message.channel.id,
              userId: message.author.id,
              error: qmErr?.message,
            });
          }
        }

        // Quiet mode: suppress AI responses when quiet mode is active (gated on feature enabled)
        if (guildConfig.quietMode?.enabled) {
          try {
            if (await isQuietMode(message.guild.id, message.channel.id)) return true;
          } catch (qmErr) {
            logError('Quiet mode check failed', {
              channelId: message.channel.id,
              error: qmErr?.message,
            });
          }
        }

        // Accumulate the message into the triage buffer (for context).
        // Even bare @mentions with no text go through triage so the classifier
        // can use recent channel history to produce a meaningful response.
        // Await to ensure message is in buffer before forced triage.
        try {
          await accumulateMessage(message, guildConfig);
        } catch (accErr) {
          logError('Failed to accumulate message for triage', {
            channelId: message.channel.id,
            error: accErr?.message,
          });
          return true;
        }

        // Show typing indicator immediately so the user sees feedback
        void (async () => {
          try {
            await message.channel.sendTyping();
          } catch {
            // Silently ignore typing indicator failures
          }
        })();

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

        return true; // handled
      };

      if (mode === 'mention') {
        // Only respond to @mentions/replies (current default behavior)
        if ((isMentioned || isReply) && isAllowedChannel) {
          await handleDirectMention();
        }
        return;
      } else if (mode === 'vibe') {
        if ((isMentioned || isReply) && isAllowedChannel) {
          // Direct mention in vibe mode → immediate evaluation
          const handled = await handleDirectMention();
          if (handled) return; // Don't accumulate again below
        }
        // In vibe mode, ALL messages (in allowed channels) get accumulated for triage.
        // Fall through to the accumulate block below.
        if (!isAllowedChannel) return;
      }
    }

    // Triage: accumulate message for periodic evaluation (fire-and-forget)
    // Gated on ai.enabled — this is the master kill-switch for all AI responses.
    // accumulateMessage also checks triage.enabled internally.
    // Skip accumulation when quiet mode is active in this channel (gated on feature enabled).
    if (guildConfig.ai?.enabled) {
      if (guildConfig.quietMode?.enabled) {
        try {
          if (await isQuietMode(message.guild.id, message.channel.id)) return;
        } catch (qmErr) {
          logError('Quiet mode check failed (accumulate)', {
            channelId: message.channel.id,
            error: qmErr?.message,
          });
        }
      }
      void (async () => {
        try {
          await accumulateMessage(message, guildConfig);
        } catch (err) {
          logError('Triage accumulate error', { error: err?.message });
        }
      })();
    }
  });
}
