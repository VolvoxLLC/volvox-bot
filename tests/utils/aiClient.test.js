import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks (must use vi.hoisted for vi.mock factory references) ──────────────

vi.mock('../../src/logger.js', () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const { mockGenerateText, mockStreamText, mockCreateAnthropic, mockCalculateCost } = vi.hoisted(
  () => ({
    mockGenerateText: vi.fn(),
    mockStreamText: vi.fn(),
    mockCreateAnthropic: vi.fn(),
    mockCalculateCost: vi.fn(),
  }),
);

vi.mock('ai', () => ({
  generateText: (...args) => mockGenerateText(...args),
  streamText: (...args) => mockStreamText(...args),
  stepCountIs: (n) => n,
}));

vi.mock('@ai-sdk/anthropic', () => {
  const modelFn = vi.fn((id) => ({ modelId: id, provider: 'anthropic' }));
  modelFn.tools = {
    webSearch_20250305: vi.fn(() => ({ type: 'web_search', name: 'web_search' })),
  };
  mockCreateAnthropic.mockReturnValue(modelFn);
  return {
    createAnthropic: (...args) => mockCreateAnthropic(...args),
  };
});

vi.mock('../../src/utils/aiCost.js', () => ({
  calculateCost: (...args) => mockCalculateCost(...args),
}));

// ── Import under test (after mocks) ────────────────────────────────────────

const { generate, stream, _clearProviderCache } = await import('../../src/utils/aiClient.js');
const { AIClientError } = await import('../../src/utils/errors.js');

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeGenerateResult(overrides = {}) {
  return {
    text: '{"classification":"respond"}',
    totalUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    finishReason: 'stop',
    sources: [],
    providerMetadata: { anthropic: {} },
    ...overrides,
  };
}

function makeStreamResult(overrides = {}) {
  return {
    text: Promise.resolve('response text'),
    totalUsage: Promise.resolve({ inputTokens: 200, outputTokens: 100, totalTokens: 300 }),
    usage: Promise.resolve({ inputTokens: 200, outputTokens: 100, totalTokens: 300 }),
    finishReason: Promise.resolve('stop'),
    sources: Promise.resolve([]),
    providerMetadata: Promise.resolve({ anthropic: {} }),
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('generate', () => {
  let originalAnthropicKey;

  beforeEach(() => {
    _clearProviderCache();
    mockGenerateText.mockReset();
    mockStreamText.mockReset();
    mockCalculateCost.mockReset();
    mockCreateAnthropic.mockClear();
    // calculateCost is SYNCHRONOUS — use mockReturnValue, not mockResolvedValue.
    mockCalculateCost.mockReturnValue(0.001);
    // The resolver now loud-fails without a provider-specific key; guarantee
    // one exists for the default anthropic happy path.
    originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
  });

  afterEach(() => {
    _clearProviderCache();
    if (originalAnthropicKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    }
  });

  it('should call generateText with resolved model and return result', async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult());

    const result = await generate({
      model: 'claude-haiku-4-5',
      system: 'You are a bot',
      prompt: 'Hello',
    });

    expect(mockGenerateText).toHaveBeenCalledOnce();
    const call = mockGenerateText.mock.calls[0][0];
    expect(call.system).toBe('You are a bot');
    expect(call.prompt).toBe('Hello');

    expect(result.text).toBe('{"classification":"respond"}');
    expect(result.usage.inputTokens).toBe(100);
    expect(result.costUsd).toBe(0.001);
    expect(result.finishReason).toBe('stop');
    expect(typeof result.durationMs).toBe('number');
  });

  it('should default bare model names to anthropic provider', async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult());

    await generate({ model: 'claude-haiku-4-5', prompt: 'test' });

    expect(mockCreateAnthropic).toHaveBeenCalledOnce();
    expect(mockGenerateText.mock.calls[0][0].model).toEqual({
      modelId: 'claude-haiku-4-5',
      provider: 'anthropic',
    });
  });

  it('should parse provider-prefixed model strings', async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult());

    await generate({ model: 'anthropic:claude-sonnet-4-6', prompt: 'test' });

    expect(mockCreateAnthropic).toHaveBeenCalled();
  });

  it('should use authToken for anthropic OAuth credentials', async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult());

    await generate({ model: 'claude-haiku-4-5', prompt: 'test', apiKey: 'oauth2_test-token' });

    expect(mockCreateAnthropic).toHaveBeenCalledWith({ authToken: 'oauth2_test-token' });
  });

  it('should use authToken for long anthropic credentials that are not standard api keys', async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult());
    const longToken = `token_${'x'.repeat(140)}`;

    await generate({ model: 'claude-haiku-4-5', prompt: 'test', apiKey: longToken });

    expect(mockCreateAnthropic).toHaveBeenCalledWith({ authToken: longToken });
  });

  it('should resolve unknown providers via env var convention', async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult());
    process.env.MINIMAX_API_KEY = 'minimax-key';

    try {
      await generate({ model: 'minimax:MiniMax-M2.7', prompt: 'test' });

      expect(mockCreateAnthropic).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://api.minimax.io/anthropic/v1',
        }),
      );
    } finally {
      delete process.env.MINIMAX_API_KEY;
    }
  });

  it('should loud-fail for an unknown provider with no matching env var', async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult());
    // Ensure no XYZ_API_KEY exists — the fallback to ANTHROPIC_API_KEY has
    // been removed deliberately so we do not leak the Anthropic credential
    // to a foreign endpoint.
    delete process.env.XYZ_API_KEY;

    await expect(generate({ model: 'xyz:some-model', prompt: 'test' })).rejects.toMatchObject({
      reason: 'api',
      message: expect.stringContaining('XYZ_API_KEY'),
    });

    // Provider factory should NOT have been invoked — we fail before
    // constructing the client.
    expect(mockCreateAnthropic).not.toHaveBeenCalled();
  });

  it('should pick up <PROVIDER>_API_KEY env var for non-anthropic providers', async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult());
    process.env.CODEX_API_KEY = 'codex-key-123';

    try {
      await generate({ model: 'codex:some-model', prompt: 'test' });

      expect(mockCreateAnthropic).toHaveBeenCalledWith(
        expect.objectContaining({ authToken: 'codex-key-123' }),
      );
    } finally {
      delete process.env.CODEX_API_KEY;
    }
  });

  it('should pick up <PROVIDER>_BASE_URL env var for non-anthropic providers', async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult());
    process.env.CODEX_API_KEY = 'codex-key';
    process.env.CODEX_BASE_URL = 'https://codex.example.com/v1';

    try {
      await generate({ model: 'codex:some-model', prompt: 'test' });

      expect(mockCreateAnthropic).toHaveBeenCalledWith({
        authToken: 'codex-key',
        baseURL: 'https://codex.example.com/v1',
      });
    } finally {
      delete process.env.CODEX_API_KEY;
      delete process.env.CODEX_BASE_URL;
    }
  });

  it('should use known base URL default for minimax when only MINIMAX_API_KEY is set', async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult());
    process.env.MINIMAX_API_KEY = 'minimax-key';

    try {
      await generate({ model: 'minimax:MiniMax-M2.7', prompt: 'test' });

      expect(mockCreateAnthropic).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://api.minimax.io/anthropic/v1',
        }),
      );
    } finally {
      delete process.env.MINIMAX_API_KEY;
    }
  });

  it('should NOT include WebSearch tools for non-anthropic providers', async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult());
    process.env.MINIMAX_API_KEY = 'minimax-key';

    try {
      await generate({
        model: 'minimax:MiniMax-M2.7',
        prompt: 'search',
        tools: ['WebSearch'],
      });

      const call = mockGenerateText.mock.calls[0][0];
      expect(call.tools).toBeUndefined();
    } finally {
      delete process.env.MINIMAX_API_KEY;
    }
  });

  it('should NOT send thinking params for non-anthropic providers', async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult());
    process.env.MINIMAX_API_KEY = 'minimax-key';

    try {
      await generate({ model: 'minimax:MiniMax-M2.7', prompt: 'think', thinking: 2048 });

      const call = mockGenerateText.mock.calls[0][0];
      expect(call.providerOptions).toEqual({});
    } finally {
      delete process.env.MINIMAX_API_KEY;
    }
  });

  it('should cache non-anthropic providers separately from anthropic', async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult());
    process.env.MINIMAX_API_KEY = 'minimax-key';

    try {
      await generate({ model: 'claude-haiku-4-5', prompt: 'test1' });
      await generate({ model: 'minimax:MiniMax-M2.7', prompt: 'test2' });

      expect(mockCreateAnthropic).toHaveBeenCalledTimes(2);
    } finally {
      delete process.env.MINIMAX_API_KEY;
    }
  });

  it('should cache provider instances by config tuple', async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult());

    await generate({ model: 'claude-haiku-4-5', prompt: 'test1' });
    await generate({ model: 'claude-haiku-4-5', prompt: 'test2' });

    // createAnthropic should only be called once (cached)
    expect(mockCreateAnthropic).toHaveBeenCalledTimes(1);
  });

  it('should create separate providers for different apiKeys', async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult());

    await generate({ model: 'claude-haiku-4-5', prompt: 'test1', apiKey: 'key-1' });
    await generate({ model: 'claude-haiku-4-5', prompt: 'test2', apiKey: 'key-2' });

    expect(mockCreateAnthropic).toHaveBeenCalledTimes(2);
  });

  it('should pass apiKey and baseUrl overrides to provider', async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult());

    await generate({
      model: 'claude-haiku-4-5',
      prompt: 'test',
      apiKey: 'sk-custom',
      baseUrl: 'https://proxy.example.com',
    });

    expect(mockCreateAnthropic).toHaveBeenCalledWith({
      apiKey: 'sk-custom',
      baseURL: 'https://proxy.example.com',
    });
  });

  it('should include thinking providerOptions when thinking > 0', async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult());

    await generate({ model: 'claude-sonnet-4-6', prompt: 'think', thinking: 4096 });

    const call = mockGenerateText.mock.calls[0][0];
    expect(call.providerOptions).toEqual({
      anthropic: { thinking: { type: 'enabled', budgetTokens: 4096 } },
    });
  });

  it('should NOT include thinking providerOptions when thinking is 0', async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult());

    await generate({ model: 'claude-haiku-4-5', prompt: 'no think', thinking: 0 });

    const call = mockGenerateText.mock.calls[0][0];
    expect(call.providerOptions).toEqual({});
  });

  it('should include web search tool for anthropic models', async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult());

    await generate({
      model: 'claude-sonnet-4-6',
      prompt: 'search',
      tools: ['WebSearch'],
    });

    const call = mockGenerateText.mock.calls[0][0];
    expect(call.tools).toHaveProperty('web_search');
    expect(call.stopWhen).toBeDefined();
  });

  it('should NOT include tools when toolNames is empty', async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult());

    await generate({ model: 'claude-haiku-4-5', prompt: 'no tools' });

    const call = mockGenerateText.mock.calls[0][0];
    expect(call.tools).toBeUndefined();
  });

  it('should throw AIClientError with reason timeout on internal timeout', async () => {
    mockGenerateText.mockImplementation(
      () => new Promise((_, reject) => setTimeout(() => reject(new Error('aborted')), 50)),
    );

    await expect(
      generate({ model: 'claude-haiku-4-5', prompt: 'slow', timeout: 10 }),
    ).rejects.toThrow(AIClientError);

    try {
      await generate({ model: 'claude-haiku-4-5', prompt: 'slow', timeout: 10 });
    } catch (err) {
      expect(err.reason).toBe('timeout');
      expect(err.message).toBe('Request timed out');
    }
  });

  it('should throw AIClientError with reason aborted on external cancellation', async () => {
    const controller = new AbortController();

    mockGenerateText.mockImplementation(async () => {
      controller.abort();
      throw new Error('The operation was aborted');
    });

    await expect(
      generate({
        model: 'claude-haiku-4-5',
        prompt: 'cancelled',
        abortSignal: controller.signal,
      }),
    ).rejects.toMatchObject({ reason: 'aborted', message: 'Request was cancelled' });
  });

  it('should pass an already-aborted external signal through immediately', async () => {
    const controller = new AbortController();
    controller.abort();

    mockGenerateText.mockImplementation(async ({ abortSignal }) => {
      expect(abortSignal.aborted).toBe(true);
      throw new Error('The operation was aborted');
    });

    await expect(
      generate({
        model: 'claude-haiku-4-5',
        prompt: 'cancelled before start',
        abortSignal: controller.signal,
      }),
    ).rejects.toMatchObject({ reason: 'aborted', message: 'Request was cancelled' });
  });

  it('should throw AIClientError with reason api on API errors', async () => {
    const apiError = new Error('Bad request');
    apiError.statusCode = 400;
    mockGenerateText.mockRejectedValue(apiError);

    try {
      await generate({ model: 'claude-haiku-4-5', prompt: 'bad' });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AIClientError);
      expect(err.reason).toBe('api');
      expect(err.statusCode).toBe(400);
    }
  });

  it('should calculate cost via aiCost module', async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult());
    mockCalculateCost.mockReturnValue(0.042);

    const result = await generate({ model: 'claude-sonnet-4-6', prompt: 'expensive' });

    expect(mockCalculateCost).toHaveBeenCalledWith('anthropic', 'claude-sonnet-4-6', {
      inputTokens: 100,
      outputTokens: 50,
      cachedInputTokens: 0,
      cacheCreationInputTokens: 0,
    });
    expect(result.costUsd).toBe(0.042);
  });
});

describe('stream', () => {
  let originalAnthropicKey;

  beforeEach(() => {
    _clearProviderCache();
    mockGenerateText.mockReset();
    mockStreamText.mockReset();
    mockCalculateCost.mockReset();
    mockCreateAnthropic.mockClear();
    // calculateCost is SYNCHRONOUS — use mockReturnValue.
    mockCalculateCost.mockReturnValue(0.002);
    originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
  });

  afterEach(() => {
    _clearProviderCache();
    if (originalAnthropicKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    }
  });

  it('should call streamText and await final results', async () => {
    mockStreamText.mockReturnValue(makeStreamResult());

    const result = await stream({ model: 'claude-sonnet-4-6', prompt: 'stream me' });

    expect(mockStreamText).toHaveBeenCalledOnce();
    expect(result.text).toBe('response text');
    expect(result.usage.inputTokens).toBe(200);
    expect(result.costUsd).toBe(0.002);
    expect(typeof result.durationMs).toBe('number');
  });

  it('should forward tool-call chunks to onChunk callback', async () => {
    let capturedOnChunk;
    mockStreamText.mockImplementation((opts) => {
      capturedOnChunk = opts.onChunk;
      return makeStreamResult();
    });

    const toolCalls = [];
    await stream({
      model: 'claude-sonnet-4-6',
      prompt: 'search',
      tools: ['WebSearch'],
      onChunk: (name, args) => toolCalls.push({ name, args }),
    });

    // Simulate a tool-call chunk
    capturedOnChunk({
      chunk: { type: 'tool-call', toolName: 'web_search', args: { query: 'test' } },
    });
    capturedOnChunk({ chunk: { type: 'text', textDelta: 'hello' } }); // should be ignored

    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].name).toBe('web_search');
  });

  it('should throw AIClientError with reason timeout on stream timeout', async () => {
    mockStreamText.mockReturnValue({
      ...makeStreamResult(),
      text: new Promise((_, reject) => setTimeout(() => reject(new Error('abort')), 50)),
    });

    await expect(
      stream({ model: 'claude-haiku-4-5', prompt: 'slow', timeout: 10 }),
    ).rejects.toMatchObject({ reason: 'timeout', message: 'Request timed out' });
  });

  it('should throw AIClientError with reason aborted on stream cancellation', async () => {
    const controller = new AbortController();

    mockStreamText.mockImplementation(() => {
      controller.abort();
      return {
        ...makeStreamResult(),
        text: Promise.reject(new Error('The operation was aborted')),
      };
    });

    await expect(
      stream({
        model: 'claude-haiku-4-5',
        prompt: 'cancelled',
        abortSignal: controller.signal,
      }),
    ).rejects.toMatchObject({ reason: 'aborted', message: 'Request was cancelled' });
  });

  it('should throw AIClientError with reason api on non-abort error', async () => {
    const apiErr = new Error('Internal server error');
    apiErr.statusCode = 500;
    mockStreamText.mockImplementation(() => {
      throw apiErr;
    });

    try {
      await stream({ model: 'claude-haiku-4-5', prompt: 'fail' });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AIClientError);
      expect(err.reason).toBe('api');
      expect(err.statusCode).toBe(500);
    }
  });

  it('should catch onChunk callback errors and log them (no unhandled rejection)', async () => {
    const { error: logError } = await import('../../src/logger.js');
    let capturedOnChunk;
    mockStreamText.mockImplementation((opts) => {
      capturedOnChunk = opts.onChunk;
      return makeStreamResult();
    });

    await stream({
      model: 'claude-sonnet-4-6',
      prompt: 'search',
      tools: ['WebSearch'],
      onChunk: () => {
        throw new Error('callback boom');
      },
    });

    // Simulate a tool-call chunk that triggers the throwing onChunk
    capturedOnChunk({
      chunk: { type: 'tool-call', toolName: 'web_search', args: { query: 'test' } },
    });

    expect(logError).toHaveBeenCalledWith(
      'onChunk callback error (sync)',
      expect.objectContaining({ error: 'callback boom' }),
    );
  });
});

// ── withRetry tests (via generate/stream) ──────────────────────────────────

describe('withRetry', () => {
  let originalAnthropicKey;

  beforeEach(() => {
    _clearProviderCache();
    mockGenerateText.mockReset();
    mockStreamText.mockReset();
    mockCalculateCost.mockReset();
    mockCreateAnthropic.mockClear();
    mockCalculateCost.mockReturnValue(0.001);
    originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
  });

  afterEach(() => {
    _clearProviderCache();
    if (originalAnthropicKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    }
  });

  it('should retry on 429 then succeed', async () => {
    const rateLimitErr = new Error('Rate limited');
    rateLimitErr.statusCode = 429;
    rateLimitErr.headers = { 'retry-after': '0.01' };

    mockGenerateText
      .mockRejectedValueOnce(rateLimitErr)
      .mockResolvedValueOnce(makeGenerateResult());

    const result = await generate({ model: 'claude-haiku-4-5', prompt: 'retry me' });

    expect(mockGenerateText).toHaveBeenCalledTimes(2);
    expect(result.text).toBe('{"classification":"respond"}');
  });

  it('should exhaust retries and throw', async () => {
    const serverErr = new Error('Server error');
    serverErr.statusCode = 500;

    mockGenerateText
      .mockRejectedValueOnce(serverErr)
      .mockRejectedValueOnce(serverErr)
      .mockRejectedValueOnce(serverErr);

    await expect(generate({ model: 'claude-haiku-4-5', prompt: 'always fail' })).rejects.toThrow(
      AIClientError,
    );

    expect(mockGenerateText).toHaveBeenCalledTimes(3);
  });

  it('should not retry on non-retryable error (401)', async () => {
    const authErr = new Error('Unauthorized');
    authErr.statusCode = 401;

    mockGenerateText.mockRejectedValue(authErr);

    await expect(generate({ model: 'claude-haiku-4-5', prompt: 'bad key' })).rejects.toThrow(
      AIClientError,
    );

    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  it('should retry when stream consumption fails with a retryable error', async () => {
    const streamErr = new Error('stream interrupted');
    streamErr.statusCode = 503;

    mockStreamText
      .mockReturnValueOnce({
        ...makeStreamResult(),
        text: Promise.reject(streamErr),
      })
      .mockReturnValueOnce(makeStreamResult({ text: Promise.resolve('retried stream') }));

    const result = await stream({ model: 'claude-haiku-4-5', prompt: 'retry stream' });

    expect(mockStreamText).toHaveBeenCalledTimes(2);
    expect(result.text).toBe('retried stream');
  });
});

// ── generate edge cases ────────────────────────────────────────────────────

describe('generate — edge cases', () => {
  let originalAnthropicKey;

  beforeEach(() => {
    _clearProviderCache();
    mockGenerateText.mockReset();
    mockStreamText.mockReset();
    mockCalculateCost.mockReset();
    mockCreateAnthropic.mockClear();
    mockCalculateCost.mockReturnValue(0.001);
    originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
  });

  afterEach(() => {
    _clearProviderCache();
    if (originalAnthropicKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    }
  });

  it('should fall back to usage when totalUsage is undefined', async () => {
    const result = makeGenerateResult({
      totalUsage: undefined,
      usage: { inputTokens: 42, outputTokens: 17, totalTokens: 59 },
    });
    mockGenerateText.mockResolvedValue(result);

    const res = await generate({ model: 'claude-haiku-4-5', prompt: 'fallback usage' });

    expect(res.usage.inputTokens).toBe(42);
    expect(res.usage.outputTokens).toBe(17);
  });

  it('should extract cachedInputTokens from providerMetadata and pass to calculateCost', async () => {
    const result = makeGenerateResult({
      providerMetadata: { anthropic: { cacheReadInputTokens: 75 } },
    });
    mockGenerateText.mockResolvedValue(result);
    mockCalculateCost.mockReturnValue(0.005);

    await generate({ model: 'claude-sonnet-4-6', prompt: 'cached' });

    expect(mockCalculateCost).toHaveBeenCalledWith('anthropic', 'claude-sonnet-4-6', {
      inputTokens: 100,
      outputTokens: 50,
      cachedInputTokens: 75,
      cacheCreationInputTokens: 0,
    });
  });

  it('should extract cachedInputTokens using dynamic provider name from model string', async () => {
    const result = makeGenerateResult({
      providerMetadata: { minimax: { cacheReadInputTokens: 50 } },
    });
    mockGenerateText.mockResolvedValue(result);
    mockCalculateCost.mockReturnValue(0.003);
    process.env.MINIMAX_API_KEY = 'minimax-key';

    try {
      await generate({ model: 'minimax:MiniMax-M2.7', prompt: 'cached provider' });

      expect(mockCalculateCost).toHaveBeenCalledWith('minimax', 'MiniMax-M2.7', {
        inputTokens: 100,
        outputTokens: 50,
        cachedInputTokens: 50,
        cacheCreationInputTokens: 0,
      });
    } finally {
      delete process.env.MINIMAX_API_KEY;
    }
  });

  it('should fall back to anthropic providerMetadata for Anthropic-compatible providers', async () => {
    const result = makeGenerateResult({
      providerMetadata: {
        anthropic: {
          cacheCreationInputTokens: 25,
          cacheReadInputTokens: 50,
        },
      },
    });
    mockGenerateText.mockResolvedValue(result);
    mockCalculateCost.mockReturnValue(0.003);
    process.env.MINIMAX_API_KEY = 'minimax-key';

    try {
      await generate({ model: 'minimax:MiniMax-M2.7', prompt: 'cached provider' });

      expect(mockCalculateCost).toHaveBeenCalledWith('minimax', 'MiniMax-M2.7', {
        inputTokens: 100,
        outputTokens: 50,
        cachedInputTokens: 50,
        cacheCreationInputTokens: 25,
      });
    } finally {
      delete process.env.MINIMAX_API_KEY;
    }
  });
});
