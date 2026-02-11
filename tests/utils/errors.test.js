import { describe, expect, it } from 'vitest';
import {
  classifyError,
  ErrorType,
  getSuggestedNextSteps,
  getUserFriendlyMessage,
  isRetryable,
} from '../../src/utils/errors.js';

describe('ErrorType', () => {
  it('should export all error type constants', () => {
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
  it('should return UNKNOWN for null/undefined error', () => {
    expect(classifyError(null)).toBe(ErrorType.UNKNOWN);
    expect(classifyError(undefined)).toBe(ErrorType.UNKNOWN);
  });

  it('should classify ECONNREFUSED as NETWORK', () => {
    const err = new Error('connection refused');
    err.code = 'ECONNREFUSED';
    expect(classifyError(err)).toBe(ErrorType.NETWORK);
  });

  it('should classify ENOTFOUND as NETWORK', () => {
    const err = new Error('not found');
    err.code = 'ENOTFOUND';
    expect(classifyError(err)).toBe(ErrorType.NETWORK);
  });

  it('should classify ETIMEDOUT as TIMEOUT', () => {
    const err = new Error('timed out');
    err.code = 'ETIMEDOUT';
    // ETIMEDOUT removed from NETWORK codes — falls through to TIMEOUT check
    expect(classifyError(err)).toBe(ErrorType.TIMEOUT);
  });

  it('should classify timeout message as TIMEOUT', () => {
    const err = new Error('Request timeout exceeded');
    expect(classifyError(err)).toBe(ErrorType.TIMEOUT);
  });

  it('should classify "fetch failed" as NETWORK', () => {
    const err = new Error('fetch failed');
    expect(classifyError(err)).toBe(ErrorType.NETWORK);
  });

  it('should classify "network" in message as NETWORK', () => {
    const err = new Error('network error occurred');
    expect(classifyError(err)).toBe(ErrorType.NETWORK);
  });

  it('should classify HTTP 401 as API_UNAUTHORIZED', () => {
    const err = new Error('unauthorized');
    expect(classifyError(err, { status: 401 })).toBe(ErrorType.API_UNAUTHORIZED);
  });

  it('should classify HTTP 403 as API_UNAUTHORIZED', () => {
    const err = new Error('forbidden');
    expect(classifyError(err, { status: 403 })).toBe(ErrorType.API_UNAUTHORIZED);
  });

  it('should classify HTTP 404 as API_NOT_FOUND', () => {
    const err = new Error('not found');
    expect(classifyError(err, { status: 404 })).toBe(ErrorType.API_NOT_FOUND);
  });

  it('should classify HTTP 429 as API_RATE_LIMIT', () => {
    const err = new Error('too many requests');
    expect(classifyError(err, { status: 429 })).toBe(ErrorType.API_RATE_LIMIT);
  });

  it('should classify HTTP 500 as API_SERVER_ERROR', () => {
    const err = new Error('internal server error');
    expect(classifyError(err, { status: 500 })).toBe(ErrorType.API_SERVER_ERROR);
  });

  it('should classify HTTP 503 as API_SERVER_ERROR', () => {
    const err = new Error('service unavailable');
    expect(classifyError(err, { status: 503 })).toBe(ErrorType.API_SERVER_ERROR);
  });

  it('should classify HTTP 400 as API_ERROR', () => {
    const err = new Error('bad request');
    expect(classifyError(err, { status: 400 })).toBe(ErrorType.API_ERROR);
  });

  it('should classify Discord code 50001 as DISCORD_MISSING_ACCESS', () => {
    const err = new Error('missing access');
    err.code = 50001;
    expect(classifyError(err)).toBe(ErrorType.DISCORD_MISSING_ACCESS);
  });

  it('should classify "missing access" message as DISCORD_MISSING_ACCESS', () => {
    const err = new Error('Missing Access');
    expect(classifyError(err)).toBe(ErrorType.DISCORD_MISSING_ACCESS);
  });

  it('should classify Discord code 50013 as DISCORD_PERMISSION', () => {
    const err = new Error('missing permissions');
    err.code = 50013;
    expect(classifyError(err)).toBe(ErrorType.DISCORD_PERMISSION);
  });

  it('should classify "missing permissions" message as DISCORD_PERMISSION', () => {
    const err = new Error('Missing Permissions');
    expect(classifyError(err)).toBe(ErrorType.DISCORD_PERMISSION);
  });

  it('should classify Discord code 10003 as DISCORD_CHANNEL_NOT_FOUND', () => {
    const err = new Error('unknown channel');
    err.code = 10003;
    expect(classifyError(err)).toBe(ErrorType.DISCORD_CHANNEL_NOT_FOUND);
  });

  it('should classify "unknown channel" message as DISCORD_CHANNEL_NOT_FOUND', () => {
    const err = new Error('Unknown Channel');
    expect(classifyError(err)).toBe(ErrorType.DISCORD_CHANNEL_NOT_FOUND);
  });

  it('should classify "config.json not found" as CONFIG_MISSING', () => {
    const err = new Error('config.json not found');
    expect(classifyError(err)).toBe(ErrorType.CONFIG_MISSING);
  });

  it('should classify ENOENT as CONFIG_MISSING', () => {
    const err = new Error('ENOENT: no such file');
    expect(classifyError(err)).toBe(ErrorType.CONFIG_MISSING);
  });

  it('should classify "invalid config" as CONFIG_INVALID', () => {
    const err = new Error('Invalid config file');
    expect(classifyError(err)).toBe(ErrorType.CONFIG_INVALID);
  });

  it('should classify "api error" message as API_ERROR', () => {
    const err = new Error('API error occurred');
    expect(classifyError(err)).toBe(ErrorType.API_ERROR);
  });

  it('should classify isApiError context as API_ERROR', () => {
    const err = new Error('something happened');
    expect(classifyError(err, { isApiError: true })).toBe(ErrorType.API_ERROR);
  });

  it('should use error.status directly', () => {
    const err = new Error('error');
    err.status = 429;
    expect(classifyError(err)).toBe(ErrorType.API_RATE_LIMIT);
  });

  it('should use context.statusCode', () => {
    const err = new Error('error');
    expect(classifyError(err, { statusCode: 500 })).toBe(ErrorType.API_SERVER_ERROR);
  });

  it('should use context.code for network errors', () => {
    const err = new Error('something');
    expect(classifyError(err, { code: 'ECONNREFUSED' })).toBe(ErrorType.NETWORK);
  });

  it('should return UNKNOWN for unrecognized errors', () => {
    const err = new Error('some random error');
    expect(classifyError(err)).toBe(ErrorType.UNKNOWN);
  });
});

describe('getUserFriendlyMessage', () => {
  it('should return appropriate message for NETWORK errors', () => {
    const err = new Error('fetch failed');
    const msg = getUserFriendlyMessage(err);
    expect(msg).toContain('trouble connecting');
  });

  it('should return appropriate message for TIMEOUT errors', () => {
    const err = new Error('timeout');
    const msg = getUserFriendlyMessage(err);
    expect(msg).toContain('too long');
  });

  it('should return appropriate message for rate limit errors', () => {
    const err = new Error('rate limited');
    const msg = getUserFriendlyMessage(err, { status: 429 });
    expect(msg).toContain('too many requests');
  });

  it('should return appropriate message for UNKNOWN errors', () => {
    const err = new Error('unknown');
    const msg = getUserFriendlyMessage(err);
    expect(msg).toContain('unexpected');
  });

  it('should return default message for error with empty message', () => {
    const err = new Error();
    const msg = getUserFriendlyMessage(err);
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
  });
});

describe('getSuggestedNextSteps', () => {
  it('should return suggestion for NETWORK errors', () => {
    const err = new Error('fetch failed');
    const steps = getSuggestedNextSteps(err);
    expect(steps).toContain('AI service');
  });

  it('should return suggestion for TIMEOUT errors', () => {
    const err = new Error('timeout');
    const steps = getSuggestedNextSteps(err);
    expect(steps).toContain('shorter');
  });

  it('should return suggestion for API_RATE_LIMIT errors', () => {
    const err = new Error('rate');
    const steps = getSuggestedNextSteps(err, { status: 429 });
    expect(steps).toContain('Wait');
  });

  it('should return suggestion for API_UNAUTHORIZED errors', () => {
    const err = new Error('unauth');
    const steps = getSuggestedNextSteps(err, { status: 401 });
    expect(steps).toContain('OPENCLAW_API_KEY');
  });

  it('should return suggestion for API_NOT_FOUND errors', () => {
    const err = new Error('not found');
    const steps = getSuggestedNextSteps(err, { status: 404 });
    expect(steps).toContain('OPENCLAW_API_URL');
  });

  it('should return suggestion for API_SERVER_ERROR', () => {
    const err = new Error('server');
    const steps = getSuggestedNextSteps(err, { status: 500 });
    expect(steps).toContain('recover');
  });

  it('should return suggestion for DISCORD_PERMISSION', () => {
    const err = new Error('Missing Permissions');
    const steps = getSuggestedNextSteps(err);
    expect(steps).toContain('permissions');
  });

  it('should return suggestion for DISCORD_CHANNEL_NOT_FOUND', () => {
    const err = new Error('Unknown Channel');
    const steps = getSuggestedNextSteps(err);
    expect(steps).toContain('channel');
  });

  it('should return suggestion for DISCORD_MISSING_ACCESS', () => {
    const err = new Error('Missing Access');
    const steps = getSuggestedNextSteps(err);
    expect(steps).toContain('access');
  });

  it('should return suggestion for CONFIG_MISSING', () => {
    const err = new Error('config.json not found');
    const steps = getSuggestedNextSteps(err);
    expect(steps).toContain('config.json');
  });

  it('should return suggestion for CONFIG_INVALID', () => {
    const err = new Error('Invalid config file');
    const steps = getSuggestedNextSteps(err);
    expect(steps).toContain('syntax');
  });

  it('should return null for UNKNOWN errors', () => {
    const err = new Error('totally unknown');
    const steps = getSuggestedNextSteps(err);
    expect(steps).toBeNull();
  });
});

describe('isRetryable', () => {
  it('should return true for NETWORK errors', () => {
    const err = new Error('fetch failed');
    expect(isRetryable(err)).toBe(true);
  });

  it('should return true for TIMEOUT errors', () => {
    const err = new Error('timeout');
    expect(isRetryable(err)).toBe(true);
  });

  it('should return true for API_SERVER_ERROR', () => {
    const err = new Error('server error');
    expect(isRetryable(err, { status: 500 })).toBe(true);
  });

  it('should return true for API_RATE_LIMIT', () => {
    const err = new Error('rate limit');
    expect(isRetryable(err, { status: 429 })).toBe(true);
  });

  it('should return false for API_UNAUTHORIZED', () => {
    const err = new Error('unauthorized');
    expect(isRetryable(err, { status: 401 })).toBe(false);
  });

  it('should return false for CONFIG_MISSING', () => {
    const err = new Error('config.json not found');
    expect(isRetryable(err)).toBe(false);
  });

  it('should return false for UNKNOWN errors', () => {
    const err = new Error('unknown error');
    expect(isRetryable(err)).toBe(false);
  });

  it('should return false for DISCORD_PERMISSION', () => {
    const err = new Error('Missing Permissions');
    expect(isRetryable(err)).toBe(false);
  });
});
