import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { config as dotenvConfig } from 'dotenv';

export function loadDevEnv(envFilePath) {
  const resolvedEnvFilePath = resolve(envFilePath);

  if (!existsSync(resolvedEnvFilePath)) {
    throw new Error(`Env file not found: ${resolvedEnvFilePath}`);
  }

  const result = dotenvConfig({
    path: resolvedEnvFilePath,
    override: true,
    quiet: true,
  });

  if (result.error) {
    throw result.error;
  }

  return result.parsed ?? {};
}

export function runWithDevEnv(argv = process.argv) {
  const [, , envFilePath, command, ...commandArgs] = argv;

  if (!envFilePath || !command) {
    throw new Error('Usage: node scripts/dev-env.js <env-file> <command> [...args]');
  }

  loadDevEnv(envFilePath);

  const child = spawn(command, commandArgs, {
    env: process.env,
    stdio: 'inherit',
  });

  child.on('error', (err) => {
    process.stderr.write(`${err.message}\n`);
    process.exitCode = 1;
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exitCode = code ?? 1;
  });
}

const currentFilePath = fileURLToPath(import.meta.url);

if (process.argv[1] === currentFilePath) {
  try {
    runWithDevEnv();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
