import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('web provider catalog snapshot', () => {
  it('stays in sync with the bot provider catalog used by the web Docker context', () => {
    const botCatalog = JSON.parse(readFileSync('src/data/providers.json', 'utf8'));
    const webCatalog = JSON.parse(readFileSync('web/src/data/providers.json', 'utf8'));

    expect(webCatalog).toEqual(botCatalog);
  });
});
