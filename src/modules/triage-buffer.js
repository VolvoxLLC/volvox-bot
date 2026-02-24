/**
 * Triage Buffer Management
 * Per-channel message ring buffers with LRU eviction.
 */

import { warn } from '../logger.js';

// ── Constants ────────────────────────────────────────────────────────────────

/** Maximum number of tracked channel buffers before LRU eviction kicks in. */
export const MAX_TRACKED_CHANNELS = 100;

/** Inactivity threshold (ms) after which a channel buffer is eligible for eviction. */
export const CHANNEL_INACTIVE_MS = 30 * 60 * 1000; // 30 minutes

// ── Per-channel state ────────────────────────────────────────────────────────
/**
 * @typedef {Object} BufferEntry
 * @property {string} author - Discord username
 * @property {string} content - Message content
 * @property {string} userId - Discord user ID
 * @property {string} messageId - Discord message ID
 * @property {number} timestamp - Message creation timestamp (ms)
 * @property {{author: string, userId: string, content: string, messageId: string}|null} replyTo - Referenced message context
 */

/**
 * @typedef {Object} ChannelState
 * @property {BufferEntry[]} messages - Ring buffer of messages
 * @property {ReturnType<typeof setTimeout>|null} timer - Dynamic interval timer
 * @property {number} lastActivity - Timestamp of last activity
 * @property {boolean} evaluating - Concurrent evaluation guard
 * @property {boolean} pendingReeval - Flag to re-trigger evaluation after current completes
 * @property {AbortController|null} abortController - For cancelling in-flight evaluations
 */

/** @type {Map<string, ChannelState>} */
export const channelBuffers = new Map();

// ── LRU eviction ─────────────────────────────────────────────────────────────

/**
 * Remove stale channel states and trim the channel buffer map to the allowed capacity.
 *
 * Iterates tracked channels and clears any whose last activity is older than
 * CHANNEL_INACTIVE_MS. If the total tracked channels still exceeds
 * MAX_TRACKED_CHANNELS, evicts the oldest channels by lastActivity until the
 * count is at or below the limit.
 */
export function evictInactiveChannels() {
  const now = Date.now();
  for (const [channelId, buf] of channelBuffers) {
    if (now - buf.lastActivity > CHANNEL_INACTIVE_MS) {
      clearChannelState(channelId);
    }
  }

  // If still over limit, evict oldest
  if (channelBuffers.size > MAX_TRACKED_CHANNELS) {
    const entries = [...channelBuffers.entries()].sort(
      (a, b) => a[1].lastActivity - b[1].lastActivity,
    );
    const toEvict = entries.slice(0, channelBuffers.size - MAX_TRACKED_CHANNELS);
    for (const [channelId] of toEvict) {
      clearChannelState(channelId);
    }
  }
}

// ── Channel state management ─────────────────────────────────────────────────

/**
 * Clear triage state for a channel and stop any scheduled or in-flight evaluation.
 * Cancels the channel's timer, aborts any active evaluation, and removes its
 * buffer from tracking.
 * @param {string} channelId - ID of the channel whose triage state will be cleared.
 */
export function clearChannelState(channelId) {
  const buf = channelBuffers.get(channelId);
  if (buf) {
    if (buf.timer) {
      clearTimeout(buf.timer);
    }
    if (buf.abortController) {
      buf.abortController.abort();
    }
    channelBuffers.delete(channelId);
  }
}

/**
 * Get or create the buffer state for a channel.
 * @param {string} channelId - The channel ID
 * @returns {ChannelState} The channel state
 */
export function getBuffer(channelId) {
  if (!channelBuffers.has(channelId)) {
    evictInactiveChannels();
    channelBuffers.set(channelId, {
      messages: [],
      timer: null,
      lastActivity: Date.now(),
      evaluating: false,
      pendingReeval: false,
      abortController: null,
    });
  }
  const buf = channelBuffers.get(channelId);
  buf.lastActivity = Date.now();
  return buf;
}

/**
 * Remove evaluated messages from a channel's buffer by their IDs.
 * Messages accumulated during evaluation are preserved for re-evaluation.
 * @param {string} channelId - The channel to clear
 * @param {Set<string>} snapshotIds - Message IDs to remove
 */
export function clearEvaluatedMessages(channelId, snapshotIds) {
  const buf = channelBuffers.get(channelId);
  if (buf) {
    buf.messages = buf.messages.filter((m) => !snapshotIds.has(m.messageId));
  }
}

/**
 * Atomically read and clear the pendingReeval flag for a channel.
 * Returns true if a re-evaluation was pending.
 * @param {string} channelId - The channel ID
 * @returns {boolean} Whether a re-evaluation was pending
 */
export function consumePendingReeval(channelId) {
  const buf = channelBuffers.get(channelId);
  if (!buf) return false;
  const pending = buf.pendingReeval;
  buf.pendingReeval = false;
  return pending;
}

/**
 * Append a buffer entry to a channel, trimming to maxBufferSize.
 * Emits a warning when truncation drops messages.
 * @param {string} channelId - The channel ID
 * @param {BufferEntry} entry - The message entry to append
 * @param {number} maxBufferSize - Maximum buffer capacity
 */
export function pushToBuffer(channelId, entry, maxBufferSize) {
  const buf = getBuffer(channelId);
  buf.messages.push(entry);

  const excess = buf.messages.length - maxBufferSize;
  if (excess > 0) {
    warn('Buffer truncation dropping messages', {
      channelId,
      dropped: excess,
      remaining: maxBufferSize,
    });
    buf.messages.splice(0, excess);
  }
}
