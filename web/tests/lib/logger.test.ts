import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('logger', () => {
  let originalWindow: Window & typeof globalThis;
  let originalStdout: NodeJS.WriteStream;

  beforeEach(() => {
    vi.resetModules();
    originalWindow = window;
    originalStdout = process.stdout;
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      value: originalWindow,
      configurable: true,
    });
    Object.defineProperty(process, 'stdout', {
      value: originalStdout,
      configurable: true,
    });
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('suppresses debug/info outside development and keeps browser warn/error active', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { logger } = await import('@/lib/logger');

    logger.debug('debug');
    logger.info('info');
    logger.warn('warn');
    logger.error('error');

    expect(debugSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[VolvoxDash]'), 'warn');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[VolvoxDash]'), 'error');
  });

  it('emits browser debug and info logs during development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    const { logger } = await import('@/lib/logger');

    logger.debug('debug');
    logger.info('info');

    expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('[DEBUG]'), 'debug');
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('[INFO]'), 'info');
  });

  it('writes server info/debug to stdout and warn/error to stderr with formatted arguments', async () => {
    Object.defineProperty(globalThis, 'window', {
      value: undefined,
      configurable: true,
    });
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const circular: { self?: unknown } = {};
    circular.self = circular;

    const { logger } = await import('@/lib/logger');

    logger.info('hello', { ok: true });
    logger.debug(circular);
    logger.warn('careful');
    logger.error(new Error('boom'));

    expect(stdoutWrite).toHaveBeenCalledTimes(2);
    expect(String(stdoutWrite.mock.calls[0]?.[0])).toContain('[INFO] hello {"ok":true}');
    expect(String(stdoutWrite.mock.calls[1]?.[0])).toContain('[DEBUG] [object Object]');
    expect(stderrWrite).toHaveBeenCalledTimes(2);
    expect(String(stderrWrite.mock.calls[0]?.[0])).toContain('[WARN] careful');
    expect(String(stderrWrite.mock.calls[1]?.[0])).toContain('[ERROR] {"name":"Error","message":"boom"');
  });

  it('skips server writes when the stream has no write method', async () => {
    Object.defineProperty(globalThis, 'window', {
      value: undefined,
      configurable: true,
    });
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    Object.defineProperty(process, 'stdout', {
      value: {},
      configurable: true,
    });

    const { logger } = await import('@/lib/logger');
    logger.info('ignored');

    expect(stdoutWrite).not.toHaveBeenCalled();
  });
});
