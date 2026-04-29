#!/usr/bin/env node
import { copyFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { error, info } from '../src/logger.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, '..');
const sourcePath = resolve(root, 'src/data/providers.json');
const snapshotPath = resolve(root, 'web/src/data/providers.json');

function readNormalizedJson(path) {
  return `${JSON.stringify(JSON.parse(readFileSync(path, 'utf8')), null, 2)}\n`;
}

export function checkWebProviderCatalogSync() {
  return readNormalizedJson(snapshotPath) === readNormalizedJson(sourcePath);
}

export function syncWebProviderCatalog() {
  copyFileSync(sourcePath, snapshotPath);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--check')) {
    if (!checkWebProviderCatalogSync()) {
      error(
        'web provider catalog snapshot is out of sync; run `pnpm providers:sync` and commit web/src/data/providers.json',
      );
      process.exit(1);
    }
    info('web provider catalog snapshot is in sync');
  } else {
    syncWebProviderCatalog();
    info('synced web/src/data/providers.json from src/data/providers.json');
  }
}
