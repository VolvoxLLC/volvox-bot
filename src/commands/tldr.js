/**
 * TLDR Command
 * AI-powered conversation summarizer for Discord channels.
 * Summarizes recent messages into key topics, decisions, action items, and links.
 */

import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { info, error as logError } from '../logger.js';
import { CLIProcess } from '../modules/cli-process.js';
import { getConfig } from '../modules/config.js';
import { safeEditReply } from '../utils/safeSend.js';

/** Colour for TLDR embeds (teal-ish) */
const EMBED_COLOR = 0x1abc9c;

/** Max chars to send to Claude to stay within context limits */
const MAX_INPUT_CHARS = 100_000;

/** Default number of messages to summarize */
const DEFAULT_MESSAGE_COUNT = 50;

/** Hard cap on messages fetchable */
const MAX_MESSAGE_COUNT = 200;

/** Cooldown tracking: channelId → last-used timestamp (ms) */
const cooldownMap = new Map();

/** Claude model for cost-efficient summarization */
const SUMMARIZE_MODEL = 'claude-haiku-4-5';

/** Default system prompt for summarization (used when no per-guild override is set) */
const DEFAULT_SYSTEM_PROMPT =
  'Summarize this Discord conversation. Extract: 1) Key topics discussed, 2) Decisions made, 3) Action items, 4) Notable links shared. Be concise.';

/** Short-lived CLIProcess for summarization (spawns a fresh process per call). */
const summarizerProcess = new CLIProcess('tldr-summarizer', {
  model: SUMMARIZE_MODEL,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  tools: '',
  permissionMode: 'bypassPermissions',
});

export const data = new SlashCommandBuilder()
  .setName('tldr')
  .setDescription('Summarize recent channel messages with AI')
  .addIntegerOption((opt) =>
    opt
      .setName('count')
      .setDescription(
        `Number of messages to summarize (default ${DEFAULT_MESSAGE_COUNT}, max ${MAX_MESSAGE_COUNT})`,
      )
      .setMinValue(1)
      .setMaxValue(MAX_MESSAGE_COUNT)
      .setRequired(false),
  )
  .addIntegerOption((opt) =>
    opt
      .setName('hours')
      .setDescription('Summarize messages from the last N hours')
      .setMinValue(1)
      .setMaxValue(168)
      .setRequired(false),
  );

/**
 * Check if the channel is on cooldown.
 * @param {string} channelId
 * @param {number} cooldownSeconds
 * @returns {{ onCooldown: boolean, remainingSeconds: number }}
 */
function checkCooldown(channelId, cooldownSeconds) {
  const last = cooldownMap.get(channelId);
  if (!last) return { onCooldown: false, remainingSeconds: 0 };
  const elapsed = (Date.now() - last) / 1000;
  if (elapsed >= cooldownSeconds) {
    cooldownMap.delete(channelId);
    return { onCooldown: false, remainingSeconds: 0 };
  }
  return { onCooldown: true, remainingSeconds: Math.ceil(cooldownSeconds - elapsed) };
}

// Evict stale cooldown entries every 10 minutes (prevent unbounded growth)
setInterval(() => {
  const cutoff = Date.now() - 3_600_000; // 1 hour
  for (const [id, ts] of cooldownMap) {
    if (ts < cutoff) cooldownMap.delete(id);
  }
}, 600_000).unref();

/**
 * Format a Date as HH:MM in UTC.
 * @param {Date} date
 * @returns {string}
 */
function formatTime(date) {
  const h = String(date.getUTCHours()).padStart(2, '0');
  const m = String(date.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/** Discord API hard limit for messages.fetch */
const DISCORD_FETCH_LIMIT = 100;

/**
 * Fetch messages from a channel, paginating when the requested amount exceeds
 * Discord's per-request cap of 100.
 * @param {import('discord.js').TextBasedChannel} channel
 * @param {number} total - Total number of messages to fetch
 * @returns {Promise<import('discord.js').Collection<string, import('discord.js').Message>>}
 */
async function fetchMessagesPaginated(channel, total) {
  if (total <= DISCORD_FETCH_LIMIT) {
    return channel.messages.fetch({ limit: total });
  }

  const allMessages = new Map();
  let remaining = total;
  let beforeId;

  while (remaining > 0) {
    const batchSize = Math.min(remaining, DISCORD_FETCH_LIMIT);
    const options = { limit: batchSize };
    if (beforeId) options.before = beforeId;

    const batch = await channel.messages.fetch(options);
    if (batch.size === 0) break;

    for (const [id, msg] of batch) allMessages.set(id, msg);
    beforeId = [...batch.keys()].pop();
    remaining -= batch.size;
  }

  return allMessages;
}

/**
 * Fetch and format messages from the channel.
 * @param {import('discord.js').TextBasedChannel} channel
 * @param {{ count?: number, hours?: number, defaultMessages: number, maxMessages: number }} opts
 * @returns {Promise<{ text: string, messageCount: number }>}
 */
async function fetchAndFormatMessages(channel, opts) {
  const { count, hours, defaultMessages, maxMessages } = opts;

  if (hours != null) {
    // Fetch recent messages and filter by time window
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    const fetched = await fetchMessagesPaginated(channel, maxMessages);
    const sorted = [...fetched.values()]
      .filter((m) => m.createdTimestamp >= cutoff)
      .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    const lines = sorted
      .filter((m) => m.content && !m.author.bot)
      .map((m) => `[${formatTime(m.createdAt)}] ${m.author.username}: ${m.content}`);

    return { text: lines.join('\n'), messageCount: lines.length };
  }

  // Fetch by count
  const limit = Math.min(count ?? defaultMessages, maxMessages);
  const fetched = await fetchMessagesPaginated(channel, limit);
  const sorted = [...fetched.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  const lines = sorted
    .filter((m) => m.content && !m.author.bot)
    .map((m) => `[${formatTime(m.createdAt)}] ${m.author.username}: ${m.content}`);

  return { text: lines.join('\n'), messageCount: lines.length };
}

/**
 * Call Claude via CLI subprocess to summarize a conversation.
 * Uses the same auth flow as AI chat (ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN).
 * @param {string} conversationText
 * @param {string} [systemPrompt] - Per-guild system prompt override
 * @returns {Promise<string>} Raw summary text from Claude
 */
async function summarizeWithAI(conversationText, systemPrompt) {
  const truncated = conversationText.slice(0, MAX_INPUT_CHARS);
  const overrides = systemPrompt ? { systemPrompt } : {};

  await summarizerProcess.start();
  const result = await summarizerProcess.send(truncated, overrides);
  return result.result ?? '';
}

/**
 * Parse the AI summary into structured sections.
 * Handles numbered lists like "1) Key topics discussed" or "1. Key topics"
 * and extracts bullet points under each section.
 * @param {string} summary
 * @returns {{ topics: string, decisions: string, actions: string, links: string }}
 */
function parseSummary(summary) {
  const sections = {
    topics: 'No key topics identified.',
    decisions: 'No decisions made.',
    actions: 'No action items.',
    links: 'No notable links.',
  };

  // Split on numbered section headers (e.g. "1)", "1.", "**1)")
  const sectionRegex =
    /(?:^|\n)\*{0,2}(?:\d+[.)]\s*)?(?:\*{0,2})(Key Topics?|Decisions? Made|Action Items?|Notable Links?)(?:\*{0,2})[:.]?\*{0,2}/gi;

  const parts = summary.split(sectionRegex);
  // parts will be: [preamble, header1, body1, header2, body2, ...]
  for (let i = 1; i < parts.length - 1; i += 2) {
    const header = parts[i].trim().toLowerCase();
    const body = parts[i + 1]?.trim() ?? '';
    const cleaned = body
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .join('\n');

    if (header.includes('topic')) sections.topics = cleaned || sections.topics;
    else if (header.includes('decision')) sections.decisions = cleaned || sections.decisions;
    else if (header.includes('action')) sections.actions = cleaned || sections.actions;
    else if (header.includes('link')) sections.links = cleaned || sections.links;
  }

  return sections;
}

/**
 * Build the rich embed from the AI summary.
 * @param {string} summary
 * @param {number} messageCount
 * @param {string} channelName
 * @returns {import('discord.js').EmbedBuilder}
 */
function buildEmbed(summary, messageCount, channelName) {
  const { topics, decisions, actions, links } = parseSummary(summary);

  const truncate = (str, max = 1024) => (str.length > max ? `${str.slice(0, max - 3)}...` : str);

  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle('📋 TL;DR Summary')
    .setDescription(
      `Summarized **${messageCount}** message${messageCount === 1 ? '' : 's'} in #${channelName}`,
    )
    .addFields(
      { name: '🗝️ Key Topics', value: truncate(topics) },
      { name: '✅ Decisions Made', value: truncate(decisions) },
      { name: '📌 Action Items', value: truncate(actions) },
      { name: '🔗 Notable Links', value: truncate(links) },
    )
    .setTimestamp();
}

/**
 * Execute the /tldr command.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const guildId = interaction.guildId;
    const config = getConfig(guildId);
    const tldrConfig = config?.tldr ?? {};

    // Check if feature is enabled
    if (tldrConfig.enabled === false) {
      return await safeEditReply(
        interaction,
        '❌ The /tldr command is not enabled on this server.',
      );
    }

    const cooldownSeconds = tldrConfig.cooldownSeconds ?? 300;
    const defaultMessages = tldrConfig.defaultMessages ?? DEFAULT_MESSAGE_COUNT;
    const maxMessages = tldrConfig.maxMessages ?? MAX_MESSAGE_COUNT;
    const channelId = interaction.channelId;

    // Rate limit check
    const { onCooldown, remainingSeconds } = checkCooldown(channelId, cooldownSeconds);
    if (onCooldown) {
      return await safeEditReply(
        interaction,
        `⏳ Please wait **${remainingSeconds}s** before using /tldr again in this channel.`,
      );
    }

    const channel = interaction.channel;
    const count = interaction.options.getInteger('count');
    const hours = interaction.options.getInteger('hours');

    // Fetch and format messages
    const { text: conversationText, messageCount } = await fetchAndFormatMessages(channel, {
      count,
      hours,
      defaultMessages,
      maxMessages,
    });

    if (messageCount === 0) {
      return await safeEditReply(interaction, '❌ No messages found to summarize.');
    }

    info('TLDR summarizing', { guildId, channelId, messageCount });

    // Call AI with per-guild system prompt if configured
    const summary = await summarizeWithAI(conversationText, tldrConfig.systemPrompt);

    if (!summary) {
      return await safeEditReply(interaction, '❌ Failed to generate summary.');
    }

    // Mark cooldown only after successful AI response
    cooldownMap.set(channelId, Date.now());

    // Build embed
    const embed = buildEmbed(summary, messageCount, channel.name ?? channelId);

    await safeEditReply(interaction, { embeds: [embed] });
  } catch (err) {
    logError('TLDR command failed', { error: err.message, stack: err.stack });
    await safeEditReply(interaction, '❌ Failed to summarize messages. Please try again later.');
  }
}

export { cooldownMap };
