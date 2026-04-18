/**
 * Tests for src/utils/anthropicClient.js
 * Covers singleton creation, auth option resolution, and the test hook.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the Anthropic SDK before importing the module under test
vi.mock('@anthropic-ai/sdk', () => {
  const MockAnthropic = vi.fn().mockImplementation(function (opts) {
    this._opts = opts ?? {};
  });
  return { default: MockAnthropic };
});

// Dynamic import after mocks are set up
const { _setAnthropicClient, getAnthropicClient } = await import(
  '../../src/utils/anthropicClient.js'
);
// Import the mock via the same dynamic import so we get the mocked version
const { default: Anthropic } = await import('@anthropic-ai/sdk');

describe('anthropicClient', () => {
  // Env var state backup
  let origApiKey;
  let origOAuthToken;

  beforeEach(() => {
    // Reset the singleton before each test
    _setAnthropicClient(null);
    vi.clearAllMocks();

    origApiKey = process.env.ANTHROPIC_API_KEY;
    origOAuthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  });

  afterEach(() => {
    // Restore env vars
    if (origApiKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = origApiKey;
    }
    if (origOAuthToken === undefined) {
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    } else {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = origOAuthToken;
    }
    _setAnthropicClient(null);
  });

  describe('getAnthropicClient', () => {
    it('should call Anthropic constructor and return a client object', () => {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;

      const client = getAnthropicClient();
      // The mock constructor was called and returned an object
      expect(Anthropic).toHaveBeenCalledTimes(1);
      expect(client).toBeTruthy();
      expect(typeof client).toBe('object');
    });

    it('should return the same singleton instance on repeated calls', () => {
      const c1 = getAnthropicClient();
      const c2 = getAnthropicClient();
      expect(c1).toBe(c2);
      // Only one constructor call for both invocations
      expect(Anthropic).toHaveBeenCalledTimes(1);
    });

    it('should construct client with apiKey when ANTHROPIC_API_KEY is set', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-test-key';
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;

      const client = getAnthropicClient();
      expect(Anthropic).toHaveBeenCalledWith({ apiKey: 'sk-ant-api03-test-key' });
      expect(client._opts.apiKey).toBe('sk-ant-api03-test-key');
    });

    it('should construct client with authToken when only CLAUDE_CODE_OAUTH_TOKEN is set', () => {
      delete process.env.ANTHROPIC_API_KEY;
      process.env.CLAUDE_CODE_OAUTH_TOKEN = 'sk-ant-oat01-oauth-token';

      const client = getAnthropicClient();
      expect(Anthropic).toHaveBeenCalledWith({ authToken: 'sk-ant-oat01-oauth-token' });
      expect(client._opts.authToken).toBe('sk-ant-oat01-oauth-token');
    });

    it('should prefer ANTHROPIC_API_KEY over CLAUDE_CODE_OAUTH_TOKEN', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-api-key';
      process.env.CLAUDE_CODE_OAUTH_TOKEN = 'sk-oauth-token';

      getAnthropicClient();
      expect(Anthropic).toHaveBeenCalledWith({ apiKey: 'sk-api-key' });
      // Not called with authToken
      const callOpts = Anthropic.mock.calls[0][0];
      expect(callOpts.authToken).toBeUndefined();
    });

    it('should construct client with no auth options when neither env var is set', () => {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;

      getAnthropicClient();
      expect(Anthropic).toHaveBeenCalledWith({});
    });
  });

  describe('_setAnthropicClient', () => {
    it('should replace the singleton so subsequent getAnthropicClient returns the new instance', () => {
      const fakeClient = { fake: true };
      _setAnthropicClient(fakeClient);

      const result = getAnthropicClient();
      expect(result).toBe(fakeClient);
      // Anthropic constructor should NOT have been called
      expect(Anthropic).not.toHaveBeenCalled();
    });

    it('should allow resetting the singleton to null, forcing re-creation', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-reset-test';
      // Create the initial singleton
      const first = getAnthropicClient();
      expect(Anthropic).toHaveBeenCalledTimes(1);

      // Reset and create a new one
      _setAnthropicClient(null);
      const second = getAnthropicClient();
      expect(Anthropic).toHaveBeenCalledTimes(2);
      // They are different instances (new Anthropic() each time)
      expect(second).not.toBe(first);
    });
  });
});