/**
 * announce Action Handler
 * Posts a level-up announcement to a channel with a rendered template.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/368
 */

import { info, warn } from '../../logger.js';
import { safeSend } from '../../utils/safeSend.js';
import { buildPayload } from './buildPayload.js';

/**
 * Resolve the target channel for the announcement.
 *
 * @param {Object} action - { channelMode, channelId }
 * @param {Object} context - Pipeline context
 * @returns {import('discord.js').TextBasedChannel|null}
 */
function resolveChannel(action, context) {
  const { message, guild } = context;
  const mode = action.channelMode ?? 'current';

  if (mode === 'none') return null;

  if (mode === 'specific') {
    const channelId = action.channelId;
    if (!channelId) {
      warn('announce action has channelMode "specific" but no channelId', {
        guildId: guild.id,
      });
      return null;
    }
    const channel = guild.channels?.cache?.get(channelId);
    if (!channel) {
      warn('announce target channel not found', {
        guildId: guild.id,
        channelId,
      });
      return null;
    }
    return channel;
  }

  // Default: "current" — same channel as the triggering message
  return message?.channel ?? null;
}

/**
 * Post an announcement to a channel.
 * Uses safeSend which handles splitting long messages automatically.
 *
 * @param {Object} action - { type: "announce", channelMode, channelId, format, template, embed }
 * @param {Object} context - Pipeline context
 */
export async function handleAnnounce(action, context) {
  const { guild, member } = context;

  const channel = resolveChannel(action, context);
  if (!channel) return;

  const payload = buildPayload(action, context.templateContext);

  try {
    await safeSend(channel, payload);
    info('Level-up announcement sent', {
      guildId: guild.id,
      userId: member.user?.id,
      channelId: channel.id,
    });
  } catch (err) {
    warn('Failed to send level-up announcement', {
      guildId: guild.id,
      userId: member.user?.id,
      channelId: channel.id,
      error: err.message,
    });
  }
}
