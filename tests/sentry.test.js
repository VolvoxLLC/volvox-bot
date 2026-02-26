/**
 * Tests for Sentry integration module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('sentry module', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should export sentryEnabled as false when SENTRY_DSN is not set', async () => {
    vi.stubEnv('SENTRY_DSN', '');
    const mod = await import('../src/sentry.js');
    expect(mod.sentryEnabled).toBe(false);
  });

  it('should export Sentry namespace', async () => {
    vi.stubEnv('SENTRY_DSN', '');
    const mod = await import('../src/sentry.js');
    expect(mod.Sentry).toBeDefined();
    expect(typeof mod.Sentry.captureException).toBe('function');
    expect(typeof mod.Sentry.captureMessage).toBe('function');
  });

  it('should export sentryEnabled as true when SENTRY_DSN is set', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://key@o0.ingest.sentry.io/0');
    const mod = await import('../src/sentry.js');
    expect(mod.sentryEnabled).toBe(true);
  });
});
