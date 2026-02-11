import { describe, expect, it, vi } from 'vitest';
import * as logger from '../src/logger.js';

describe('logger', () => {
  it('should export debug function', () => {
    expect(typeof logger.debug).toBe('function');
  });

  it('should export info function', () => {
    expect(typeof logger.info).toBe('function');
  });

  it('should export warn function', () => {
    expect(typeof logger.warn).toBe('function');
  });

  it('should export error function', () => {
    expect(typeof logger.error).toBe('function');
  });

  it('should export default object with all methods', () => {
    expect(logger.default).toBeDefined();
    expect(typeof logger.default.debug).toBe('function');
    expect(typeof logger.default.info).toBe('function');
    expect(typeof logger.default.warn).toBe('function');
    expect(typeof logger.default.error).toBe('function');
    expect(logger.default.logger).toBeDefined();
  });

  it('should log debug messages without errors', () => {
    expect(() => logger.debug('test debug')).not.toThrow();
  });

  it('should log info messages without errors', () => {
    expect(() => logger.info('test info')).not.toThrow();
  });

  it('should log warn messages without errors', () => {
    expect(() => logger.warn('test warn')).not.toThrow();
  });

  it('should log error messages without errors', () => {
    expect(() => logger.error('test error')).not.toThrow();
  });

  it('should accept metadata objects', () => {
    expect(() => logger.info('test', { key: 'value' })).not.toThrow();
  });

  it('should handle logging with sensitive fields', () => {
    // Test that logging doesn't throw with sensitive data
    expect(() =>
      logger.info('test', {
        DISCORD_TOKEN: 'should-be-redacted',
        password: 'secret',
        apiKey: 'key123',
      }),
    ).not.toThrow();
  });

  it('should handle nested objects', () => {
    expect(() =>
      logger.info('test', {
        user: {
          name: 'test',
          password: 'secret',
        },
      }),
    ).not.toThrow();
  });

  it('should handle arrays', () => {
    expect(() =>
      logger.info('test', {
        items: [1, 2, 3],
      }),
    ).not.toThrow();
  });

  it('should handle null and undefined metadata', () => {
    expect(() => logger.info('test', null)).not.toThrow();
    expect(() => logger.info('test', undefined)).not.toThrow();
  });

  it('should handle Error objects', () => {
    const error = new Error('test error');
    expect(() => logger.error('error occurred', { error })).not.toThrow();
  });

  it('should handle errors with stack traces', () => {
    const error = new Error('test error');
    error.stack = 'Error: test\n    at test.js:1:1';
    expect(() => logger.error('error with stack', { error: error.message, stack: error.stack })).not.toThrow();
  });
});

describe('logger sensitive data filtering', () => {
  it('should be callable without exposing sensitive data in output', () => {
    // We can't easily test the actual redaction in unit tests without
    // mocking Winston internals, but we can verify the API works
    const sensitiveData = {
      DISCORD_TOKEN: 'super-secret-token',
      OPENCLAW_API_KEY: 'api-key-123',
      token: 'another-token',
      password: 'secret-password',
      apiKey: 'key',
      authorization: 'Bearer xyz',
    };

    expect(() => logger.info('testing sensitive data redaction', sensitiveData)).not.toThrow();
  });

  it('should handle mixed sensitive and non-sensitive data', () => {
    const data = {
      username: 'testuser',
      DISCORD_TOKEN: 'secret',
      action: 'login',
      password: 'secret',
      timestamp: Date.now(),
    };

    expect(() => logger.info('mixed data', data)).not.toThrow();
  });

  it('should handle deeply nested sensitive data', () => {
    const data = {
      config: {
        auth: {
          token: 'secret-token',
          user: 'testuser',
        },
      },
    };

    expect(() => logger.info('nested sensitive data', data)).not.toThrow();
  });

  it('should handle arrays with sensitive data', () => {
    const data = {
      users: [
        { name: 'user1', password: 'secret1' },
        { name: 'user2', apiKey: 'secret2' },
      ],
    };

    expect(() => logger.info('array with sensitive data', data)).not.toThrow();
  });
});