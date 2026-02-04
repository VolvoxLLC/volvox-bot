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
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

dotenvConfig();

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, '..', 'config.json');
const statePath = join(__dirname, '..', 'data', 'state.json');

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

// Conversation history per channel (simple in-memory store)
const conversationHistory = new Map();
const MAX_HISTORY = 20;

// Track pending AI requests for graceful shutdown
const pendingRequests = new Set();

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
 * Get or create conversation history for a channel
 */
function getHistory(channelId) {
  if (!conversationHistory.has(channelId)) {
    conversationHistory.set(channelId, []);
  }
  return conversationHistory.get(channelId);
}

/**
 * Add message to history
 */
function addToHistory(channelId, role, content) {
  const history = getHistory(channelId);
  history.push({ role, content });

  // Trim old messages
  while (history.length > MAX_HISTORY) {
    history.shift();
  }
}

/**
 * Save conversation history to disk
 */
function saveState() {
  try {
    // Ensure data directory exists
    const dataDir = dirname(statePath);
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    const stateData = {
      conversationHistory: Array.from(conversationHistory.entries()),
      timestamp: new Date().toISOString(),
    };
    writeFileSync(statePath, JSON.stringify(stateData, null, 2), 'utf-8');
  } catch (err) {
    console.error('❌ Failed to save state:', err.message);
  }
}

/**
 * Load conversation history from disk
 */
function loadState() {
  try {
    if (!existsSync(statePath)) {
      return;
    }
    const stateData = JSON.parse(readFileSync(statePath, 'utf-8'));
    if (stateData.conversationHistory) {
      conversationHistory.clear();
      for (const [channelId, history] of stateData.conversationHistory) {
        conversationHistory.set(channelId, history);
      }
    }
  } catch (err) {
    console.error('❌ Failed to load state:', err.message);
  }
}

/**
 * Generate AI response using OpenClaw's chat completions endpoint
 */
async function generateResponse(channelId, userMessage, username) {
  // Track this request for graceful shutdown
  const requestId = Symbol('request');
  pendingRequests.add(requestId);

  try {
    const history = getHistory(channelId);

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
      addToHistory(channelId, 'user', `${username}: ${userMessage}`);
      addToHistory(channelId, 'assistant', reply);

      return reply;
    } catch (err) {
      console.error('OpenClaw API error:', err.message);
      return "Sorry, I'm having trouble thinking right now. Try again in a moment!";
    }
  } finally {
    // Remove request from tracking
    pendingRequests.delete(requestId);
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

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal) {
  console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);

  // 1. Wait for pending requests with timeout
  const SHUTDOWN_TIMEOUT = 10000; // 10 seconds
  if (pendingRequests.size > 0) {
    console.log(`⏳ Waiting for ${pendingRequests.size} pending request(s)...`);
    const startTime = Date.now();

    while (pendingRequests.size > 0 && (Date.now() - startTime) < SHUTDOWN_TIMEOUT) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (pendingRequests.size > 0) {
      console.log(`⚠️ Timeout: ${pendingRequests.size} request(s) still pending`);
    } else {
      console.log('✅ All requests completed');
    }
  }

  // 2. Save state after pending requests complete
  console.log('💾 Saving conversation state...');
  saveState();

  // 3. Destroy Discord client
  console.log('🔌 Disconnecting from Discord...');
  client.destroy();

  // 4. Log clean exit
  console.log('✅ Shutdown complete');
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('❌ DISCORD_TOKEN not set');
  process.exit(1);
}

console.log(`🔗 Using OpenClaw API at ${OPENCLAW_URL}`);

// Load previous state on startup
loadState();

client.login(token);
