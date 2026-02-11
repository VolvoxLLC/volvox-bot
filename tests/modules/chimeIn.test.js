import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

// Mock ai exports
vi.mock('../../src/modules/ai.js', () => ({
  OPENCLAW_URL: 'http://mock-api/v1/chat/completions',
  OPENCLAW_TOKEN: 'mock-token',
}));

// Mock splitMessage
vi.mock('../../src/utils/splitMessage.js', () => ({
  needsSplitting: vi.fn().mockReturnValue(false),
  splitMessage: vi.fn().mockReturnValue([]),
}));

describe('chimeIn module', () => {
  let chimeInModule;

  beforeEach(async () => {
    vi.resetModules();
    // Re-apply mocks after resetModules
    vi.mock('../../src/logger.js', () => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }));
    vi.mock('../../src/modules/ai.js', () => ({
      OPENCLAW_URL: 'http://mock-api/v1/chat/completions',
      OPENCLAW_TOKEN: 'mock-token',
    }));
    vi.mock('../../src/utils/splitMessage.js', () => ({
      needsSplitting: vi.fn().mockReturnValue(false),
      splitMessage: vi.fn().mockReturnValue([]),
    }));

    chimeInModule = await import('../../src/modules/chimeIn.js');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('accumulate', () => {
    it('should do nothing if chimeIn is disabled', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const message = {
        channel: { id: 'c1' },
        content: 'hello',
        author: { username: 'user' },
      };
      await chimeInModule.accumulate(message, { chimeIn: { enabled: false } });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should do nothing if chimeIn config is missing', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const message = {
        channel: { id: 'c1' },
        content: 'hello',
        author: { username: 'user' },
      };
      await chimeInModule.accumulate(message, {});
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should skip excluded channels', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const message = {
        channel: { id: 'excluded-ch' },
        content: 'hello',
        author: { username: 'user' },
      };
      await chimeInModule.accumulate(message, {
        chimeIn: { enabled: true, excludeChannels: ['excluded-ch'] },
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should skip empty messages', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const message = {
        channel: { id: 'c1' },
        content: '',
        author: { username: 'user' },
      };
      await chimeInModule.accumulate(message, { chimeIn: { enabled: true } });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should skip whitespace-only messages', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const message = {
        channel: { id: 'c1' },
        content: '   ',
        author: { username: 'user' },
      };
      await chimeInModule.accumulate(message, { chimeIn: { enabled: true } });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should accumulate messages without triggering eval below threshold', async () => {
      const config = { chimeIn: { enabled: true, evaluateEvery: 5 } };
      for (let i = 0; i < 3; i++) {
        const message = {
          channel: { id: 'c-test' },
          content: `message ${i}`,
          author: { username: 'user' },
        };
        await chimeInModule.accumulate(message, config);
      }
      // 3 < 5, so evaluation shouldn't trigger — just confirm no crash
    });

    it('should trigger evaluation when counter reaches evaluateEvery', async () => {
      // Mock fetch for the evaluation call
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'NO' } }],
        }),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      const config = { chimeIn: { enabled: true, evaluateEvery: 2, channels: [] }, ai: {} };
      for (let i = 0; i < 2; i++) {
        const message = {
          channel: { id: 'c-eval', send: vi.fn(), sendTyping: vi.fn() },
          content: `message ${i}`,
          author: { username: 'user' },
        };
        await chimeInModule.accumulate(message, config);
      }
      // fetch called for evaluation
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    it('should send response when evaluation says YES', async () => {
      const evalResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'YES' } }],
        }),
      };
      const genResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'Hey folks!' } }],
        }),
      };
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(evalResponse)
        .mockResolvedValueOnce(genResponse);

      const mockSend = vi.fn().mockResolvedValue(undefined);
      const mockSendTyping = vi.fn().mockResolvedValue(undefined);

      const config = { chimeIn: { enabled: true, evaluateEvery: 1, channels: [] }, ai: {} };
      const message = {
        channel: { id: 'c-yes', send: mockSend, sendTyping: mockSendTyping },
        content: 'interesting discussion',
        author: { username: 'user' },
      };
      await chimeInModule.accumulate(message, config);
      expect(mockSend).toHaveBeenCalledWith('Hey folks!');
    });

    it('should respect allowed channels list', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const config = {
        chimeIn: { enabled: true, evaluateEvery: 1, channels: ['allowed-ch'] },
      };
      const message = {
        channel: { id: 'not-allowed' },
        content: 'hello',
        author: { username: 'user' },
      };
      await chimeInModule.accumulate(message, config);
      // Should not trigger any fetch since channel is not in the allowed list
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should handle evaluation API error gracefully', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
      });

      const config = { chimeIn: { enabled: true, evaluateEvery: 1, channels: [] }, ai: {} };
      const message = {
        channel: { id: 'c-err', send: vi.fn(), sendTyping: vi.fn() },
        content: 'test message',
        author: { username: 'user' },
      };
      await chimeInModule.accumulate(message, config);
      // Should not throw
    });

    it('should handle evaluation fetch exception', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'));

      const config = { chimeIn: { enabled: true, evaluateEvery: 1, channels: [] }, ai: {} };
      const message = {
        channel: { id: 'c-fetch-err', send: vi.fn(), sendTyping: vi.fn() },
        content: 'test message',
        author: { username: 'user' },
      };
      await chimeInModule.accumulate(message, config);
    });

    it('should not send empty chime-in responses', async () => {
      const evalResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'YES' } }],
        }),
      };
      const genResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: '  ' } }],
        }),
      };
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(evalResponse)
        .mockResolvedValueOnce(genResponse);

      const mockSend = vi.fn();
      const config = { chimeIn: { enabled: true, evaluateEvery: 1, channels: [] }, ai: {} };
      const message = {
        channel: { id: 'c-empty', send: mockSend, sendTyping: vi.fn() },
        content: 'test',
        author: { username: 'user' },
      };
      await chimeInModule.accumulate(message, config);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should handle generation API error', async () => {
      const evalResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'YES' } }],
        }),
      };
      const genResponse = { ok: false, status: 500, statusText: 'Server Error' };
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(evalResponse)
        .mockResolvedValueOnce(genResponse);

      const config = { chimeIn: { enabled: true, evaluateEvery: 1, channels: [] }, ai: {} };
      const message = {
        channel: { id: 'c-gen-err', send: vi.fn(), sendTyping: vi.fn() },
        content: 'test',
        author: { username: 'user' },
      };
      await chimeInModule.accumulate(message, config);
      // Should not throw — error handled internally
    });

    it('should split long chime-in responses', async () => {
      const { needsSplitting: mockNeedsSplitting, splitMessage: mockSplitMessage } = await import(
        '../../src/utils/splitMessage.js'
      );
      mockNeedsSplitting.mockReturnValueOnce(true);
      mockSplitMessage.mockReturnValueOnce(['part1', 'part2']);

      const evalResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'YES' } }],
        }),
      };
      const genResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'a'.repeat(3000) } }],
        }),
      };
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(evalResponse)
        .mockResolvedValueOnce(genResponse);

      const mockSend = vi.fn().mockResolvedValue(undefined);
      const config = { chimeIn: { enabled: true, evaluateEvery: 1, channels: [] }, ai: {} };
      const message = {
        channel: { id: 'c-split', send: mockSend, sendTyping: vi.fn() },
        content: 'test',
        author: { username: 'user' },
      };
      await chimeInModule.accumulate(message, config);
      expect(mockSend).toHaveBeenCalledWith('part1');
      expect(mockSend).toHaveBeenCalledWith('part2');
    });
  });

  describe('resetCounter', () => {
    it('should not throw for unknown channel', () => {
      expect(() => chimeInModule.resetCounter('unknown-channel')).not.toThrow();
    });

    it('should reset counter and abort evaluation', async () => {
      // First accumulate some messages to create a buffer
      const config = { chimeIn: { enabled: true, evaluateEvery: 100, channels: [] } };
      const message = {
        channel: { id: 'c-reset' },
        content: 'hello',
        author: { username: 'user' },
      };
      await chimeInModule.accumulate(message, config);

      // Now reset
      chimeInModule.resetCounter('c-reset');
      // No crash = pass
    });
  });
});
