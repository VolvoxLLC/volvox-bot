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
 * Entries are evicted by a periodic sweep and a max-size cap.
 */
const activeThreads = new Map();

/** Maximum number of entries in the activeThreads cache */
const MAX_CACHE_SIZE = 1000;

/** Eviction sweep interval in milliseconds (5 minutes) */
const EVICTION_INTERVAL_MS = 5 * 60 * 1000;

/** Default thread auto-archive duration in minutes */
const DEFAULT_AUTO_ARCHIVE_MINUTES = 60;

/** Default thread reuse window in milliseconds (30 minutes) */
const DEFAULT_REUSE_WINDOW_MS = 30 * 60 * 1000;

/** Maximum thread name length (Discord limit) */
const MAX_THREAD_NAME_LENGTH = 100;

/** Discord's allowed autoArchiveDuration values (minutes) */
const VALID_AUTO_ARCHIVE_DURATIONS = [60, 1440, 4320, 10080];

/**
 * Snap a value to the nearest valid Discord autoArchiveDuration.
 * @param {number} minutes - Desired archive duration in minutes
 * @returns {number} Nearest valid Discord autoArchiveDuration
 */
export function snapAutoArchiveDuration(minutes) {
  if (typeof minutes !== 'number' || Number.isNaN(minutes) || minutes <= 0) {
    return DEFAULT_AUTO_ARCHIVE_MINUTES;
  }
  let closest = VALID_AUTO_ARCHIVE_DURATIONS[0];
  let minDiff = Math.abs(minutes - closest);
  for (const valid of VALID_AUTO_ARCHIVE_DURATIONS) {
    const diff = Math.abs(minutes - valid);
    if (diff < minDiff) {
      minDiff = diff;
      closest = valid;
    }
  }
  return closest;
}

/**
 * Retrieve threading configuration derived from the bot config, falling back to sensible defaults.
 * @param {string} [guildId] - Guild ID for per-guild config
 * @returns {{ enabled: boolean, autoArchiveMinutes: number, reuseWindowMs: number }} An object where `enabled` is `true` if threading is enabled; `autoArchiveMinutes` is the thread auto-archive duration in minutes; and `reuseWindowMs` is the thread reuse window in milliseconds.
 */
export function getThreadConfig(guildId) {
  try {
    const config = getConfig(guildId);
    const threadMode = config?.ai?.threadMode;

    const rawArchive = threadMode?.autoArchiveMinutes;
    const autoArchiveMinutes = snapAutoArchiveDuration(
      typeof rawArchive === 'number' && !Number.isNaN(rawArchive)
        ? rawArchive
        : DEFAULT_AUTO_ARCHIVE_MINUTES,
    );

    const rawReuse = threadMode?.reuseWindowMinutes;
    const reuseMinutes =
      typeof rawReuse === 'number' && !Number.isNaN(rawReuse) && rawReuse > 0 ? rawReuse : 30;

    return {
      enabled: threadMode?.enabled ?? false,
      autoArchiveMinutes,
      reuseWindowMs: reuseMinutes * 60 * 1000,
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
 * Determine whether a given Discord message should be handled in a thread.
 * @param {import('discord.js').Message} message - The message to evaluate.
 * @returns {boolean} `true` if the message is eligible for thread handling, `false` otherwise.
 */
export function shouldUseThread(message) {
  const threadConfig = getThreadConfig(message.guild?.id);
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
 * Determines whether the bot can create public threads and send messages in threads for the message's channel.
 * @param {import('discord.js').Message} message - The triggering Discord message.
 * @returns {boolean} `true` if the bot has CreatePublicThreads and SendMessagesInThreads permissions in the channel and the message is in a guild, `false` otherwise.
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
 * Build a Discord thread name from a user's display name and the first line of their message.
 * @param {string} username - The user's display name used as a prefix.
 * @param {string} messageContent - The cleaned message content; only its first line is used.
 * @returns {string} The constructed thread name, truncated to fit Discord's length limit.
 */
export function generateThreadName(username, messageContent) {
  // Use first line of message content, truncated
  const firstLine = messageContent.split('\n')[0].trim();

  // Clamp username to leave room for at least a few content chars or the fallback format
  const maxUsernameLength = MAX_THREAD_NAME_LENGTH - 10; // reserve 10 chars minimum
  const safeUsername =
    username.length > maxUsernameLength
      ? `${username.substring(0, maxUsernameLength - 1)}…`
      : username;

  let name;
  if (firstLine.length > 0) {
    const prefix = `${safeUsername}: `;
    const maxContentLength = MAX_THREAD_NAME_LENGTH - prefix.length;
    if (maxContentLength <= 0) {
      // Username is so long that even with truncation we can't fit content — use fallback
      name = `Chat with ${safeUsername}`;
    } else {
      const truncatedContent =
        firstLine.length > maxContentLength
          ? `${firstLine.substring(0, maxContentLength - 1)}…`
          : firstLine;
      name = `${prefix}${truncatedContent}`;
    }
  } else {
    name = `Chat with ${safeUsername}`;
  }

  // Final safety clamp — should never be needed but guarantees the contract
  if (name.length > MAX_THREAD_NAME_LENGTH) {
    name = `${name.substring(0, MAX_THREAD_NAME_LENGTH - 1)}…`;
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
 * Locate a previously cached thread for the message author in the same channel and prepare it for reuse.
 *
 * If a valid, non-expired thread is found it will be returned; the function will update the thread's last-active timestamp
 * and attempt to unarchive the thread if necessary. Stale, missing, or inaccessible entries are removed from the cache.
 * @param {import('discord.js').Message} message - The triggering Discord message (used to identify user and channel).
 * @returns {Promise<import('discord.js').ThreadChannel|null>} `ThreadChannel` if a reusable thread was found and prepared, `null` otherwise.
 */
export async function findExistingThread(message) {
  const threadConfig = getThreadConfig(message.guild?.id);
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
 * Start a new thread for the triggering message and record it for reuse.
 * @param {import('discord.js').Message} message - The message that triggers thread creation.
 * @param {string} cleanContent - The cleaned message content used to generate the thread name.
 * @returns {Promise<import('discord.js').ThreadChannel>} The created thread channel.
 */
export async function createThread(message, cleanContent) {
  const threadConfig = getThreadConfig(message.guild?.id);
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
 * Obtain an existing thread for the user in the channel or create a new one for the AI conversation.
 * @param {import('discord.js').Message} message - The triggering message.
 * @param {string} cleanContent - Cleaned content used to generate the thread name when creating a new thread.
 * @returns {Promise<{ thread: import('discord.js').ThreadChannel|null, isNew: boolean }>} An object containing the thread to use (or `null` if threading was skipped) and `isNew` set to `true` when a new thread was created, `false` otherwise.
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

  // Serialize concurrent calls for the same user+channel to prevent duplicate threads
  const key = buildThreadKey(message.author.id, message.channel.id);
  const pending = pendingThreadCreations.get(key);
  if (pending) {
    // Another call is already in flight — wait for it, then try to reuse its result
    await pending.catch(() => {}); // ignore errors from the other call
    const existingThread = await findExistingThread(message);
    if (existingThread) {
      return { thread: existingThread, isNew: false };
    }
    // The other call failed or expired — fall through to create our own
  }

  const resultPromise = _getOrCreateThreadInner(message, cleanContent);
  pendingThreadCreations.set(key, resultPromise);
  try {
    return await resultPromise;
  } finally {
    // Only delete if it's still our promise (not replaced by another call)
    if (pendingThreadCreations.get(key) === resultPromise) {
      pendingThreadCreations.delete(key);
    }
  }
}

/**
 * Internal implementation of getOrCreateThread (without locking).
 * @private
 */
async function _getOrCreateThreadInner(message, cleanContent) {
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
 * Sweep expired entries from the activeThreads cache.
 * Removes entries older than the configured reuse window and
 * enforces the MAX_CACHE_SIZE cap by evicting oldest entries.
 */
export function sweepExpiredThreads() {
  const config = getThreadConfig();
  const now = Date.now();

  // Remove expired entries
  for (const [key, entry] of activeThreads) {
    if (now - entry.lastActive > config.reuseWindowMs) {
      activeThreads.delete(key);
    }
  }

  // Enforce max-size cap — evict oldest entries first
  if (activeThreads.size > MAX_CACHE_SIZE) {
    const entries = [...activeThreads.entries()].sort((a, b) => a[1].lastActive - b[1].lastActive);
    const toRemove = entries.slice(0, activeThreads.size - MAX_CACHE_SIZE);
    for (const [key] of toRemove) {
      activeThreads.delete(key);
    }
  }
}

/**
 * Per-key lock map to prevent concurrent thread creation for the same user+channel.
 * Maps cache key -> Promise that resolves when the in-flight getOrCreateThread completes.
 * @type {Map<string, Promise>}
 */
const pendingThreadCreations = new Map();

/** Timer ID for the periodic eviction sweep */
let evictionTimer = null;

/**
 * Start the periodic eviction sweep (idempotent).
 */
export function startEvictionTimer() {
  if (evictionTimer) return;
  evictionTimer = setInterval(sweepExpiredThreads, EVICTION_INTERVAL_MS);
  // Allow the Node.js process to exit even if the timer is running
  if (evictionTimer.unref) evictionTimer.unref();
}

/**
 * Stop the periodic eviction sweep (for testing / shutdown).
 */
export function stopEvictionTimer() {
  if (evictionTimer) {
    clearInterval(evictionTimer);
    evictionTimer = null;
  }
}

// Start the eviction timer on module load
startEvictionTimer();

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
