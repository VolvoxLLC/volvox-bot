import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { error as logError, info as logInfo, warn as logWarn } from '../logger.js';

const defaultCommandLogger = {
  info: logInfo,
  warn: logWarn,
  error: logError,
};

/**
 * Load command modules from a directory.
 *
 * @param {object} options
 * @param {string} options.commandsPath - Absolute path to command files
 * @param {(command: object) => void} [options.onCommandLoaded] - Optional callback for each loaded command
 * @param {boolean} [options.logLoaded=true] - Whether to log each successfully loaded command
 * @param {{info: Function, warn: Function, error: Function}} [options.commandLogger] - Logger implementation override (for tests)
 * @returns {Promise<object[]>}
 */
export async function loadCommandsFromDirectory({
  commandsPath,
  onCommandLoaded = () => {},
  logLoaded = true,
  commandLogger = defaultCommandLogger,
}) {
  const commandFiles = readdirSync(commandsPath).filter((file) => file.endsWith('.js'));
  const commands = [];

  for (const file of commandFiles) {
    const filePath = join(commandsPath, file);

    try {
      const command = await import(filePath);

      if (!command.data || !command.execute) {
        commandLogger.warn('Command missing data or execute export', { file });
        continue;
      }

      commands.push(command);
      onCommandLoaded(command);

      if (logLoaded) {
        commandLogger.info('Loaded command', { command: command.data.name });
      }
    } catch (err) {
      commandLogger.error('Failed to load command', { file, error: err.message });
    }
  }

  return commands;
}
