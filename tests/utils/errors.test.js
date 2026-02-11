import { describe, expect, it } from 'vitest';
import {
  ErrorType,
  classifyError,
  getPermissionError,
  getSuggestedNextSteps,
  getUserFriendlyMessage,
  isRetryable,
} from '../../src/utils/errors.js';

describe('ErrorType', () => {
  it('should export all error types', () => {
    expect(ErrorType.NETWORK).toBe('network');
    expect(ErrorType.TIMEOUT).toBe('timeout');
    expect(ErrorType.API_ERROR).toBe('api_error');
    expect(ErrorType.API_RATE_LIMIT).toBe('api_rate_limit');
    expect(ErrorType.API_UNAUTHORIZED).toBe('api_unauthorized');
    expect(ErrorType.API_NOT_FOUND).toBe('api_not_found');
    expect(ErrorType.API_SERVER_ERROR).toBe('api_server_error');
    expect(ErrorType.DISCORD_PERMISSION).toBe('discord_permission');
    expect(ErrorType.DISCORD_CHANNEL_NOT_FOUND).toBe('discord_channel_not_found');
    expect(ErrorType.DISCORD_MISSING_ACCESS).toBe('discord_missing_access');
    expect(ErrorType.CONFIG_MISSING).toBe('config_missing');
    expect(ErrorType.CONFIG_INVALID).toBe('config_invalid');
    expect(ErrorType.UNKNOWN).toBe('unknown');
  });
});

describe('classifyError', () => {
  it('should return UNKNOWN for null error', () => {
    expect(classifyError(null)).toBe(ErrorType.UNKNOWN);
  });

  it('should classify network errors by code', () => {
    expect(classifyError({ code: 'ECONNREFUSED' })).toBe(ErrorType.NETWORK);
    expect(classifyError({ code: 'ENOTFOUND' })).toBe(ErrorType.NETWORK);
    expect(classifyError({ code: 'ETIMEDOUT' })).toBe(ErrorType.NETWORK); // ETIMEDOUT is caught as NETWORK first in line 51
  });

  it('should classify network errors by message', () => {
    expect(classifyError(new Error('fetch failed'))).toBe(ErrorType.NETWORK);
    expect(classifyError(new Error('network error occurred'))).toBe(ErrorType.NETWORK);
    expect(classifyError(new Error('timeout exceeded'))).toBe(ErrorType.TIMEOUT);
  });

  it('should classify HTTP status code errors', () => {
    expect(classifyError({}, { status: 401 })).toBe(ErrorType.API_UNAUTHORIZED);
    expect(classifyError({}, { status: 403 })).toBe(ErrorType.API_UNAUTHORIZED);
    expect(classifyError({}, { status: 404 })).toBe(ErrorType.API_NOT_FOUND);
    expect(classifyError({}, { status: 429 })).toBe(ErrorType.API_RATE_LIMIT);
    expect(classifyError({}, { status: 500 })).toBe(ErrorType.API_SERVER_ERROR);
    expect(classifyError({}, { status: 503 })).toBe(ErrorType.API_SERVER_ERROR);
    expect(classifyError({}, { status: 400 })).toBe(ErrorType.API_ERROR);
  });

  it('should classify Discord-specific errors', () => {
    expect(classifyError({ code: 50001 })).toBe(ErrorType.DISCORD_MISSING_ACCESS);
    expect(classifyError({ message: 'missing access' })).toBe(ErrorType.DISCORD_MISSING_ACCESS);
    expect(classifyError({ code: 50013 })).toBe(ErrorType.DISCORD_PERMISSION);
    expect(classifyError({ message: 'missing permissions' })).toBe(ErrorType.DISCORD_PERMISSION);
    expect(classifyError({ code: 10003 })).toBe(ErrorType.DISCORD_CHANNEL_NOT_FOUND);
    expect(classifyError({ message: 'unknown channel' })).toBe(ErrorType.DISCORD_CHANNEL_NOT_FOUND);
  });

  it('should classify config errors', () => {
    expect(classifyError(new Error('config.json not found'))).toBe(ErrorType.CONFIG_MISSING);
    expect(classifyError(new Error('ENOENT: config file'))).toBe(ErrorType.CONFIG_MISSING);
    expect(classifyError(new Error('invalid config structure'))).toBe(ErrorType.CONFIG_INVALID);
  });

  it('should classify API errors', () => {
    expect(classifyError(new Error('api error occurred'))).toBe(ErrorType.API_ERROR);
    expect(classifyError({}, { isApiError: true })).toBe(ErrorType.API_ERROR);
  });

  it('should prioritize message check over status code', () => {
    // The 'network' in message is caught before status codes are checked
    expect(classifyError(new Error('network error'), { status: 404 })).toBe(ErrorType.NETWORK);
  });
});

describe('getUserFriendlyMessage', () => {
  it('should return friendly message for network errors', () => {
    const error = { code: 'ECONNREFUSED' };
    const message = getUserFriendlyMessage(error);
    expect(message).toContain('trouble connecting');
    expect(message).toContain('brain');
  });

  it('should return friendly message for timeout errors', () => {
    const error = new Error('timeout');
    const message = getUserFriendlyMessage(error);
    expect(message).toContain('took too long');
  });

  it('should return friendly message for rate limit errors', () => {
    const error = {};
    const message = getUserFriendlyMessage(error, { status: 429 });
    expect(message).toContain('too many requests');
    expect(message).toContain('breather');
  });

  it('should return friendly message for unauthorized errors', () => {
    const error = {};
    const message = getUserFriendlyMessage(error, { status: 401 });
    expect(message).toContain('authentication');
    expect(message).toContain('credentials');
  });

  it('should return friendly message for Discord permission errors', () => {
    const error = { code: 50013 };
    const message = getUserFriendlyMessage(error);
    expect(message).toContain('permission');
  });

  it('should return friendly message for config errors', () => {
    const error = new Error('config.json not found');
    const message = getUserFriendlyMessage(error);
    expect(message).toContain('Configuration file');
  });

  it('should return generic message for unknown errors', () => {
    const error = new Error('something weird');
    const message = getUserFriendlyMessage(error);
    expect(message).toContain('unexpected');
  });
});

describe('getSuggestedNextSteps', () => {
  it('should return suggestions for network errors', () => {
    const error = { code: 'ECONNREFUSED' };
    const steps = getSuggestedNextSteps(error);
    expect(steps).toContain('OpenClaw');
    expect(steps).toContain('running');
  });

  it('should return suggestions for timeout errors', () => {
    const error = new Error('timeout');
    const steps = getSuggestedNextSteps(error);
    expect(steps).toContain('shorter message');
  });

  it('should return suggestions for rate limit errors', () => {
    const error = {};
    const steps = getSuggestedNextSteps(error, { status: 429 });
    expect(steps).toContain('60 seconds');
  });

  it('should return suggestions for unauthorized errors', () => {
    const error = {};
    const steps = getSuggestedNextSteps(error, { status: 401 });
    expect(steps).toContain('OPENCLAW_API_KEY');
  });

  it('should return null for unknown errors with no suggestions', () => {
    const error = new Error('random error');
    const steps = getSuggestedNextSteps(error);
    expect(steps).toBeNull();
  });

  it('should return suggestions for config errors', () => {
    const error = new Error('config.json not found');
    const steps = getSuggestedNextSteps(error);
    expect(steps).toContain('config.json');
    expect(steps).toContain('config.example.json');
  });
});

describe('isRetryable', () => {
  it('should return true for network errors', () => {
    expect(isRetryable({ code: 'ECONNREFUSED' })).toBe(true);
    expect(isRetryable(new Error('network error'))).toBe(true);
  });

  it('should return true for timeout errors', () => {
    expect(isRetryable({ code: 'ETIMEDOUT' })).toBe(true);
    expect(isRetryable(new Error('timeout'))).toBe(true);
  });

  it('should return true for server errors', () => {
    expect(isRetryable({}, { status: 500 })).toBe(true);
    expect(isRetryable({}, { status: 503 })).toBe(true);
  });

  it('should return true for rate limit errors', () => {
    expect(isRetryable({}, { status: 429 })).toBe(true);
  });

  it('should return false for unauthorized errors', () => {
    expect(isRetryable({}, { status: 401 })).toBe(false);
  });

  it('should return false for not found errors', () => {
    expect(isRetryable({}, { status: 404 })).toBe(false);
  });

  it('should return false for config errors', () => {
    expect(isRetryable(new Error('config.json not found'))).toBe(false);
  });

  it('should return false for Discord permission errors', () => {
    expect(isRetryable({ code: 50013 })).toBe(false);
  });

  it('should return false for unknown errors', () => {
    expect(isRetryable(new Error('unknown error'))).toBe(false);
  });
});