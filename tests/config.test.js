import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, '..', 'config.json');

describe('config.json', () => {
  let config;

  beforeAll(() => {
    const raw = readFileSync(configPath, 'utf-8');
    config = JSON.parse(raw);
  });

  it('should be valid JSON', () => {
    expect(typeof config).toBe('object');
    expect(config).not.toBeNull();
  });

  it('should have an ai section', () => {
    expect(config).toHaveProperty('ai');
    expect(typeof config.ai.enabled).toBe('boolean');
    expect(typeof config.ai.systemPrompt).toBe('string');
    expect(Array.isArray(config.ai.channels)).toBe(true);
  });

  it('should have a triage section', () => {
    expect(config).toHaveProperty('triage');
    expect(typeof config.triage.enabled).toBe('boolean');
    expect(typeof config.triage.defaultInterval).toBe('number');
    expect(typeof config.triage.maxBufferSize).toBe('number');
    expect(typeof config.triage.classifyModel).toBe('string');
    expect(typeof config.triage.classifyBudget).toBe('number');
    expect(typeof config.triage.respondModel).toBe('string');
    expect(typeof config.triage.respondBudget).toBe('number');
    expect(typeof config.triage.tokenRecycleLimit).toBe('number');
    expect(typeof config.triage.timeout).toBe('number');
    expect(typeof config.triage.moderationResponse).toBe('boolean');
    expect(Array.isArray(config.triage.triggerWords)).toBe(true);
    expect(Array.isArray(config.triage.moderationKeywords)).toBe(true);
  });

  it('should have a welcome section', () => {
    expect(config).toHaveProperty('welcome');
    expect(typeof config.welcome.enabled).toBe('boolean');
    expect(typeof config.welcome.channelId).toBe('string');
  });

  it('should have a moderation section', () => {
    expect(config).toHaveProperty('moderation');
    expect(typeof config.moderation.enabled).toBe('boolean');
    expect(typeof config.moderation.alertChannelId).toBe('string');
  });

  it('should have a permissions section', () => {
    expect(config).toHaveProperty('permissions');
    expect(typeof config.permissions.enabled).toBe('boolean');
    expect(config.permissions).toHaveProperty('allowedCommands');
  });

  it('should have a logging section', () => {
    expect(config).toHaveProperty('logging');
    expect(typeof config.logging.level).toBe('string');
  });
});
