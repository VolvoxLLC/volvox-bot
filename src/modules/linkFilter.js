/**
 * Link Filter Module
 * Extracts URLs from messages and checks against a configurable domain blocklist.
 * Also detects phishing TLD patterns (.xyz with suspicious keywords).
 */

import { EmbedBuilder } from 'discord.js';
import { warn } from '../logger.js';
import { fetchChannelCached } from '../utils/discordCache.js';
import { isExempt } from '../utils/modExempt.js';
import { safeSend } from '../utils/safeSend.js';
import { sanitizeMentions } from '../utils/sanitizeMentions.js';

const PHISHING_KEYWORDS = [
  'discord',
  'nitro',
  'free',
  'gift',
  'giveaway',
  'steam',
  'crypto',
  'nft',
  'airdrop',
];
const COMMON_PHISHING_HOST_MARKERS = ['discord-nitro', 'discordnitro', 'free-nitro', 'steamgift'];
const LEADING_URL_DELIMITERS = new Set(['<', '(', '[', '{', '"', "'"]);
const TRAILING_URL_DELIMITERS = new Set([
  '>',
  ')',
  ']',
  '}',
  '"',
  "'",
  '.',
  ',',
  ';',
  ':',
  '!',
  '?',
]);
const MARKDOWN_LINK_URL_PATTERN = /\[[^\]\r\n]{0,512}\]\((https?:\/\/[^\s<>()]{1,2048})\)/giu;
const ANGLE_BRACKET_URL_PATTERN = /<(https?:\/\/[^\s<>]{1,2048})>/giu;
const EMBEDDED_URL_PATTERN = /https?:\/\/[^\s<>"'`[\]{}]{1,2048}/giu;

/**
 * Normalize a domain entry from the blocklist.
 * Lowercases the value and strips a leading "www." so that blocklist entries
 * are comparable to the already-normalized hostnames extracted by extractUrls().
 *
 * @param {string} domain
 * @returns {string}
 */
function stripLeadingWww(hostname) {
  const lower = hostname.toLowerCase();
  return lower.startsWith('www.') ? lower.slice(4) : lower;
}

function normalizeBlockedDomain(domain) {
  return stripLeadingWww(domain);
}

function trimUrlToken(token) {
  let start = 0;
  let end = token.length;

  while (start < end && LEADING_URL_DELIMITERS.has(token[start])) start += 1;
  while (end > start && TRAILING_URL_DELIMITERS.has(token[end - 1])) end -= 1;

  return token.slice(start, end);
}

function isValidHostname(hostname) {
  const labels = hostname.split('.');
  if (labels.length < 2) return false;
  const tld = labels.at(-1);
  if (!tld || tld.length < 2 || ![...tld].every((char) => char >= 'a' && char <= 'z')) {
    return false;
  }

  return labels.every((label) => {
    if (!label || label.length > 63 || label.startsWith('-') || label.endsWith('-')) return false;
    return [...label].every(
      (char) => (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9') || char === '-',
    );
  });
}

function parseUrlToken(token) {
  const trimmed = trimUrlToken(token);
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  const isExplicitUrl = lower.startsWith('http://') || lower.startsWith('https://');
  const candidate = isExplicitUrl ? trimmed : `http://${trimmed}`;

  try {
    const url = new URL(candidate);
    const hostname = stripLeadingWww(url.hostname);
    if (!isValidHostname(hostname)) return null;
    return {
      hostname,
      fullUrl: trimmed,
      pathname: url.pathname.toLowerCase(),
      search: url.search.toLowerCase(),
    };
  } catch {
    return null;
  }
}

function collectParsedUrls(content) {
  const parsedUrls = [];
  const seen = new Set();
  const tokens = content.split(/\s+/);

  const addCandidate = (candidate) => {
    const parsed = parseUrlToken(candidate);
    if (!parsed) return;

    const key = `${parsed.hostname}\u0000${parsed.fullUrl}`;
    if (seen.has(key)) return;

    seen.add(key);
    parsedUrls.push(parsed);
  };

  for (const match of content.matchAll(MARKDOWN_LINK_URL_PATTERN)) {
    addCandidate(match[1]);
  }

  for (const match of content.matchAll(ANGLE_BRACKET_URL_PATTERN)) {
    addCandidate(match[1]);
  }

  for (const token of tokens) {
    addCandidate(token);
  }

  for (const match of content.matchAll(EMBEDDED_URL_PATTERN)) {
    addCandidate(match[0]);
  }

  return parsedUrls;
}

/**
 * Extract all hostnames/domains from a message string.
 * @param {string} content
 * @returns {{ hostname: string, fullUrl: string }[]}
 */
export function extractUrls(content) {
  const results = [];
  const seen = new Set();

  for (const parsed of collectParsedUrls(content)) {
    if (!seen.has(parsed.hostname)) {
      seen.add(parsed.hostname);
      results.push({ hostname: parsed.hostname, fullUrl: parsed.fullUrl });
    }
  }

  return results;
}

/**
 * Check whether the content contains any phishing TLD patterns.
 * @param {string} content
 * @returns {string|null} matched pattern string or null
 */
export function matchPhishingPattern(content) {
  for (const parsed of collectParsedUrls(content)) {
    const hostAndPath = `${parsed.hostname}${parsed.pathname}${parsed.search}`;
    if (
      COMMON_PHISHING_HOST_MARKERS.some((marker) => parsed.hostname.includes(marker)) ||
      (parsed.hostname.endsWith('.xyz') &&
        PHISHING_KEYWORDS.some((keyword) => hostAndPath.includes(keyword)))
    ) {
      return parsed.fullUrl;
    }
  }
  return null;
}

/**
 * Alert the mod channel about a blocked link.
 * @param {import('discord.js').Message} message
 * @param {Object} config
 * @param {string} matchedDomain
 * @param {string} reason - 'blocklist' | 'phishing'
 */
async function alertModChannel(message, config, matchedDomain, reason) {
  const alertChannelId = config.moderation?.alertChannelId;
  if (!alertChannelId) return;

  const alertChannel = await fetchChannelCached(message.client, alertChannelId);
  if (!alertChannel) return;

  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle(
      `🔗 Suspicious Link ${reason === 'phishing' ? '(Phishing Pattern)' : '(Blocklisted Domain)'} Detected`,
    )
    .addFields(
      {
        name: 'User',
        value: `<@${message.author.id}> (${sanitizeMentions(message.author.tag)})`,
        inline: true,
      },
      { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
      { name: 'Matched', value: `\`${matchedDomain}\``, inline: true },
      { name: 'Content', value: sanitizeMentions(message.content.slice(0, 1000)) || '*empty*' },
    )
    .setTimestamp();

  await safeSend(alertChannel, { embeds: [embed] }).catch(() => {});
}

/**
 * Determines whether a message contains blocked or phishing-style links and removes the message and notifies moderators when a match is found.
 *
 * @param {import('discord.js').Message} message - The Discord message to inspect.
 * @param {Object} config - Merged guild configuration object.
 * @returns {Promise<{ blocked: boolean, domain?: string }>} `blocked: true` and the matched domain or pattern in `domain` when a link was blocked; otherwise `{ blocked: false }`.
 */
export async function checkLinks(message, config) {
  const lfConfig = config.moderation?.linkFilter ?? {};

  if (!lfConfig.enabled) return { blocked: false };
  if (isExempt(message, config)) return { blocked: false };

  const content = message.content;
  if (!content) return { blocked: false };

  // 1. Check phishing patterns first (fast regex, no list lookup needed)
  const phishingMatch = matchPhishingPattern(content);
  if (phishingMatch) {
    warn('Link filter: phishing pattern detected', {
      guildId: message.guild?.id,
      userId: message.author.id,
      channelId: message.channel.id,
      match: phishingMatch,
    });
    await message.delete().catch(() => {});
    await alertModChannel(message, config, phishingMatch, 'phishing');
    return { blocked: true, domain: phishingMatch };
  }

  // 2. Check extracted URLs against the configurable domain blocklist.
  //    Normalize each blocklist entry (lowercase, strip www.) so that
  //    mixed-case or www-prefixed config entries match correctly.
  const rawBlockedDomains = lfConfig.blockedDomains ?? [];
  if (rawBlockedDomains.length === 0) return { blocked: false };

  // Normalize once; use a Set for O(1) exact matches and a deduplicated array for
  // subdomain-suffix checks (both operations in one pass over blockedDomains).
  const normalizedDomains = rawBlockedDomains.map(normalizeBlockedDomain);
  const blockedSet = new Set(normalizedDomains);

  const urls = extractUrls(content);
  for (const { hostname, fullUrl } of urls) {
    // Fast O(1) exact match first; fall back to O(n) suffix scan for subdomains
    // (e.g. "evil.com" also catches "sub.evil.com").
    const matchedRule = blockedSet.has(hostname)
      ? hostname
      : normalizedDomains.find((blocked) => hostname.endsWith(`.${blocked}`));

    if (matchedRule) {
      warn('Link filter: blocked domain detected', {
        guildId: message.guild?.id,
        userId: message.author.id,
        channelId: message.channel.id,
        hostname,
        blockedRule: matchedRule,
      });
      await message.delete().catch(() => {});
      await alertModChannel(message, config, hostname || fullUrl, 'blocklist');
      return { blocked: true, domain: matchedRule };
    }
  }

  return { blocked: false };
}
