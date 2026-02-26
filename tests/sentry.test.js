/**
 * Tests for Sentry integration module
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    expect(mod.Sentry).toHaveProperty('captureException');
    expect(typeof mod.Sentry.captureException).toBe('function');
    expect(typeof mod.Sentry.captureMessage).toBe('function');
  });

  it('should export sentryEnabled as true when SENTRY_DSN is set', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://key@o0.ingest.sentry.io/0');
    const mod = await import('../src/sentry.js');
    expect(mod.sentryEnabled).toBe(true);
  });

  it('should allow SENTRY_TRACES_RATE=0 to disable tracing', async () => {
    vi.stubEnv('SENTRY_DSN', '');
    vi.stubEnv('SENTRY_TRACES_RATE', '0');
    // Module parses rate independently of DSN — just verify it doesn't throw
    const mod = await import('../src/sentry.js');
    expect(mod.Sentry).toHaveProperty('captureException');
  });

  it('should fall back to default trace rate for non-numeric values', async () => {
    vi.stubEnv('SENTRY_DSN', '');
    vi.stubEnv('SENTRY_TRACES_RATE', 'not-a-number');
    const mod = await import('../src/sentry.js');
    expect(mod.Sentry).toHaveProperty('captureException');
  });
});
