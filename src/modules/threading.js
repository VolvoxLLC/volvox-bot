/**
 * Threading Module
 * Manages Discord thread creation and reuse for AI conversations.
 *
 * When the bot is @mentioned in a regular channel, instead of replying inline,
 * it creates (or reuses) a thread and continues the conversation there.
 * This keeps channels clean while preserving conversation context.
 */

import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { info, error as logError, warn } from '../logger.js';
import { getConfig } from './config.js';

/**
 * Active thread tracker: Map<`${userId}:${channelId}`, { threadId, lastActive, threadName }>
 * Tracks which thread to reuse for a given user+channel combination.
 */
const activeThreads = new Map();

/** Default thread auto-archive duration in minutes */
const DEFAULT_AUTO_ARCHIVE_MINUTES = 60;

/** Default thread reuse window in milliseconds (30 minutes) */
const DEFAULT_REUSE_WINDOW_MS = 30 * 60 * 1000;

/** Maximum thread name length (Discord limit) */
const MAX_THREAD_NAME_LENGTH = 100;

/**
 * Get threading configuration from bot config
 * @returns {{ enabled: boolean, autoArchiveMinutes: number, reuseWindowMs: number }}
 */
export function getThreadConfig() {
  try {
    const config = getConfig();
    const threadMode = config?.ai?.threadMode;
    return {
      enabled: threadMode?.enabled ?? false,
      autoArchiveMinutes: threadMode?.autoArchiveMinutes ?? DEFAULT_AUTO_ARCHIVE_MINUTES,
      reuseWindowMs: (threadMode?.reuseWindowMinutes ?? 30) * 60 * 1000,
    };
  } catch {
    return {
      enabled: false,
      autoArchiveMinutes: DEFAULT_AUTO_ARCHIVE_MINUTES,
      reuseWindowMs: DEFAULT_REUSE_WINDOW_MS,
    };
  }
}

/**
 * Check if a message should be handled via threading
 * @param {import('discord.js').Message} message - Discord message
 * @returns {boolean} Whether threading should be used
 */
export function shouldUseThread(message) {
  const threadConfig = getThreadConfig();
  if (!threadConfig.enabled) return false;

  // Don't create threads in DMs
  if (!message.guild) return false;

  // Don't create threads inside existing threads — reply inline
  if (message.channel.isThread()) return false;

  // Channel must be a text-based guild channel that supports threads
  const threadableTypes = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
  if (!threadableTypes.includes(message.channel.type)) return false;

  return true;
}

/**
 * Check if the bot has permission to create threads in a channel
 * @param {import('discord.js').Message} message - Discord message
 * @returns {boolean} Whether the bot can create threads
 */
export function canCreateThread(message) {
  if (!message.guild) return false;

  try {
    const botMember = message.guild.members.me;
    if (!botMember) return false;

    const permissions = message.channel.permissionsFor(botMember);
    if (!permissions) return false;

    return (
      permissions.has(PermissionFlagsBits.CreatePublicThreads) &&
      permissions.has(PermissionFlagsBits.SendMessagesInThreads)
    );
  } catch (err) {
    warn('Failed to check thread permissions', { error: err.message });
    return false;
  }
}

/**
 * Generate a thread name from the user message
 * Truncates to Discord's limit and sanitizes
 * @param {string} username - The user's display name
 * @param {string} messageContent - The cleaned message content
 * @returns {string} Thread name
 */
export function generateThreadName(username, messageContent) {
  // Use first line of message content, truncated
  const firstLine = messageContent.split('\n')[0].trim();

  let name;
  if (firstLine.length > 0) {
    // Truncate to fit within Discord's limit with username prefix
    const prefix = `${username}: `;
    const maxContentLength = MAX_THREAD_NAME_LENGTH - prefix.length;
    const truncatedContent =
      firstLine.length > maxContentLength
        ? `${firstLine.substring(0, maxContentLength - 1)}…`
        : firstLine;
    name = `${prefix}${truncatedContent}`;
  } else {
    name = `Chat with ${username}`;
  }

  return name;
}

/**
 * Build the cache key for active thread tracking
 * @param {string} userId - User ID
 * @param {string} channelId - Channel ID
 * @returns {string} Cache key
 */
export function buildThreadKey(userId, channelId) {
  return `${userId}:${channelId}`;
}

/**
 * Find an existing thread to reuse for this user+channel combination
 * @param {import('discord.js').Message} message - Discord message
 * @returns {Promise<import('discord.js').ThreadChannel|null>} Thread to reuse, or null
 */
export async function findExistingThread(message) {
  const threadConfig = getThreadConfig();
  const key = buildThreadKey(message.author.id, message.channel.id);
  const entry = activeThreads.get(key);

  if (!entry) return null;

  // Check if the thread is still within the reuse window
  const now = Date.now();
  if (now - entry.lastActive > threadConfig.reuseWindowMs) {
    activeThreads.delete(key);
    return null;
  }

  // Try to fetch the thread — it may have been deleted or archived
  try {
    const thread = await message.channel.threads.fetch(entry.threadId);
    if (!thread) {
      activeThreads.delete(key);
      return null;
    }

    // If thread is archived, try to unarchive it
    if (thread.archived) {
      try {
        await thread.setArchived(false);
        info('Unarchived thread for reuse', {
          threadId: thread.id,
          userId: message.author.id,
        });
      } catch (err) {
        warn('Failed to unarchive thread, creating new one', {
          threadId: thread.id,
          error: err.message,
        });
        activeThreads.delete(key);
        return null;
      }
    }

    // Update last active time
    entry.lastActive = now;
    return thread;
  } catch (_err) {
    // Thread not found or inaccessible
    activeThreads.delete(key);
    return null;
  }
}

/**
 * Create a new thread for the conversation
 * @param {import('discord.js').Message} message - The triggering message
 * @param {string} cleanContent - The cleaned message content (mention removed)
 * @returns {Promise<import('discord.js').ThreadChannel>} The created thread
 */
export async function createThread(message, cleanContent) {
  const threadConfig = getThreadConfig();
  const threadName = generateThreadName(
    message.author.displayName || message.author.username,
    cleanContent,
  );

  const thread = await message.startThread({
    name: threadName,
    autoArchiveDuration: threadConfig.autoArchiveMinutes,
  });

  // Track this thread for reuse
  const key = buildThreadKey(message.author.id, message.channel.id);
  activeThreads.set(key, {
    threadId: thread.id,
    lastActive: Date.now(),
    threadName,
  });

  info('Created conversation thread', {
    threadId: thread.id,
    threadName,
    userId: message.author.id,
    channelId: message.channel.id,
  });

  return thread;
}

/**
 * Get or create a thread for a user's AI conversation
 * Returns the thread to respond in, or null if threading should be skipped (fallback to inline)
 * @param {import('discord.js').Message} message - The triggering message
 * @param {string} cleanContent - The cleaned message content
 * @returns {Promise<{ thread: import('discord.js').ThreadChannel|null, isNew: boolean }>}
 */
export async function getOrCreateThread(message, cleanContent) {
  // Check permissions first
  if (!canCreateThread(message)) {
    warn('Missing thread creation permissions, falling back to inline reply', {
      channelId: message.channel.id,
      guildId: message.guild.id,
    });
    return { thread: null, isNew: false };
  }

  // Try to reuse an existing thread
  const existingThread = await findExistingThread(message);
  if (existingThread) {
    info('Reusing existing thread', {
      threadId: existingThread.id,
      userId: message.author.id,
      channelId: message.channel.id,
    });
    return { thread: existingThread, isNew: false };
  }

  // Create a new thread
  try {
    const thread = await createThread(message, cleanContent);
    return { thread, isNew: true };
  } catch (err) {
    logError('Failed to create thread, falling back to inline reply', {
      channelId: message.channel.id,
      error: err.message,
    });
    return { thread: null, isNew: false };
  }
}

/**
 * Get the active threads map (for testing)
 * @returns {Map} Active threads map
 */
export function getActiveThreads() {
  return activeThreads;
}

/**
 * Clear all active thread tracking (for testing)
 */
export function clearActiveThreads() {
  activeThreads.clear();
}
