#!/usr/bin/env node

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fork } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageDir = join(__dirname, '..');

const child = fork(join(packageDir, 'server.cjs'), {
  cwd: packageDir,
  env: { ...process.env },
  stdio: 'inherit'
});

child.on('exit', (code) => process.exit(code ?? 0));
