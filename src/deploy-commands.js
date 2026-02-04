/**
 * Deploy Discord Slash Commands
 *
 * Registers bot commands with Discord API
 * Run with: node src/deploy-commands.js
 */

import { REST, Routes, ApplicationCommandOptionType } from 'discord.js';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig();

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID; // Optional: for faster guild-only deployment

if (!DISCORD_TOKEN) {
  console.error('❌ Missing DISCORD_TOKEN in .env');
  process.exit(1);
}

if (!CLIENT_ID) {
  console.error('❌ Missing CLIENT_ID in .env');
  process.exit(1);
}

// Define commands
const commands = [
  {
    name: 'status',
    description: 'Check bot health and status',
    options: [
      {
        name: 'detailed',
        description: 'Show detailed diagnostics (admin only)',
        type: ApplicationCommandOptionType.Boolean,
        required: false,
      },
    ],
  },
];

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

/**
 * Deploy commands to Discord
 */
async function deployCommands() {
  try {
    console.log('🔄 Registering slash commands...');

    let route;
    let scope;

    if (GUILD_ID) {
      // Guild-specific deployment (faster for testing)
      route = Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID);
      scope = `guild ${GUILD_ID}`;
    } else {
      // Global deployment (takes up to 1 hour to propagate)
      route = Routes.applicationCommands(CLIENT_ID);
      scope = 'globally';
    }

    const data = await rest.put(route, { body: commands });

    console.log(`✅ Successfully registered ${data.length} command(s) ${scope}`);
    console.log(`   Commands: ${data.map(cmd => `/${cmd.name}`).join(', ')}`);

    if (!GUILD_ID) {
      console.log('⏱️  Note: Global commands may take up to 1 hour to appear');
    }
  } catch (error) {
    console.error('❌ Failed to register commands:', error);
    process.exit(1);
  }
}

deployCommands();
