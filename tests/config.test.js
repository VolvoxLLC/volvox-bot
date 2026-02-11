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
    expect(config).toBeDefined();
    expect(typeof config).toBe('object');
  });

  it('should have an ai section', () => {
    expect(config.ai).toBeDefined();
    expect(typeof config.ai.enabled).toBe('boolean');
    expect(typeof config.ai.model).toBe('string');
    expect(typeof config.ai.maxTokens).toBe('number');
    expect(typeof config.ai.systemPrompt).toBe('string');
    expect(Array.isArray(config.ai.channels)).toBe(true);
  });

  it('should have a welcome section', () => {
    expect(config.welcome).toBeDefined();
    expect(typeof config.welcome.enabled).toBe('boolean');
    expect(typeof config.welcome.channelId).toBe('string');
  });

  it('should have a moderation section', () => {
    expect(config.moderation).toBeDefined();
    expect(typeof config.moderation.enabled).toBe('boolean');
    expect(typeof config.moderation.alertChannelId).toBe('string');
  });

  it('should have a permissions section', () => {
    expect(config.permissions).toBeDefined();
    expect(typeof config.permissions.enabled).toBe('boolean');
    expect(config.permissions.allowedCommands).toBeDefined();
  });

  it('should have a logging section', () => {
    expect(config.logging).toBeDefined();
    expect(typeof config.logging.level).toBe('string');
  });
});
