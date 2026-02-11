import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadCommandsFromDirectory } from '../../src/utils/loadCommands.js';

describe('loadCommandsFromDirectory', () => {
  let tempDir = null;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }

    vi.clearAllMocks();
  });

  it('loads valid commands and handles invalid/broken modules per file', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'bill-bot-commands-'));

    writeFileSync(
      join(tempDir, 'ping.js'),
      "export const data = { name: 'ping' }; export async function execute() {}",
      'utf8',
    );
    writeFileSync(join(tempDir, 'invalid.js'), "export const data = { name: 'invalid' };", 'utf8');
    writeFileSync(join(tempDir, 'broken.js'), "throw new Error('boom');", 'utf8');

    const commandLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const onCommandLoaded = vi.fn();

    const commands = await loadCommandsFromDirectory({
      commandsPath: tempDir,
      onCommandLoaded,
      commandLogger,
    });

    expect(commands).toHaveLength(1);
    expect(commands[0].data.name).toBe('ping');
    expect(onCommandLoaded).toHaveBeenCalledTimes(1);
    expect(commandLogger.info).toHaveBeenCalledWith('Loaded command', { command: 'ping' });
    expect(commandLogger.warn).toHaveBeenCalledWith('Command missing data or execute export', {
      file: 'invalid.js',
    });
    expect(commandLogger.error).toHaveBeenCalledWith(
      'Failed to load command',
      expect.objectContaining({ file: 'broken.js', error: 'boom' }),
    );
  });

  it('supports disabling success logs', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'bill-bot-commands-'));

    writeFileSync(
      join(tempDir, 'status.js'),
      "export const data = { name: 'status' }; export async function execute() {}",
      'utf8',
    );

    const commandLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const commands = await loadCommandsFromDirectory({
      commandsPath: tempDir,
      logLoaded: false,
      commandLogger,
    });

    expect(commands).toHaveLength(1);
    expect(commandLogger.info).not.toHaveBeenCalled();
  });
});
