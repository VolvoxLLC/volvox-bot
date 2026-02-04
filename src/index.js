/**
 * Bill Bot - Volvox Discord Bot
 * Main entry point - orchestrates modules
 *
 * Features:
 * - AI chat powered by Claude
 * - Welcome messages for new members
 * - Spam/scam detection and moderation
 * - Health monitoring and status command
 */

import { Client, GatewayIntentBits } from 'discord.js';
import { config as dotenvConfig } from 'dotenv';
import { loadConfig } from './modules/config.js';
import { registerEventHandlers } from './modules/events.js';
import { HealthMonitor } from './utils/health.js';
import * as statusCommand from './commands/status.js';

// Load environment variables
dotenvConfig();

// Load configuration
const config = loadConfig();

// Initialize Discord client with required intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// Initialize health monitor
const healthMonitor = HealthMonitor.getInstance();

// Register all event handlers
registerEventHandlers(client, config, healthMonitor);

// Handle slash commands
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    console.log(`[INTERACTION] /${interaction.commandName} from ${interaction.user.tag}`);

    // Route commands
    switch (interaction.commandName) {
      case 'status':
        await statusCommand.execute(interaction);
        break;
      default:
        await interaction.reply({
          content: 'Unknown command!',
          ephemeral: true
        });
    }
  } catch (err) {
    console.error('Interaction error:', err.message);

    // Try to respond if we haven't already
    const reply = {
      content: 'Sorry, something went wrong with that command.',
      ephemeral: true
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error('❌ Login failed:', err.message);
  process.exit(1);
});
