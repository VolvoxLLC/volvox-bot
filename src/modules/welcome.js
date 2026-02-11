/**
 * Welcome Module
 * Handles dynamic welcome messages for new members
 */

import { info, error as logError } from '../logger.js';

const guildActivity = new Map();
const DEFAULT_ACTIVITY_WINDOW_MINUTES = 45;
const MAX_EVENTS_PER_CHANNEL = 250;

/** Notable member-count milestones (hoisted to avoid allocation per welcome event) */
const NOTABLE_MILESTONES = new Set([10, 25, 50, 100, 250, 500, 1000]);

/** @type {{key: string, set: Set<string>} | null} Cached excluded channels Set */
let excludedChannelsCache = null;

/**
 * Render welcome message with placeholder replacements
 * @param {string} messageTemplate - Welcome message template
 * @param {Object} member - Member object with id and optional username
 * @param {Object} guild - Guild object with name and memberCount
 * @returns {string} Rendered welcome message
 */
export function renderWelcomeMessage(messageTemplate, member, guild) {
  return messageTemplate
    .replace(/{user}/g, `<@${member.id}>`)
    .replace(/{username}/g, member.username || 'Unknown')
    .replace(/{server}/g, guild.name)
    .replace(/{memberCount}/g, guild.memberCount.toString());
}

/**
 * Track message activity for welcome context.
 * Called from messageCreate handler to build a live community pulse.
 * @param {Object} message - Discord message
 * @param {Object} config - Bot configuration
 */
export function recordCommunityActivity(message, config) {
  if (!message?.guild || !message?.channel || message.author?.bot) return;
  if (!message.channel?.isTextBased?.()) return;

  const welcomeDynamic = config?.welcome?.dynamic || {};
  const excludeList = welcomeDynamic.excludeChannels || [];
  const cacheKey = excludeList.join(',');
  if (!excludedChannelsCache || excludedChannelsCache.key !== cacheKey) {
    excludedChannelsCache = { key: cacheKey, set: new Set(excludeList) };
  }
  if (excludedChannelsCache.set.has(message.channel.id)) return;

  const now = Date.now();
  const windowMs = getActivityWindowMs(welcomeDynamic);
  const cutoff = now - windowMs;

  if (!guildActivity.has(message.guild.id)) {
    guildActivity.set(message.guild.id, new Map());
  }

  const activityMap = guildActivity.get(message.guild.id);
  const timestamps = activityMap.get(message.channel.id) || [];

  timestamps.push(now);
  while (timestamps.length && timestamps[0] < cutoff) {
    timestamps.shift();
  }
  if (timestamps.length > MAX_EVENTS_PER_CHANNEL) {
    timestamps.splice(0, timestamps.length - MAX_EVENTS_PER_CHANNEL);
  }

  activityMap.set(message.channel.id, timestamps);
}

/**
 * Send welcome message to new member
 * @param {Object} member - Discord guild member
 * @param {Object} client - Discord client
 * @param {Object} config - Bot configuration
 */
export async function sendWelcomeMessage(member, client, config) {
  if (!config.welcome?.enabled || !config.welcome?.channelId) return;

  try {
    const channel = await client.channels.fetch(config.welcome.channelId);
    if (!channel) return;

    const useDynamic = config.welcome?.dynamic?.enabled === true;

    const message = useDynamic
      ? buildDynamicWelcomeMessage(member, config)
      : renderWelcomeMessage(
          config.welcome.message || 'Welcome, {user}!',
          { id: member.id, username: member.user.username },
          { name: member.guild.name, memberCount: member.guild.memberCount },
        );

    await channel.send(message);
    info('Welcome message sent', { user: member.user.tag, guild: member.guild.name });
  } catch (err) {
    logError('Welcome error', { error: err.message, stack: err.stack });
  }
}

/**
 * Build contextual welcome message based on time, activity, and milestones.
 * @param {Object} member - Discord guild member
 * @param {Object} config - Bot configuration
 * @returns {string} Dynamic welcome message
 */
function buildDynamicWelcomeMessage(member, config) {
  const welcomeDynamic = config?.welcome?.dynamic || {};
  const timezone = welcomeDynamic.timezone || 'America/New_York';

  const memberContext = {
    id: member.id,
    username: member.user?.username || 'Unknown',
    server: member.guild?.name || 'the server',
    memberCount: member.guild?.memberCount || 0,
  };

  const timeOfDay = getTimeOfDay(timezone);
  const snapshot = getCommunitySnapshot(member.guild, welcomeDynamic);
  const milestoneLine = getMilestoneLine(memberContext.memberCount, welcomeDynamic);
  const suggestedChannels = getSuggestedChannels(member, config, snapshot);

  const greeting = pickFrom(getGreetingTemplates(timeOfDay), memberContext);
  const vibeLine = buildVibeLine(snapshot, suggestedChannels);
  const ctaLine = buildCtaLine(suggestedChannels);

  const lines = [greeting];

  if (milestoneLine) {
    lines.push(milestoneLine);
  } else {
    lines.push(`You just rolled in as member **#${memberContext.memberCount}**.`);
  }

  lines.push(vibeLine);
  lines.push(ctaLine);

  return lines.join('\n\n');
}

/**
 * Get activity snapshot for the guild.
 * @param {Object} guild - Discord guild
 * @param {Object} settings - welcome.dynamic settings
 * @returns {{messageCount:number,activeTextChannels:number,topChannelIds:string[],voiceParticipants:number,voiceChannels:number,level:string}}
 */
function getCommunitySnapshot(guild, settings) {
  const activityMap = guildActivity.get(guild.id) || new Map();
  const now = Date.now();
  const windowMs = getActivityWindowMs(settings);
  const cutoff = now - windowMs;

  let messageCount = 0;
  const channelCounts = [];

  for (const [channelId, timestamps] of activityMap.entries()) {
    const recent = timestamps.filter((t) => t >= cutoff);

    if (!recent.length) {
      activityMap.delete(channelId);
      continue;
    }

    // Write the pruned array back so stale entries don't accumulate forever
    activityMap.set(channelId, recent);

    messageCount += recent.length;
    channelCounts.push({ channelId, count: recent.length });
  }

  // Evict guild entry if no channels remain
  if (activityMap.size === 0) {
    guildActivity.delete(guild.id);
  }

  const topChannelIds = channelCounts
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map((entry) => entry.channelId);

  const activeVoiceChannels = guild.channels.cache.filter(
    (channel) => channel?.isVoiceBased?.() && channel.members?.size > 0,
  );

  const voiceChannels = activeVoiceChannels.size;
  const voiceParticipants = [...activeVoiceChannels.values()].reduce(
    (sum, channel) => sum + (channel.members?.size || 0),
    0,
  );

  const level = getActivityLevel(messageCount, voiceParticipants);

  return {
    messageCount,
    activeTextChannels: channelCounts.length,
    topChannelIds,
    voiceParticipants,
    voiceChannels,
    level,
  };
}

/**
 * Get activity level from message + voice activity.
 * @param {number} messageCount - Messages in rolling window
 * @param {number} voiceParticipants - Active users in voice channels
 * @returns {'quiet'|'light'|'steady'|'busy'|'hype'}
 */
function getActivityLevel(messageCount, voiceParticipants) {
  if (messageCount >= 60 || voiceParticipants >= 15) return 'hype';
  if (messageCount >= 25 || voiceParticipants >= 8) return 'busy';
  if (messageCount >= 8 || voiceParticipants >= 3) return 'steady';
  if (messageCount >= 1 || voiceParticipants >= 1) return 'light';
  return 'quiet';
}

/**
 * Build vibe line from current community activity.
 * @param {Object} snapshot - Community snapshot
 * @param {string[]} suggestedChannels - Channel mentions
 * @returns {string}
 */
function buildVibeLine(snapshot, suggestedChannels) {
  const topChannels = snapshot.topChannelIds.map((id) => `<#${id}>`);
  const channelList = (topChannels.length ? topChannels : suggestedChannels).slice(0, 2);
  const channelText = channelList.join(' + ');
  const hasChannels = channelList.length > 0;

  switch (snapshot.level) {
    case 'hype':
      return hasChannels
        ? `The place is buzzing right now - big energy in ${channelText}.`
        : `The place is buzzing right now - big energy everywhere.`;
    case 'busy':
      return hasChannels
        ? `Good timing: chat is active (${snapshot.messageCount} messages recently), especially in ${channelText}.`
        : `Good timing: the server is active right now (${snapshot.messageCount} messages recently${snapshot.voiceParticipants > 0 ? `, ${snapshot.voiceParticipants} in voice` : ''}).`;
    case 'steady':
      return hasChannels
        ? `Things are moving at a healthy pace in ${channelText}, so you'll fit right in.`
        : `Things are moving at a healthy pace, so you'll fit right in.`;
    case 'light':
      if (snapshot.voiceChannels > 0 && !hasChannels) {
        return `${snapshot.voiceParticipants} ${snapshot.voiceParticipants === 1 ? 'person is' : 'people are'} hanging out in voice right now — jump in anytime.`;
      }
      if (snapshot.voiceChannels > 0) {
        return `${snapshot.voiceParticipants} ${snapshot.voiceParticipants === 1 ? 'person is' : 'people are'} hanging out in voice right now, and ${channelText} is waking up.`;
      }
      return hasChannels
        ? `It's a chill moment, but ${channelText} is where people are checking in.`
        : `It's a chill moment — perfect time to say hello.`;
    default:
      return `You're catching us in a quiet window - perfect time to introduce yourself before the chaos starts.`;
  }
}

/**
 * Build CTA line with channel suggestions.
 * @param {string[]} channels - Channel mentions
 * @returns {string}
 */
function buildCtaLine(channels) {
  const [first, second, third] = channels;

  if (first && second && third) {
    return `Start in ${first}, share what you're building in ${second}, and lurk project updates in ${third}.`;
  }
  if (first && second) {
    return `Drop a quick intro in ${first} and show off what you're building in ${second}.`;
  }
  if (first) {
    return `Say hey in ${first} and let us know what you're building.`;
  }

  return "Say hey and tell us what you're building — we're glad you're here.";
}

/**
 * Build milestone line when member count hits notable threshold.
 * @param {number} memberCount - Current member count
 * @param {Object} settings - welcome.dynamic settings
 * @returns {string|null}
 */
function getMilestoneLine(memberCount, settings) {
  if (!memberCount) return null;

  const interval = Number(settings.milestoneInterval) || 25;

  if (NOTABLE_MILESTONES.has(memberCount) || (interval > 0 && memberCount % interval === 0)) {
    return `🎉 Perfect timing - you're our **#${memberCount}** member milestone!`;
  }

  return null;
}

/**
 * Determine time of day for greeting.
 * @param {string} timezone - IANA timezone
 * @returns {'morning'|'afternoon'|'evening'|'night'}
 */
function getTimeOfDay(timezone) {
  const hour = getHourInTimezone(timezone);

  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

/**
 * Get hour in timezone.
 * @param {string} timezone - IANA timezone
 * @returns {number}
 */
function getHourInTimezone(timezone) {
  try {
    const hourString = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      hour12: false,
      timeZone: timezone,
    }).format(new Date());

    const hour = Number(hourString);
    return Number.isFinite(hour) ? hour : new Date().getHours();
  } catch {
    return new Date().getHours();
  }
}

/**
 * Get greeting templates by time of day.
 * @param {'morning'|'afternoon'|'evening'|'night'} timeOfDay - Time context
 * @returns {Array<(ctx:Object)=>string>}
 */
function getGreetingTemplates(timeOfDay) {
  const templates = {
    morning: [
      (ctx) => `☀️ Morning and welcome to **${ctx.server}**, <@${ctx.id}>!`,
      (ctx) => `Hey <@${ctx.id}> - great way to start the day. Welcome to **${ctx.server}**!`,
      (ctx) => `Good morning <@${ctx.id}> 👋 You just joined **${ctx.server}**.`,
    ],
    afternoon: [
      (ctx) => `👋 Welcome to **${ctx.server}**, <@${ctx.id}>!`,
      (ctx) =>
        `Nice timing, <@${ctx.id}> - welcome to the **${ctx.server}** corner of the internet.`,
      (ctx) => `Hey <@${ctx.id}>! Glad you made it into **${ctx.server}**.`,
    ],
    evening: [
      (ctx) => `🌆 Evening crew just got better - welcome, <@${ctx.id}>!`,
      (ctx) => `Welcome to **${ctx.server}**, <@${ctx.id}>. Prime build-hours energy right now.`,
      (ctx) => `Hey <@${ctx.id}> 👋 Great time to join the party at **${ctx.server}**.`,
    ],
    night: [
      (ctx) => `🌙 Night owl spotted. Welcome to **${ctx.server}**, <@${ctx.id}>!`,
      (ctx) => `Late-night builders are active - welcome in, <@${ctx.id}>.`,
      (ctx) => `Welcome <@${ctx.id}>! The night shift at **${ctx.server}** is undefeated.`,
    ],
  };

  return templates[timeOfDay] || templates.afternoon;
}

/**
 * Pick channels to suggest based on active channels, configured highlights, and legacy template links.
 * @param {Object} member - Discord guild member
 * @param {Object} config - Bot configuration
 * @param {Object} snapshot - Community snapshot
 * @returns {string[]} Channel mentions
 */
function getSuggestedChannels(member, config, snapshot) {
  const dynamic = config?.welcome?.dynamic || {};
  const configured = Array.isArray(dynamic.highlightChannels) ? dynamic.highlightChannels : [];
  const legacy = extractChannelIdsFromTemplate(config?.welcome?.message || '');
  const top = snapshot.topChannelIds || [];

  const channelIds = [...new Set([...top, ...configured, ...legacy])]
    .filter(Boolean)
    .filter((id) => member.guild.channels.cache.has(id))
    .slice(0, 3);

  return channelIds.map((id) => `<#${id}>`);
}

/**
 * Extract channel IDs from legacy message template (<#...> format)
 * @param {string} template - Legacy welcome template
 * @returns {string[]} Channel IDs
 */
function extractChannelIdsFromTemplate(template) {
  const matches = template.match(/<#(\d+)>/g) || [];
  return matches.map((match) => match.replace(/[^\d]/g, ''));
}

/**
 * Calculate activity window in ms.
 * @param {Object} settings - welcome.dynamic settings
 * @returns {number}
 */
function getActivityWindowMs(settings) {
  const minutes = Number(settings.activityWindowMinutes) || DEFAULT_ACTIVITY_WINDOW_MINUTES;
  return Math.max(5, minutes) * 60 * 1000;
}

/**
 * Pick one function from template list and execute with context.
 * @param {Array<(ctx:Object)=>string>} templates - Template fns
 * @param {Object} context - Template context
 * @returns {string}
 */
function pickFrom(templates, context) {
  if (!templates.length) return `Welcome, <@${context.id}>!`;
  const index = Math.floor(Math.random() * templates.length);
  return templates[index](context);
}
