import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

/**
 * Run a command and exit immediately on failure.
 *
 * @param {string} label
 * @param {string} command
 * @param {string[]} args
 */
function runStep(label, command, args) {
  process.stdout.write(`\n=== ${label} ===\n`);
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    process.stderr.write(`\nValidation failed at step: ${label}\n`);
    process.exit(result.status ?? 1);
  }
}

const steps = [
  { label: 'Bot Lint', command: 'pnpm', args: ['lint'] },
  { label: 'Bot Tests', command: 'pnpm', args: ['test'] },
  { label: 'Bot Coverage', command: 'pnpm', args: ['test:coverage'] },
];

if (!existsSync('web/node_modules')) {
  process.stderr.write(
    '\nweb/node_modules is missing. Run "pnpm --prefix web install" before running validation.\n',
  );
  process.exit(1);
}

steps.push(
  { label: 'Web Lint', command: 'pnpm', args: ['--prefix', 'web', 'lint'] },
  { label: 'Web Typecheck', command: 'pnpm', args: ['--prefix', 'web', 'typecheck'] },
  { label: 'Web Tests', command: 'pnpm', args: ['--prefix', 'web', 'test'] },
  { label: 'Web Build', command: 'pnpm', args: ['--prefix', 'web', 'build'] },
);

for (const step of steps) {
  runStep(step.label, step.command, step.args);
}

process.stdout.write('\nValidation completed successfully.\n');
