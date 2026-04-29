#!/usr/bin/env node
import { copyFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(new URL('..', import.meta.url).pathname);
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
      console.error(
        'web provider catalog snapshot is out of sync; run `pnpm providers:sync` and commit web/src/data/providers.json',
      );
      process.exit(1);
    }
    console.log('web provider catalog snapshot is in sync');
  } else {
    syncWebProviderCatalog();
    console.log('synced web/src/data/providers.json from src/data/providers.json');
  }
}
