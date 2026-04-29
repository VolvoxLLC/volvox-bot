import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  AI_AUTOMOD_ACTION_OPTIONS,
  AI_AUTOMOD_CATEGORIES,
  type SelectableAiAutoModAction,
} from '@/data/ai-automod-catalog';
import type { AiAutoModCategory } from '@/types/config';

type BackendAiAutoModModule = {
  AI_AUTOMOD_ACTION_TYPES: readonly SelectableAiAutoModAction[];
  AI_AUTOMOD_CATEGORIES: readonly { key: AiAutoModCategory }[];
  getAiAutoModConfig: (config: { aiAutoMod?: object }) => {
    thresholds: Record<AiAutoModCategory, number>;
    actions: Record<AiAutoModCategory, SelectableAiAutoModAction[]>;
  };
};

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDirectory, '../../..');
const backendAiAutoModModuleUrl = pathToFileURL(path.join(repoRoot, 'src/modules/aiAutoMod.js')).href;

async function loadBackendAiAutoModModule() {
  return (await import(/* @vite-ignore */ backendAiAutoModModuleUrl)) as BackendAiAutoModModule;
}

describe('AI auto-mod catalog sync', () => {
  it('keeps the web-local catalog aligned with backend categories, defaults, and actions', async () => {
    const backendAiAutoMod = await loadBackendAiAutoModModule();
    const backendDefaults = backendAiAutoMod.getAiAutoModConfig({ aiAutoMod: {} });

    expect(AI_AUTOMOD_CATEGORIES.map(({ key }) => key)).toEqual(
      backendAiAutoMod.AI_AUTOMOD_CATEGORIES.map(({ key }) => key),
    );

    const webDefaultThresholds = Object.fromEntries(
      AI_AUTOMOD_CATEGORIES.map(({ key, defaultThreshold }) => [key, defaultThreshold]),
    ) as Record<AiAutoModCategory, number>;
    const webDefaultActions = Object.fromEntries(
      AI_AUTOMOD_CATEGORIES.map(({ key, defaultActions }) => [key, [...defaultActions]]),
    ) as Record<AiAutoModCategory, SelectableAiAutoModAction[]>;

    expect(webDefaultThresholds).toEqual(backendDefaults.thresholds);
    expect(webDefaultActions).toEqual(backendDefaults.actions);
    expect(AI_AUTOMOD_ACTION_OPTIONS.map(({ value }) => value)).toEqual(
      backendAiAutoMod.AI_AUTOMOD_ACTION_TYPES,
    );
  });
});
