/**
 * Deploy slash commands to Discord
 *
 * Usage:
 *   pnpm deploy
 *
 * Environment:
 *   DISCORD_TOKEN (required)
 *   DISCORD_CLIENT_ID (required, fallback: CLIENT_ID)
 *   GUILD_ID (optional)
 */

import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as dotenvConfig } from 'dotenv';
import { error as logError } from './logger.js';
import { registerCommands } from './utils/registerCommands.js';

dotenvConfig();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID || null;

if (!token) {
  logError('DISCORD_TOKEN is required');
  process.exit(1);
}

if (!clientId) {
  logError('DISCORD_CLIENT_ID (or legacy CLIENT_ID) is required');
  process.exit(1);
}

async function loadCommands() {
  const commandsPath = join(__dirname, 'commands');
  const commandFiles = readdirSync(commandsPath).filter((file) => file.endsWith('.js'));
  const commands = [];

  for (const file of commandFiles) {
    const command = await import(join(commandsPath, file));
    if (command.data && command.execute) {
      commands.push(command);
    }
  }

  return commands;
}

async function main() {
  const commands = await loadCommands();
  await registerCommands(commands, clientId, token, guildId);
}

main().catch((err) => {
  logError('Command deployment failed', { error: err.message });
  process.exit(1);
});
