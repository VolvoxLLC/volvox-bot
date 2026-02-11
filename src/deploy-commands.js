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

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as dotenvConfig } from 'dotenv';
import { error as logError } from './logger.js';
import { loadCommandsFromDirectory } from './utils/loadCommands.js';
import { registerCommands } from './utils/registerCommands.js';

dotenvConfig();

const __dirname = dirname(fileURLToPath(import.meta.url));

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
  return loadCommandsFromDirectory({
    commandsPath: join(__dirname, 'commands'),
    logLoaded: false,
  });
}

async function main() {
  const commands = await loadCommands();
  await registerCommands(commands, clientId, token, guildId);
}

main().catch((err) => {
  logError('Command deployment failed', { error: err.message, stack: err.stack });
  process.exit(1);
});
