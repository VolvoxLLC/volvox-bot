import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDirectory, '../../..');
const rootProviderCatalogPath = path.join(repoRoot, 'src/data/providers.json');
const webProviderCatalogPath = path.join(repoRoot, 'web/src/data/providers.json');

describe('provider catalog sync', () => {
  it('keeps the web-local provider catalog synced with the root catalog', () => {
    expect(existsSync(webProviderCatalogPath)).toBe(true);

    const rootProviderCatalog = JSON.parse(readFileSync(rootProviderCatalogPath, 'utf8'));
    const webProviderCatalog = JSON.parse(readFileSync(webProviderCatalogPath, 'utf8'));

    expect(webProviderCatalog).toEqual(rootProviderCatalog);
  });
});
