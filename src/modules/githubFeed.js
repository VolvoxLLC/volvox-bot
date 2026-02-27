/**
 * GitHub Activity Feed Module
 * Polls GitHub repos and posts activity embeds to a Discord channel.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/51
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { EmbedBuilder } from 'discord.js';
import { getPool } from '../db.js';
import { info, error as logError, warn as logWarn } from '../logger.js';
import { safeSend } from '../utils/safeSend.js';
import { getConfig } from './config.js';

const execFileAsync = promisify(execFile);

/** @type {ReturnType<typeof setInterval> | null} */
let feedInterval = null;

/** @type {ReturnType<typeof setTimeout> | null} */
let firstPollTimeout = null;

/** Re-entrancy guard */
let pollInFlight = false;

/**
 * Fetch recent GitHub events for a repo via the `gh` CLI.
 *
 * @param {string} owner - GitHub owner (user or org)
 * @param {string} repo - Repository name
 * @returns {Promise<object[]>} Array of event objects (up to 10)
 */
export async function fetchRepoEvents(owner, repo) {
  const { stdout } = await execFileAsync(
    'gh',
    ['api', `repos/${owner}/${repo}/events?per_page=10`],
    { timeout: 30_000 },
  );
  const text = stdout.trim();
  if (!text) return [];
  return JSON.parse(text);
}

/**
 * Build a Discord embed for a PullRequestEvent.
 *
 * @param {object} event - GitHub event object
 * @returns {EmbedBuilder|null} Embed or null if action not handled
 */
export function buildPrEmbed(event) {
  const pr = event.payload?.pull_request;
  const action = event.payload?.action;
  if (!pr) return null;

  let color;
  let actionLabel;

  if (action === 'opened') {
    color = 0x2ecc71; // green
    actionLabel = 'opened';
  } else if (action === 'closed' && pr.merged) {
    color = 0x9b59b6; // purple
    actionLabel = 'merged';
  } else if (action === 'closed') {
    color = 0xe74c3c; // red
    actionLabel = 'closed';
  } else {
    return null;
  }

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`[PR #${pr.number}] ${pr.title}`)
    .setURL(pr.html_url)
    .setAuthor({ name: event.actor?.login || 'unknown', iconURL: event.actor?.avatar_url })
    .addFields(
      { name: 'Action', value: actionLabel, inline: true },
      { name: 'Repo', value: event.repo?.name || 'unknown', inline: true },
    )
    .setTimestamp(new Date(event.created_at));

  if (pr.additions !== undefined && pr.deletions !== undefined) {
    embed.addFields({
      name: 'Changes',
      value: `+${pr.additions} / -${pr.deletions}`,
      inline: true,
    });
  }

  return embed;
}

/**
 * Build a Discord embed for an IssuesEvent.
 *
 * @param {object} event - GitHub event object
 * @returns {EmbedBuilder|null} Embed or null if action not handled
 */
export function buildIssueEmbed(event) {
  const issue = event.payload?.issue;
  const action = event.payload?.action;
  if (!issue) return null;

  let color;
  let actionLabel;

  if (action === 'opened') {
    color = 0x3498db; // blue
    actionLabel = 'opened';
  } else if (action === 'closed') {
    color = 0xe74c3c; // red
    actionLabel = 'closed';
  } else {
    return null;
  }

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`[Issue #${issue.number}] ${issue.title}`)
    .setURL(issue.html_url)
    .setAuthor({ name: event.actor?.login || 'unknown', iconURL: event.actor?.avatar_url })
    .addFields(
      { name: 'Action', value: actionLabel, inline: true },
      { name: 'Repo', value: event.repo?.name || 'unknown', inline: true },
    )
    .setTimestamp(new Date(event.created_at));

  if (issue.labels?.length) {
    embed.addFields({
      name: 'Labels',
      value: issue.labels.map((l) => l.name).join(', '),
      inline: true,
    });
  }

  if (issue.assignee) {
    embed.addFields({ name: 'Assignee', value: issue.assignee.login, inline: true });
  }

  return embed;
}

/**
 * Build a Discord embed for a ReleaseEvent.
 *
 * @param {object} event - GitHub event object
 * @returns {EmbedBuilder|null} Embed or null if not a published release
 */
export function buildReleaseEmbed(event) {
  const release = event.payload?.release;
  if (!release) return null;

  const bodyPreview = release.body ? release.body.slice(0, 200) : '';

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f) // gold
    .setTitle(`🚀 Release: ${release.tag_name}`)
    .setURL(release.html_url)
    .setAuthor({ name: event.actor?.login || 'unknown', iconURL: event.actor?.avatar_url })
    .addFields({ name: 'Repo', value: event.repo?.name || 'unknown', inline: true })
    .setTimestamp(new Date(event.created_at));

  if (bodyPreview) {
    embed.addFields({ name: 'Notes', value: bodyPreview });
  }

  return embed;
}

/**
 * Build a Discord embed for a PushEvent.
 *
 * @param {object} event - GitHub event object
 * @returns {EmbedBuilder|null} Embed or null if no commits
 */
export function buildPushEmbed(event) {
  const payload = event.payload;
  if (!payload) return null;

  const commits = payload.commits || [];
  if (commits.length === 0) return null;

  // Extract branch name from ref (refs/heads/main → main)
  const branch = payload.ref ? payload.ref.replace('refs/heads/', '') : 'unknown';

  const commitLines = commits
    .slice(0, 3)
    .map((c) => `• \`${c.sha?.slice(0, 7) || '???????'}\` ${c.message?.split('\n')[0] || ''}`)
    .join('\n');

  const embed = new EmbedBuilder()
    .setColor(0x95a5a6) // gray
    .setTitle(`⬆️ Push to ${branch} (${commits.length} commit${commits.length !== 1 ? 's' : ''})`)
    .setAuthor({ name: event.actor?.login || 'unknown', iconURL: event.actor?.avatar_url })
    .addFields(
      { name: 'Repo', value: event.repo?.name || 'unknown', inline: true },
      { name: 'Branch', value: branch, inline: true },
      { name: 'Commits', value: commitLines || '—' },
    )
    .setTimestamp(new Date(event.created_at));

  return embed;
}

/**
 * Build an embed for a GitHub event based on its type.
 *
 * @param {object} event - GitHub event object
 * @param {string[]} enabledEvents - List of enabled event type keys ('pr','issue','release','push')
 * @returns {EmbedBuilder|null} Embed or null if type not handled / not enabled
 */
export function buildEmbed(event, enabledEvents) {
  switch (event.type) {
    case 'PullRequestEvent':
      if (!enabledEvents.includes('pr')) return null;
      return buildPrEmbed(event);
    case 'IssuesEvent':
      if (!enabledEvents.includes('issue')) return null;
      return buildIssueEmbed(event);
    case 'ReleaseEvent':
      if (!enabledEvents.includes('release')) return null;
      return buildReleaseEmbed(event);
    case 'PushEvent':
      if (!enabledEvents.includes('push')) return null;
      return buildPushEmbed(event);
    default:
      return null;
  }
}

/**
 * Poll a single guild's GitHub feed.
 *
 * @param {import('discord.js').Client} client - Discord client
 * @param {string} guildId - Guild ID
 * @param {object} feedConfig - Feed configuration section
 */
async function pollGuildFeed(client, guildId, feedConfig) {
  const pool = getPool();
  const channelId = feedConfig.channelId;
  const repos = feedConfig.repos || [];
  const enabledEvents = feedConfig.events || ['pr', 'issue', 'release', 'push'];

  if (!channelId) {
    logWarn('GitHub feed: no channelId configured', { guildId });
    return;
  }

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    logWarn('GitHub feed: channel not found', { guildId, channelId });
    return;
  }

  for (const repoFullName of repos) {
    const [owner, repo] = repoFullName.split('/');
    if (!owner || !repo) {
      logWarn('GitHub feed: invalid repo format', { guildId, repo: repoFullName });
      continue;
    }

    try {
      // Get last seen event ID from DB
      const { rows } = await pool.query(
        'SELECT last_event_id FROM github_feed_state WHERE guild_id = $1 AND repo = $2',
        [guildId, repoFullName],
      );
      const lastEventId = rows[0]?.last_event_id || null;

      // Fetch events
      const events = await fetchRepoEvents(owner, repo);

      // Filter to events newer than last seen (events are newest-first)
      const newEvents = lastEventId
        ? events.filter((e) => BigInt(e.id) > BigInt(lastEventId))
        : events.slice(0, 1); // first run: only latest to avoid spam

      if (newEvents.length === 0) {
        // Update poll time even if no new events
        await pool.query(
          `INSERT INTO github_feed_state (guild_id, repo, last_event_id, last_poll_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (guild_id, repo) DO UPDATE
             SET last_poll_at = NOW()`,
          [guildId, repoFullName, lastEventId || (events[0]?.id ?? null)],
        );
        continue;
      }

      // Process events oldest-first so they appear in chronological order
      const orderedEvents = [...newEvents].reverse();
      let newestId = lastEventId;

      for (const event of orderedEvents) {
        const embed = buildEmbed(event, enabledEvents);
        if (embed) {
          await safeSend(channel, { embeds: [embed] });
          info('GitHub feed: event posted', {
            guildId,
            repo: repoFullName,
            type: event.type,
            eventId: event.id,
          });
        }
        // Track newest ID regardless of whether we posted (skip unsupported types)
        if (!newestId || BigInt(event.id) > BigInt(newestId)) {
          newestId = event.id;
        }
      }

      // Upsert state with new last_event_id
      await pool.query(
        `INSERT INTO github_feed_state (guild_id, repo, last_event_id, last_poll_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (guild_id, repo) DO UPDATE
           SET last_event_id = $3, last_poll_at = NOW()`,
        [guildId, repoFullName, newestId],
      );
    } catch (err) {
      logError('GitHub feed: error polling repo', {
        guildId,
        repo: repoFullName,
        error: err.message,
      });
    }
  }
}

/**
 * Poll GitHub feeds for all guilds that have it enabled.
 *
 * @param {import('discord.js').Client} client - Discord client
 */
async function pollAllFeeds(client) {
  if (pollInFlight) return;
  pollInFlight = true;

  try {
    // Iterate over all guilds the bot is in
    for (const [guildId] of client.guilds.cache) {
      const config = getConfig(guildId);
      if (!config?.github?.feed?.enabled) continue;

      await pollGuildFeed(client, guildId, config.github.feed).catch((err) => {
        logError('GitHub feed: guild poll failed', { guildId, error: err.message });
      });
    }
  } catch (err) {
    logError('GitHub feed: poll error', { error: err.message });
  } finally {
    pollInFlight = false;
  }
}

/**
 * Start the GitHub feed polling interval.
 *
 * @param {import('discord.js').Client} client - Discord client
 */
export function startGithubFeed(client) {
  if (feedInterval) return;

  const defaultMinutes = 5;

  // Fixed 5-minute poll interval.
  const intervalMs = defaultMinutes * 60_000;

  // Kick off first poll after bot is settled (5s delay)
  firstPollTimeout = setTimeout(() => {
    firstPollTimeout = null;
    pollAllFeeds(client).catch((err) => {
      logError('GitHub feed: initial poll failed', { error: err.message });
    });
  }, 5_000);

  // Note: intervalMs is captured at setInterval creation time and does not change dynamically.
  feedInterval = setInterval(() => {
    pollAllFeeds(client).catch((err) => {
      logError('GitHub feed: poll failed', { error: err.message });
    });
  }, intervalMs);

  info('GitHub feed started');
}

/**
 * Stop the GitHub feed polling interval.
 */
export function stopGithubFeed() {
  if (firstPollTimeout) {
    clearTimeout(firstPollTimeout);
    firstPollTimeout = null;
  }
  if (feedInterval) {
    clearInterval(feedInterval);
    feedInterval = null;
    info('GitHub feed stopped');
  }
}
