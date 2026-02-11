import { afterEach, describe, expect, it, vi } from 'vitest';

// We need to test the logger module, but it reads config.json at import time.
// Mock fs to control what it reads.
vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue('{}'),
  mkdirSync: vi.fn(),
}));

// Mock winston-daily-rotate-file
vi.mock('winston-daily-rotate-file', () => ({
  default: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
  })),
}));

// NOTE: Logger module is cached after first import. Tests that need fresh
// module state use vi.resetModules() before re-importing. Tests sharing
// the same import get the same winston logger instance.
describe('logger module', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should export debug, info, warn, error functions', async () => {
    const logger = await import('../src/logger.js');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  it('should export default object with all log functions', async () => {
    const logger = await import('../src/logger.js');
    expect(typeof logger.default.debug).toBe('function');
    expect(typeof logger.default.info).toBe('function');
    expect(typeof logger.default.warn).toBe('function');
    expect(typeof logger.default.error).toBe('function');
    expect(logger.default.logger).toBeDefined();
  });

  it('should call log functions without errors', async () => {
    const logger = await import('../src/logger.js');
    // These should not throw
    logger.debug('debug message', { key: 'value' });
    logger.info('info message', { key: 'value' });
    logger.warn('warn message', { key: 'value' });
    logger.error('error message', { key: 'value' });
  });

  it('should call with empty meta', async () => {
    const logger = await import('../src/logger.js');
    logger.debug('debug');
    logger.info('info');
    logger.warn('warn');
    logger.error('error');
  });

  it('should redact sensitive fields', async () => {
    const logger = await import('../src/logger.js');
    // Spy on console transport to capture actual output after redaction
    const transport = logger.default.logger.transports[0];
    const writeSpy = vi.spyOn(transport, 'log').mockImplementation((_info, cb) => cb?.());

    logger.info('test', {
      token: 'secret-token',
      DISCORD_TOKEN: 'secret',
      password: 'pass',
      apiKey: 'key',
      nested: {
        token: 'nested-secret',
        safe: 'visible',
      },
    });

    expect(writeSpy).toHaveBeenCalled();
    const loggedInfo = writeSpy.mock.calls[0][0];
    expect(loggedInfo.token).toBe('[REDACTED]');
    expect(loggedInfo.DISCORD_TOKEN).toBe('[REDACTED]');
    expect(loggedInfo.password).toBe('[REDACTED]');
    expect(loggedInfo.apiKey).toBe('[REDACTED]');
    expect(loggedInfo.nested.token).toBe('[REDACTED]');
    expect(loggedInfo.nested.safe).toBe('visible');
  });

  it('should handle array meta values in filter', async () => {
    const logger = await import('../src/logger.js');
    logger.info('test', {
      items: [{ token: 'secret', name: 'item1' }, { name: 'item2' }],
    });
  });

  it('should load with file output enabled config', async () => {
    vi.resetModules();
    vi.mock('node:fs', () => ({
      existsSync: vi.fn().mockReturnValue(true),
      readFileSync: vi.fn().mockReturnValue(
        JSON.stringify({
          logging: { level: 'debug', fileOutput: true },
        }),
      ),
      mkdirSync: vi.fn(),
    }));
    vi.mock('winston-daily-rotate-file', () => ({
      default: vi.fn().mockImplementation(() => ({
        on: vi.fn(),
      })),
    }));

    const logger = await import('../src/logger.js');
    expect(typeof logger.info).toBe('function');
  });

  it('should handle config parse errors gracefully', async () => {
    vi.resetModules();
    vi.mock('node:fs', () => ({
      existsSync: vi.fn().mockReturnValue(true),
      readFileSync: vi.fn().mockReturnValue('invalid json'),
      mkdirSync: vi.fn(),
    }));
    vi.mock('winston-daily-rotate-file', () => ({
      default: vi.fn().mockImplementation(() => ({
        on: vi.fn(),
      })),
    }));

    const logger = await import('../src/logger.js');
    expect(typeof logger.info).toBe('function');
  });
});
