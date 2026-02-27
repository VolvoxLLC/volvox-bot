/**
 * TLDR Command
 * AI-powered conversation summarizer for Discord channels.
 * Summarizes recent messages into key topics, decisions, action items, and links.
 */

import Anthropic from '@anthropic-ai/sdk';
import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { info, error as logError } from '../logger.js';
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

/** System prompt for summarization */
const SYSTEM_PROMPT =
  'Summarize this Discord conversation. Extract: 1) Key topics discussed, 2) Decisions made, 3) Action items, 4) Notable links shared. Be concise.';

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
  if (elapsed >= cooldownSeconds) return { onCooldown: false, remainingSeconds: 0 };
  return { onCooldown: true, remainingSeconds: Math.ceil(cooldownSeconds - elapsed) };
}

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
    const fetched = await channel.messages.fetch({ limit: maxMessages });
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
  const fetched = await channel.messages.fetch({ limit });
  const sorted = [...fetched.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  const lines = sorted
    .filter((m) => m.content && !m.author.bot)
    .map((m) => `[${formatTime(m.createdAt)}] ${m.author.username}: ${m.content}`);

  return { text: lines.join('\n'), messageCount: lines.length };
}

/**
 * Call Claude to summarize a conversation.
 * @param {string} conversationText
 * @returns {Promise<string>} Raw summary text from Claude
 */
async function summarizeWithAI(conversationText) {
  const client = new Anthropic();
  const truncated = conversationText.slice(0, MAX_INPUT_CHARS);

  const response = await client.messages.create({
    model: SUMMARIZE_MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: truncated }],
  });

  return response.content[0]?.text ?? '';
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

    // Mark cooldown before AI call
    cooldownMap.set(channelId, Date.now());

    // Call AI
    const summary = await summarizeWithAI(conversationText);

    if (!summary) {
      return await safeEditReply(interaction, '❌ Failed to generate summary.');
    }

    // Build embed
    const embed = buildEmbed(summary, messageCount, channel.name ?? channelId);

    await safeEditReply(interaction, { embeds: [embed] });
  } catch (err) {
    logError('TLDR command failed', { error: err.message, stack: err.stack });
    await safeEditReply(interaction, '❌ Failed to summarize messages. Please try again later.');
  }
}

export { cooldownMap };
