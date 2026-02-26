/**
 * Link Filter Module
 * Extracts URLs from messages and checks against a configurable domain blocklist.
 * Also detects phishing TLD patterns (.xyz with suspicious keywords).
 */

import { EmbedBuilder } from 'discord.js';
import { warn } from '../logger.js';
import { isExempt } from '../utils/modExempt.js';
import { safeSend } from '../utils/safeSend.js';
import { sanitizeMentions } from '../utils/sanitizeMentions.js';

/**
 * Regex to extract URLs from message content.
 * Matches http/https URLs and bare domain.tld patterns.
 */
const URL_REGEX =
  /https?:\/\/(?:www\.)?([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z]{2,})+)(\/[^\s]*)?|(?:^|\s)(?:www\.)?([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z]{2,})+)(\/[^\s]*)?/gi;

/**
 * Phishing TLD patterns: .xyz links whose path/subdomain contains scam keywords.
 * Catches "discord-nitro-free.xyz", "free-nitro.xyz/claim", etc.
 */
const PHISHING_PATTERNS = [
  // .xyz domains with suspicious keywords anywhere in the URL
  /(?:discord|nitro|free|gift|giveaway|steam|crypto|nft|airdrop)[a-z0-9\-_.]*\.xyz(?:\/[^\s]*)?/i,
  // Any .xyz URL that contains those keywords in the path
  /[a-z0-9\-_.]+\.xyz\/[^\s]*(?:discord|nitro|free|gift|steam|crypto)[^\s]*/i,
  // Common phishing subdomains regardless of TLD
  /(?:discord-nitro|discordnitro|free-nitro|steamgift)\.[a-z]{2,}(?:\/[^\s]*)?/i,
];

/**
 * Normalize a domain entry from the blocklist.
 * Lowercases the value and strips a leading "www." so that blocklist entries
 * are comparable to the already-normalized hostnames extracted by extractUrls().
 *
 * @param {string} domain
 * @returns {string}
 */
function normalizeBlockedDomain(domain) {
  return domain.toLowerCase().replace(/^www\./, '');
}

/**
 * Extract all hostnames/domains from a message string.
 * @param {string} content
 * @returns {{ hostname: string, fullUrl: string }[]}
 */
export function extractUrls(content) {
  const results = [];
  const seen = new Set();
  let match;
  const regex = new RegExp(URL_REGEX.source, URL_REGEX.flags);

  for (match = regex.exec(content); match; match = regex.exec(content)) {
    // Group 1: hostname from http(s):// URL, Group 3: bare domain
    const hostname = (match[1] || match[3] || '').toLowerCase().replace(/^www\./, '');
    const fullUrl = match[0].trim();

    if (hostname && !seen.has(hostname)) {
      seen.add(hostname);
      results.push({ hostname, fullUrl });
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
  for (const pattern of PHISHING_PATTERNS) {
    const m = content.match(pattern);
    if (m) return m[0];
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

  const alertChannel = await message.client.channels.fetch(alertChannelId).catch(() => null);
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
 * Check whether a message contains blocked or suspicious links.
 * Deletes the message and alerts the mod channel if a match is found.
 *
 * @param {import('discord.js').Message} message - Discord message object
 * @param {Object} config - Bot config (merged guild config)
 * @returns {Promise<{ blocked: boolean, domain?: string }>}
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

  const blockedDomains = rawBlockedDomains.map(normalizeBlockedDomain);

  const urls = extractUrls(content);
  for (const { hostname, fullUrl } of urls) {
    // Exact match or subdomain match (e.g. "evil.com" also catches "sub.evil.com")
    const matched = blockedDomains.find(
      (blocked) => hostname === blocked || hostname.endsWith(`.${blocked}`),
    );

    if (matched) {
      warn('Link filter: blocked domain detected', {
        userId: message.author.id,
        channelId: message.channel.id,
        hostname,
        blockedRule: matched,
      });
      await message.delete().catch(() => {});
      await alertModChannel(message, config, hostname || fullUrl, 'blocklist');
      return { blocked: true, domain: matched };
    }
  }

  return { blocked: false };
}
