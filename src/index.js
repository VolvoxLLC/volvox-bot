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

import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { config as dotenvConfig } from 'dotenv';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from './modules/config.js';
import { registerEventHandlers } from './modules/events.js';
import { HealthMonitor } from './utils/health.js';
import { registerCommands } from './utils/registerCommands.js';
import { hasPermission, getPermissionError } from './utils/permissions.js';

// ES module dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

// Initialize command collection
client.commands = new Collection();

// Initialize health monitor
const healthMonitor = HealthMonitor.getInstance();

/**
 * Load all commands from the commands directory
 */
async function loadCommands() {
  const commandsPath = join(__dirname, 'commands');
  const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    const filePath = join(commandsPath, file);
    try {
      const command = await import(filePath);
      if (command.data && command.execute) {
        client.commands.set(command.data.name, command);
        console.log(`✅ Loaded command: ${command.data.name}`);
      } else {
        console.warn(`⚠️ Command ${file} missing data or execute export`);
      }
    } catch (err) {
      console.error(`❌ Failed to load command ${file}:`, err.message);
    }
  }
}

// Register all event handlers
registerEventHandlers(client, config, healthMonitor);

// Extend ready handler to register slash commands
client.once('ready', async () => {
  // Register slash commands with Discord
  try {
    const commands = Array.from(client.commands.values());
    const guildId = process.env.GUILD_ID || null;

    await registerCommands(
      commands,
      client.user.id,
      process.env.DISCORD_TOKEN,
      guildId
    );
  } catch (err) {
    console.error('Command registration failed:', err.message);
  }
});

// Handle slash commands
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, member } = interaction;

  try {
    console.log(`[INTERACTION] /${commandName} from ${interaction.user.tag}`);

    // Permission check
    if (!hasPermission(member, commandName, config)) {
      await interaction.reply({
        content: getPermissionError(commandName),
        ephemeral: true
      });
      console.log(`[DENIED] ${interaction.user.tag} attempted /${commandName}`);
      return;
    }

    // Execute command from collection
    const command = client.commands.get(commandName);
    if (!command) {
      await interaction.reply({
        content: '❌ Command not found.',
        ephemeral: true
      });
      return;
    }

    await command.execute(interaction);
    console.log(`[CMD] ${interaction.user.tag} used /${commandName}`);
  } catch (err) {
    console.error(`Command error (/${commandName}):`, err.message);

    const errorMessage = {
      content: '❌ An error occurred while executing this command.',
      ephemeral: true
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorMessage).catch(() => {});
    } else {
      await interaction.reply(errorMessage).catch(() => {});
    }
  }
});

// Start bot
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('❌ DISCORD_TOKEN not set');
  process.exit(1);
}

// Load commands and login
loadCommands()
  .then(() => client.login(token))
  .catch((err) => {
    console.error('❌ Startup failed:', err.message);
    process.exit(1);
  });
