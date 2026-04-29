import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadDevEnv } from '../../scripts/dev-env.js';

const ENV_KEY = '__VOLVOX_DEV_ENV_TEST';

describe('dev env loader', () => {
  const originalValue = process.env[ENV_KEY];
  const tempDirs = [];

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = originalValue;
    }

    for (const tempDir of tempDirs.splice(0)) {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('should let the env file override stale exported variables', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'volvox-dev-env-'));
    const envFilePath = join(tempDir, '.env');
    tempDirs.push(tempDir);

    process.env[ENV_KEY] = 'old';
    writeFileSync(envFilePath, `${ENV_KEY}=new\n`);

    loadDevEnv(envFilePath);

    expect(process.env[ENV_KEY]).toBe('new');
  });
});
