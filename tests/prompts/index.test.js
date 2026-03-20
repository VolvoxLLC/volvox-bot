import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { clearPromptCache, loadPrompt, promptPath } from '../../src/prompts/index.js';

const targetName = 'triage-classify';

beforeEach(() => {
  clearPromptCache();
  vi.restoreAllMocks();
});

describe('src/prompts/index', () => {
  it('loads and interpolates a prompt template successfully', () => {
    const result = loadPrompt(targetName, {
      communityRules: 'RULES-123',
      conversationText: 'CONVO-TEXT',
      botUserId: '999',
    });

    expect(result).toContain('RULES-123');
    expect(result).toContain('CONVO-TEXT');
    expect(result).toContain('999');
  });

  it('throws a helpful error when the prompt file is missing', () => {
    expect(() => loadPrompt('does-not-exist')).toThrow(/Failed to load prompt "does-not-exist"/);
  });

  it('promptPath returns an absolute path to the .md file', () => {
    const p = promptPath(targetName);
    expect(isAbsolute(p)).toBe(true);
    expect(p.endsWith(`${targetName}.md`)).toBe(true);
    const disk = readFileSync(p, 'utf-8');
    expect(disk.length).toBeGreaterThan(0);
  });
});
;
