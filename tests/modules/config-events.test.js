import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

// Mock db module
vi.mock('../../src/db.js', () => ({
  getPool: vi.fn(),
}));

// Mock fs
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

describe('config change events', () => {
  let configModule;

  beforeEach(async () => {
    vi.resetModules();
    vi.mock('../../src/logger.js', () => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }));
    vi.mock('../../src/db.js', () => ({
      getPool: vi.fn(),
    }));
    vi.mock('node:fs', () => ({
      existsSync: vi.fn(),
      readFileSync: vi.fn(),
    }));

    const { existsSync: mockExists, readFileSync: mockRead } = await import('node:fs');
    mockExists.mockReturnValue(true);
    mockRead.mockReturnValue(
      JSON.stringify({
        ai: { enabled: true, model: 'test-model' },
        spam: { enabled: false, threshold: 5 },
        logging: { level: 'info' },
      }),
    );

    // DB not available — in-memory only for simplicity
    const { getPool: mockGetPool } = await import('../../src/db.js');
    mockGetPool.mockImplementation(() => {
      throw new Error('no db');
    });

    configModule = await import('../../src/modules/config.js');
    await configModule.loadConfig();
  });

  afterEach(() => {
    configModule.clearConfigListeners();
    vi.restoreAllMocks();
  });

  it('should fire callback on exact path match', async () => {
    const cb = vi.fn();
    configModule.onConfigChange('ai.model', cb);

    await configModule.setConfigValue('ai.model', 'new-model');

    expect(cb).toHaveBeenCalledOnce();
    expect(cb).toHaveBeenCalledWith('new-model', 'test-model', 'ai.model', 'global');
  });

  it('should fire callback on prefix wildcard match', async () => {
    const cb = vi.fn();
    configModule.onConfigChange('ai.*', cb);

    await configModule.setConfigValue('ai.model', 'new-model');

    expect(cb).toHaveBeenCalledOnce();
    expect(cb).toHaveBeenCalledWith('new-model', 'test-model', 'ai.model', 'global');
  });

  it('should not fire callback for non-matching paths', async () => {
    const cb = vi.fn();
    configModule.onConfigChange('spam.*', cb);

    await configModule.setConfigValue('ai.model', 'new-model');

    expect(cb).not.toHaveBeenCalled();
  });

  it('should not fire prefix callback for unrelated section', async () => {
    const cb = vi.fn();
    configModule.onConfigChange('ai.*', cb);

    await configModule.setConfigValue('spam.threshold', '10');

    expect(cb).not.toHaveBeenCalled();
  });

  it('should unsubscribe with offConfigChange', async () => {
    const cb = vi.fn();
    configModule.onConfigChange('ai.model', cb);
    configModule.offConfigChange('ai.model', cb);

    await configModule.setConfigValue('ai.model', 'new-model');

    expect(cb).not.toHaveBeenCalled();
  });

  it('should only remove the specific callback on offConfigChange', async () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    configModule.onConfigChange('ai.model', cb1);
    configModule.onConfigChange('ai.model', cb2);
    configModule.offConfigChange('ai.model', cb1);

    await configModule.setConfigValue('ai.model', 'new-model');

    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledOnce();
  });

  it('should clear all listeners with clearConfigListeners', async () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    configModule.onConfigChange('ai.model', cb1);
    configModule.onConfigChange('spam.*', cb2);
    configModule.clearConfigListeners();

    await configModule.setConfigValue('ai.model', 'new-model');
    await configModule.setConfigValue('spam.threshold', '10');

    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).not.toHaveBeenCalled();
  });

  it('should isolate errors in listener callbacks', async () => {
    const badCb = vi.fn().mockImplementation(() => {
      throw new Error('listener boom');
    });
    const goodCb = vi.fn();
    configModule.onConfigChange('ai.model', badCb);
    configModule.onConfigChange('ai.model', goodCb);

    await configModule.setConfigValue('ai.model', 'new-model');

    expect(badCb).toHaveBeenCalledOnce();
    expect(goodCb).toHaveBeenCalledOnce();

    const { error: mockError } = await import('../../src/logger.js');
    expect(mockError).toHaveBeenCalledWith('Config change listener error', {
      path: 'ai.model',
      error: 'listener boom',
    });
  });

  it('should pass correct old and new values', async () => {
    const cb = vi.fn();
    configModule.onConfigChange('ai.enabled', cb);

    await configModule.setConfigValue('ai.enabled', 'false');

    expect(cb).toHaveBeenCalledWith(false, true, 'ai.enabled', 'global');
  });

  it('should pass undefined as oldValue for new keys', async () => {
    const cb = vi.fn();
    configModule.onConfigChange('ai.*', cb);

    await configModule.setConfigValue('ai.newKey', 'hello');

    expect(cb).toHaveBeenCalledWith('hello', undefined, 'ai.newKey', 'global');
  });

  it('should deep clone object oldValues', async () => {
    // Set a nested object first
    await configModule.setConfigValue('ai.nested', '{"a":1}');

    const cb = vi.fn();
    configModule.onConfigChange('ai.nested', cb);

    await configModule.setConfigValue('ai.nested', '{"a":2}');

    const [, oldValue] = cb.mock.calls[0];
    expect(oldValue).toEqual({ a: 1 });
    // Verify it's a clone, not the live object
    expect(oldValue).not.toBe(configModule.getConfig().ai.nested);
  });

  it('should fire both exact and prefix listeners for same path', async () => {
    const exactCb = vi.fn();
    const prefixCb = vi.fn();
    configModule.onConfigChange('ai.model', exactCb);
    configModule.onConfigChange('ai.*', prefixCb);

    await configModule.setConfigValue('ai.model', 'new-model');

    expect(exactCb).toHaveBeenCalledOnce();
    expect(prefixCb).toHaveBeenCalledOnce();
  });

  it('should handle deeply nested path changes with prefix listener', async () => {
    const cb = vi.fn();
    configModule.onConfigChange('ai.*', cb);

    await configModule.setConfigValue('ai.deep.nested.key', 'value');

    expect(cb).toHaveBeenCalledWith('value', undefined, 'ai.deep.nested.key', 'global');
  });

  it('should not skip listeners when one calls offConfigChange during callback', async () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const cb3 = vi.fn();

    configModule.onConfigChange('ai.model', cb1);
    configModule.onConfigChange('ai.model', cb2);
    configModule.onConfigChange('ai.model', cb3);

    // Second listener unsubscribes itself during iteration
    cb2.mockImplementation(() => {
      configModule.offConfigChange('ai.model', cb2);
    });

    await configModule.setConfigValue('ai.model', 'new-model');

    expect(cb1).toHaveBeenCalledOnce();
    expect(cb2).toHaveBeenCalledOnce();
    expect(cb3).toHaveBeenCalledOnce();
  });

  it('should not skip listeners when one calls clearConfigListeners during callback', async () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const cb3 = vi.fn();

    configModule.onConfigChange('ai.model', cb1);
    configModule.onConfigChange('ai.model', cb2);
    configModule.onConfigChange('ai.model', cb3);

    // First listener clears all listeners during iteration
    cb1.mockImplementation(() => {
      configModule.clearConfigListeners();
    });

    await configModule.setConfigValue('ai.model', 'new-model');

    expect(cb1).toHaveBeenCalledOnce();
    expect(cb2).toHaveBeenCalledOnce();
    expect(cb3).toHaveBeenCalledOnce();
  });

  it('should catch async listener rejections without unhandled promise rejection', async () => {
    const asyncBadCb = vi.fn().mockRejectedValue(new Error('async boom'));
    const goodCb = vi.fn();
    configModule.onConfigChange('ai.model', asyncBadCb);
    configModule.onConfigChange('ai.model', goodCb);

    await configModule.setConfigValue('ai.model', 'new-model');

    expect(asyncBadCb).toHaveBeenCalledOnce();
    expect(goodCb).toHaveBeenCalledOnce();

    const { warn: mockWarn } = await import('../../src/logger.js');
    expect(mockWarn).toHaveBeenCalledWith('Async config change listener error', {
      path: 'ai.model',
      error: 'async boom',
    });
  });
});
