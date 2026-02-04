/**
 * Bill Bot - Volvox Discord Bot
 * 
 * Features:
 * - AI chat powered by Claude
 * - Welcome messages for new members
 * - Spam/scam detection and moderation
 */

import { Client, GatewayIntentBits, EmbedBuilder, ChannelType, REST, Routes } from 'discord.js';
import { config as dotenvConfig } from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { commandData } from './commands.js';

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

// Track bot start time for uptime calculation
const startTime = Date.now();

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
 * Generate AI response using OpenClaw's chat completions endpoint
 */
async function generateResponse(channelId, userMessage, username) {
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

/**
 * Register slash commands with Discord
 */
async function deployCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    const clientId = process.env.DISCORD_CLIENT_ID;
    const guildId = process.env.DISCORD_GUILD_ID;

    if (!clientId) {
      throw new Error('DISCORD_CLIENT_ID not set');
    }

    if (guildId) {
      // Register commands for a specific guild (faster for development)
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commandData,
      });
      console.log(`✅ Commands registered for guild ${guildId}`);
    } else {
      // Register commands globally (takes up to 1 hour to propagate)
      await rest.put(Routes.applicationCommands(clientId), {
        body: commandData,
      });
      console.log('✅ Commands registered globally');
    }
  } catch (err) {
    console.error('Failed to register commands:', err.message);
  }
}

// Bot ready
client.once('ready', async () => {
  console.log(`✅ ${client.user.tag} is online!`);
  console.log(`📡 Serving ${client.guilds.cache.size} server(s)`);

  // Register slash commands
  await deployCommands();

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

// Handle slash command interactions
client.on('interactionCreate', async (interaction) => {
  // Only handle slash commands
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  try {
    if (commandName === 'ask') {
      // Get the question from command options
      const question = interaction.options.getString('question');

      // Defer reply since AI generation might take time
      await interaction.deferReply();

      // Generate AI response
      const response = await generateResponse(
        interaction.channel.id,
        question,
        interaction.user.username
      );

      // Send response (handle long messages)
      if (response.length > 2000) {
        const chunks = response.match(/[\s\S]{1,1990}/g) || [];
        await interaction.editReply(chunks[0]);
        for (let i = 1; i < chunks.length; i++) {
          await interaction.followUp(chunks[i]);
        }
      } else {
        await interaction.editReply(response);
      }
    } else if (commandName === 'help') {
      // Create help embed with all available commands
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🤖 Bill Bot - Available Commands')
        .setDescription('Here are all the commands you can use:')
        .addFields(
          {
            name: '/ask',
            value: 'Ask the AI a question\n**Usage:** `/ask question: What is JavaScript?`'
          },
          {
            name: '/help',
            value: 'Show this help message\n**Usage:** `/help`'
          },
          {
            name: '/clear',
            value: 'Clear your conversation history with the bot\n**Usage:** `/clear`'
          },
          {
            name: '/status',
            value: 'Show bot status, uptime, and health information\n**Usage:** `/status`'
          }
        )
        .addFields({
          name: '💬 AI Chat',
          value: 'You can also mention me or reply to my messages to chat! I remember the last 20 messages per channel.'
        })
        .setFooter({ text: 'Powered by Claude AI via OpenClaw' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (commandName === 'clear') {
      // Clear conversation history for this channel
      const channelId = interaction.channel.id;

      if (conversationHistory.has(channelId)) {
        conversationHistory.delete(channelId);
        await interaction.reply({
          content: '🧹 Conversation history cleared! Starting fresh.',
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content: '✨ No conversation history to clear - already fresh!',
          ephemeral: true
        });
      }
    } else if (commandName === 'status') {
      // Calculate uptime
      const uptime = Date.now() - startTime;
      const seconds = Math.floor(uptime / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      let uptimeStr = '';
      if (days > 0) uptimeStr += `${days}d `;
      if (hours % 24 > 0) uptimeStr += `${hours % 24}h `;
      if (minutes % 60 > 0) uptimeStr += `${minutes % 60}m `;
      uptimeStr += `${seconds % 60}s`;

      // Get memory usage
      const memoryUsage = process.memoryUsage();
      const memoryMB = (memoryUsage.heapUsed / 1024 / 1024).toFixed(2);

      // Get server count
      const serverCount = client.guilds.cache.size;

      // Check API health
      let apiStatus = '🟢 Operational';
      try {
        const healthCheck = await fetch(OPENCLAW_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(OPENCLAW_TOKEN && { 'Authorization': `Bearer ${OPENCLAW_TOKEN}` })
          },
          body: JSON.stringify({
            model: config.ai?.model || 'claude-sonnet-4-20250514',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'ping' }],
          }),
        });

        if (!healthCheck.ok) {
          apiStatus = '🟡 Degraded';
        }
      } catch {
        apiStatus = '🔴 Unavailable';
      }

      // Create status embed
      const embed = new EmbedBuilder()
        .setColor(0x43B581)
        .setTitle('📊 Bot Status')
        .addFields(
          { name: '⏱️ Uptime', value: uptimeStr, inline: true },
          { name: '📡 Servers', value: serverCount.toString(), inline: true },
          { name: '🧠 Memory', value: `${memoryMB} MB`, inline: true },
          { name: '🤖 AI Status', value: apiStatus, inline: false },
          { name: '🏓 Latency', value: `${client.ws.ping}ms`, inline: true }
        )
        .setFooter({ text: `${client.user.tag}` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }
  } catch (err) {
    console.error(`Error handling /${commandName}:`, err.message);

    const errorMessage = 'Sorry, something went wrong processing your command!';

    if (interaction.deferred) {
      await interaction.editReply(errorMessage).catch(() => {});
    } else {
      await interaction.reply({ content: errorMessage, ephemeral: true }).catch(() => {});
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
