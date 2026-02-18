import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const commandsDir = join(__dirname, '..', 'src', 'commands');

const commandFiles = readdirSync(commandsDir).filter((f) => f.endsWith('.js'));

// NOTE: Dynamic imports may trigger module-level side effects (e.g., SlashCommandBuilder
// registration). Each file is imported once per describe block via beforeAll and the
// module cache is shared across tests within the same file.
describe('command files', () => {
  it('should have at least one command', () => {
    expect(commandFiles.length).toBeGreaterThan(0);
  });

  for (const file of commandFiles) {
    describe(file, () => {
      let mod;

      beforeAll(async () => {
        mod = await import(join(commandsDir, file));
      });

      it('should export data and execute', () => {
        expect(mod.data).toBeDefined();
        expect(mod.data.name).toBeTruthy();
        expect(typeof mod.execute).toBe('function');
      });

      it('should have a description on data', () => {
        expect(mod.data.description).toBeTruthy();
      });
    });
  }
});
