/**
 * Bill Bot - Volvox Discord Bot
 * 
 * Features:
 * - AI chat powered by Claude
 * - Welcome messages for new members
 * - Spam/scam detection and moderation
 */

import { Client, GatewayIntentBits, EmbedBuilder, ChannelType } from 'discord.js';
import { config as dotenvConfig } from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { StorageFactory } from './storage.js';

dotenvConfig();

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, '..', 'config.json');

// Load config
let config;
try {
  if (!existsSync(configPath)) {
    console.error('❌ config.json not found!');
    process.exit(1);
  }
  config = JSON.parse(readFileSync(configPath, 'utf-8'));
  console.log('✅ Loaded config.json');
} catch (err) {
  console.error('❌ Failed to load config.json:', err.message);
  process.exit(1);
}

// Initialize storage backend from config
const storage = StorageFactory.create(
  config.storage?.backend || 'memory',
  { path: config.storage?.path }
);

// OpenClaw API endpoint
const OPENCLAW_URL = process.env.OPENCLAW_URL || 'http://localhost:18789/v1/chat/completions';
const OPENCLAW_TOKEN = process.env.OPENCLAW_TOKEN || '';

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// Max history from config (used for getHistory limit)
const MAX_HISTORY = config.storage?.maxHistory || 20;

// Spam patterns
const SPAM_PATTERNS = [
  /free\s*(crypto|bitcoin|btc|eth|nft)/i,
  /airdrop.*claim/i,
  /discord\s*nitro\s*free/i,
  /nitro\s*gift.*claim/i,
  /click.*verify.*account/i,
  /guaranteed.*profit/i,
  /invest.*double.*money/i,
  /dm\s*me\s*for.*free/i,
  /make\s*\$?\d+k?\+?\s*(daily|weekly|monthly)/i,
];

/**
 * Check if message is spam
 */
function isSpam(content) {
  return SPAM_PATTERNS.some(pattern => pattern.test(content));
}

/**
 * Get conversation history for a channel
 */
async function getHistory(channelId) {
  return await storage.getHistory(channelId, MAX_HISTORY);
}

/**
 * Add message to history
 */
async function addToHistory(channelId, role, content) {
  await storage.addMessage(channelId, role, content);
}

/**
 * Generate AI response using OpenClaw's chat completions endpoint
 */
async function generateResponse(channelId, userMessage, username) {
  const history = await getHistory(channelId);

  const systemPrompt = config.ai?.systemPrompt || `You are Volvox Bot, a helpful and friendly Discord bot for the Volvox developer community.
You're witty, knowledgeable about programming and tech, and always eager to help.
Keep responses concise and Discord-friendly (under 2000 chars).
You can use Discord markdown formatting.`;

  // Build messages array for OpenAI-compatible API
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: `${username}: ${userMessage}` }
  ];

  try {
    const response = await fetch(OPENCLAW_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(OPENCLAW_TOKEN && { 'Authorization': `Bearer ${OPENCLAW_TOKEN}` })
      },
      body: JSON.stringify({
        model: config.ai?.model || 'claude-sonnet-4-20250514',
        max_tokens: config.ai?.maxTokens || 1024,
        messages: messages,
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "I got nothing. Try again?";

    // Update history
    await addToHistory(channelId, 'user', `${username}: ${userMessage}`);
    await addToHistory(channelId, 'assistant', reply);

    return reply;
  } catch (err) {
    console.error('OpenClaw API error:', err.message);
    return "Sorry, I'm having trouble thinking right now. Try again in a moment!";
  }
}

/**
 * Send alert for spam detection
 */
async function sendSpamAlert(message) {
  if (!config.moderation?.alertChannelId) return;
  
  const alertChannel = await client.channels.fetch(config.moderation.alertChannelId).catch(() => null);
  if (!alertChannel) return;

  const embed = new EmbedBuilder()
    .setColor(0xFF6B6B)
    .setTitle('⚠️ Potential Spam Detected')
    .addFields(
      { name: 'Author', value: `<@${message.author.id}>`, inline: true },
      { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
      { name: 'Content', value: message.content.slice(0, 1000) || '*empty*' },
      { name: 'Link', value: `[Jump](${message.url})` }
    )
    .setTimestamp();

  await alertChannel.send({ embeds: [embed] });
  
  // Auto-delete if enabled
  if (config.moderation?.autoDelete) {
    await message.delete().catch(() => {});
  }
}

// Bot ready
client.once('ready', () => {
  console.log(`✅ ${client.user.tag} is online!`);
  console.log(`📡 Serving ${client.guilds.cache.size} server(s)`);
  
  if (config.welcome?.enabled) {
    console.log(`👋 Welcome messages → #${config.welcome.channelId}`);
  }
  if (config.ai?.enabled) {
    console.log(`🤖 AI chat enabled (${config.ai.model || 'claude-sonnet-4-20250514'})`);
  }
  if (config.moderation?.enabled) {
    console.log(`🛡️ Moderation enabled`);
  }
});

// Welcome new members
client.on('guildMemberAdd', async (member) => {
  if (!config.welcome?.enabled || !config.welcome?.channelId) return;

  try {
    const channel = await client.channels.fetch(config.welcome.channelId);
    if (!channel) return;

    const message = (config.welcome.message || 'Welcome, {user}!')
      .replace(/{user}/g, `<@${member.id}>`)
      .replace(/{username}/g, member.user.username)
      .replace(/{server}/g, member.guild.name)
      .replace(/{memberCount}/g, member.guild.memberCount.toString());

    await channel.send(message);
    console.log(`[WELCOME] ${member.user.tag} joined ${member.guild.name}`);
  } catch (err) {
    console.error('Welcome error:', err.message);
  }
});

// Handle messages
client.on('messageCreate', async (message) => {
  // Ignore bots and DMs
  if (message.author.bot) return;
  if (!message.guild) return;

  // Spam detection
  if (config.moderation?.enabled && isSpam(message.content)) {
    console.log(`[SPAM] ${message.author.tag}: ${message.content.slice(0, 50)}...`);
    await sendSpamAlert(message);
    return;
  }

  // AI chat - respond when mentioned
  if (config.ai?.enabled) {
    const isMentioned = message.mentions.has(client.user);
    const isReply = message.reference && message.mentions.repliedUser?.id === client.user.id;
    
    // Check if in allowed channel (if configured)
    const allowedChannels = config.ai?.channels || [];
    const isAllowedChannel = allowedChannels.length === 0 || allowedChannels.includes(message.channel.id);
    
    if ((isMentioned || isReply) && isAllowedChannel) {
      // Remove the mention from the message
      const cleanContent = message.content
        .replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '')
        .trim();
      
      if (!cleanContent) {
        await message.reply("Hey! What's up?");
        return;
      }

      await message.channel.sendTyping();
      
      const response = await generateResponse(
        message.channel.id,
        cleanContent,
        message.author.username
      );

      // Split long responses
      if (response.length > 2000) {
        const chunks = response.match(/[\s\S]{1,1990}/g) || [];
        for (const chunk of chunks) {
          await message.channel.send(chunk);
        }
      } else {
        await message.reply(response);
      }
    }
  }
});

// Error handling
client.on('error', (error) => {
  console.error('Discord error:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});

// Start
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('❌ DISCORD_TOKEN not set');
  process.exit(1);
}

console.log(`🔗 Using OpenClaw API at ${OPENCLAW_URL}`);

client.login(token);
