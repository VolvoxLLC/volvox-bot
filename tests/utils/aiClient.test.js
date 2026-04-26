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

// ── Mock the provider registry so tests don't depend on providers.json ────

const REGISTRY_STATE = vi.hoisted(() => ({
  providers: new Map(),
}));

function seedRegistry() {
  REGISTRY_STATE.providers = new Map([
    [
      'minimax',
      {
        name: 'minimax',
        displayName: 'MiniMax',
        envKey: 'MINIMAX_API_KEY',
        baseUrl: 'https://api.minimax.io/anthropic/v1',
        apiShape: ['anthropic'],
        capabilities: { webSearch: false, thinking: false },
      },
    ],
    [
      'moonshot',
      {
        name: 'moonshot',
        displayName: 'Moonshot',
        envKey: 'MOONSHOT_API_KEY',
        baseUrl: 'https://api.moonshot.ai/anthropic',
        apiShape: ['anthropic'],
        capabilities: { webSearch: true, thinking: true },
      },
    ],
    [
      'nonanth',
      {
        name: 'nonanth',
        displayName: 'NonAnth (test fixture)',
        envKey: 'NONANTH_API_KEY',
        baseUrl: 'https://nonanth.example.com',
        apiShape: ['openai'],
        capabilities: { webSearch: false, thinking: false },
      },
    ],
  ]);
}

seedRegistry();

vi.mock('../../src/utils/providerRegistry.js', () => ({
  getProviderMeta: (name) =>
    typeof name === 'string' ? (REGISTRY_STATE.providers.get(name.toLowerCase()) ?? null) : null,
  getModelConfig: (providerName, modelId) => {
    const cfg =
      typeof providerName === 'string'
        ? REGISTRY_STATE.providers.get(providerName.toLowerCase())
        : null;
    if (!cfg || typeof modelId !== 'string') return null;
    return { id: modelId, pricing: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 } };
  },
  getCapabilities: (name) => {
    const cfg = typeof name === 'string' ? REGISTRY_STATE.providers.get(name.toLowerCase()) : null;
    return cfg ? { ...cfg.capabilities } : { webSearch: false, thinking: false };
  },
  supportsShape: (name, shape) => {
    const cfg = typeof name === 'string' ? REGISTRY_STATE.providers.get(name.toLowerCase()) : null;
    return cfg ? cfg.apiShape.includes(shape) : false;
  },
  listProviders: () => Array.from(REGISTRY_STATE.providers.values()).map((p) => p.name),
  normaliseModelId: (id) => (typeof id === 'string' ? id.replace(/-\d{8}$/, '') : id),
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
    providerMetadata: { minimax: {} },
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
    providerMetadata: Promise.resolve({ minimax: {} }),
    ...overrides,
  };
}

function withEnv(name, value, fn) {
  const original = process.env[name];
  process.env[name] = value;
  return Promise.resolve(fn()).finally(() => {
    if (original === undefined) delete process.env[name];
    else process.env[name] = original;
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('generate', () => {
  let originalMinimaxKey;

  beforeEach(() => {
    _clearProviderCache();
    seedRegistry();
    mockGenerateText.mockReset();
    mockStreamText.mockReset();
    mockCalculateCost.mockReset();
    mockCreateAnthropic.mockClear();
    // calculateCost is SYNCHRONOUS — use mockReturnValue, not mockResolvedValue.
    mockCalculateCost.mockReturnValue(0.001);
    // Default provider for the happy path.
    originalMinimaxKey = process.env.MINIMAX_API_KEY;
    process.env.MINIMAX_API_KEY = 'minimax-test-key';
  });

  afterEach(() => {
    _clearProviderCache();
    if (originalMinimaxKey === undefined) {
      delete process.env.MINIMAX_API_KEY;
    } else {
      process.env.MINIMAX_API_KEY = originalMinimaxKey;
    }
  });

  it('should call generateText with resolved model and return result', async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult());

    const result = await generate({
      model: 'minimax:MiniMax-M2.7',
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

  it('should throw for bare model strings (D1)', async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult());

    await expect(generate({ model: 'claude-haiku-4-5', prompt: 'test' })).rejects.toThrow(
      /provider:model/,
    );

    expect(mockCreateAnthropic).not.toHaveBeenCalled();
  });

  it('should parse provider-prefixed model strings', async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult());

    await generate({ model: 'minimax:MiniMax-M2.7', prompt: 'test' });

    expect(mockCreateAnthropic).toHaveBeenCalled();
    expect(mockGenerateText.mock.calls[0][0].model).toEqual({
      modelId: 'MiniMax-M2.7',
      provider: 'anthropic',
    });
  });

  it('should pass the API key as authToken (no more sk-ant- detection)', async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult());

    await generate({
      model: 'minimax:MiniMax-M2.7',
      prompt: 'test',
      apiKey: 'arbitrary-credential-value',
    });

    expect(mockCreateAnthropic).toHaveBeenCalledWith({
      authToken: 'arbitrary-credential-value',
      baseURL: 'https://api.minimax.io/anthropic/v1',
    });
  });

  it('should resolve providers via env var + registry base URL', async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult());
    await withEnv('MOONSHOT_API_KEY', 'moonshot-key', async () => {
      await generate({ model: 'moonshot:kimi-k2.6', prompt: 'test' });

      expect(mockCreateAnthropic).toHaveBeenCalledWith({
        authToken: 'moonshot-key',
        baseURL: 'https://api.moonshot.ai/anthropic',
      });
    });
  });

  it('should loud-fail for an unknown provider (not in registry)', async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult());

    await expect(generate({ model: 'xyz:some-model', prompt: 'test' })).rejects.toMatchObject({
      reason: 'api',
      message: expect.stringContaining("Unknown provider 'xyz'"),
    });

    expect(mockCreateAnthropic).not.toHaveBeenCalled();
  });

  it('should loud-fail when the provider declares a non-anthropic apiShape', async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult());
    await withEnv('NONANTH_API_KEY', 'nonanth-key', async () => {
      await expect(generate({ model: 'nonanth:some-model', prompt: 'test' })).rejects.toMatchObject(
        {
          reason: 'api',
          message: expect.stringContaining('apiShape'),
        },
      );

      expect(mockCreateAnthropic).not.toHaveBeenCalled();
    });
  });

  it('should loud-fail when the configured envKey is not set', async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult());
    const original = process.env.MOONSHOT_API_KEY;
    delete process.env.MOONSHOT_API_KEY;

    try {
      await expect(generate({ model: 'moonshot:kimi-k2.6', prompt: 'test' })).rejects.toMatchObject(
        {
          reason: 'api',
          message: expect.stringContaining('MOONSHOT_API_KEY'),
        },
      );
      expect(mockCreateAnthropic).not.toHaveBeenCalled();
    } finally {
      if (original !== undefined) process.env.MOONSHOT_API_KEY = original;
    }
  });

  it('should pick up <PROVIDER>_BASE_URL env var to override registry default', async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult());
    await withEnv('MOONSHOT_API_KEY', 'moonshot-key', async () => {
      await withEnv('MOONSHOT_BASE_URL', 'https://custom.moonshot.dev/v1', async () => {
        await generate({ model: 'moonshot:kimi-k2.6', prompt: 'test' });

        expect(mockCreateAnthropic).toHaveBeenCalledWith({
          authToken: 'moonshot-key',
          baseURL: 'https://custom.moonshot.dev/v1',
        });
      });
    });
  });

  it('should use the registry base URL by default', async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult());

    await generate({ model: 'minimax:MiniMax-M2.7', prompt: 'test' });

    expect(mockCreateAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://api.minimax.io/anthropic/v1',
      }),
    );
  });

  it('should NOT include WebSearch tool when the provider lacks the capability', async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult());

    await generate({
      model: 'minimax:MiniMax-M2.7',
      prompt: 'search',
      tools: ['WebSearch'],
    });

    const call = mockGenerateText.mock.calls[0][0];
    expect(call.tools).toBeUndefined();
  });

  it('should include WebSearch tool when the provider declares the capability', async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult());
    await withEnv('MOONSHOT_API_KEY', 'moonshot-key', async () => {
      await generate({
        model: 'moonshot:kimi-k2.6',
        prompt: 'search',
        tools: ['WebSearch'],
      });

      const call = mockGenerateText.mock.calls[0][0];
      expect(call.tools).toHaveProperty('web_search');
      expect(call.stopWhen).toBeDefined();
    });
  });

  it('should NOT send thinking providerOptions when the provider lacks the capability', async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult());

    await generate({ model: 'minimax:MiniMax-M2.7', prompt: 'think', thinking: 2048 });

    const call = mockGenerateText.mock.calls[0][0];
    expect(call.providerOptions).toEqual({});
  });

  it('should include thinking providerOptions when the provider declares the capability', async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult());
    await withEnv('MOONSHOT_API_KEY', 'moonshot-key', async () => {
      await generate({ model: 'moonshot:kimi-k2.6', prompt: 'think', thinking: 4096 });

      const call = mockGenerateText.mock.calls[0][0];
      expect(call.providerOptions).toEqual({
        anthropic: { thinking: { type: 'enabled', budgetTokens: 4096 } },
      });
    });
  });

  it('should NOT include thinking providerOptions when thinking is 0', async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult());
    await withEnv('MOONSHOT_API_KEY', 'moonshot-key', async () => {
      await generate({ model: 'moonshot:kimi-k2.6', prompt: 'no think', thinking: 0 });

      const call = mockGenerateText.mock.calls[0][0];
      expect(call.providerOptions).toEqual({});
    });
  });

  it('should cache provider instances by config tuple', async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult());

    await generate({ model: 'minimax:MiniMax-M2.7', prompt: 'test1' });
    await generate({ model: 'minimax:MiniMax-M2.7', prompt: 'test2' });

    // createAnthropic should only be called once (cached)
    expect(mockCreateAnthropic).toHaveBeenCalledTimes(1);
  });

  it('should create separate providers for different apiKeys', async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult());

    await generate({ model: 'minimax:MiniMax-M2.7', prompt: 'test1', apiKey: 'key-1' });
    await generate({ model: 'minimax:MiniMax-M2.7', prompt: 'test2', apiKey: 'key-2' });

    expect(mockCreateAnthropic).toHaveBeenCalledTimes(2);
  });

  it('should cache separate providers per provider name', async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult());
    await withEnv('MOONSHOT_API_KEY', 'moonshot-key', async () => {
      await generate({ model: 'minimax:MiniMax-M2.7', prompt: 'test1' });
      await generate({ model: 'moonshot:kimi-k2.6', prompt: 'test2' });

      expect(mockCreateAnthropic).toHaveBeenCalledTimes(2);
    });
  });

  it('should pass apiKey and baseUrl overrides to provider (as authToken)', async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult());

    await generate({
      model: 'minimax:MiniMax-M2.7',
      prompt: 'test',
      apiKey: 'custom-key',
      baseUrl: 'https://proxy.example.com',
    });

    expect(mockCreateAnthropic).toHaveBeenCalledWith({
      authToken: 'custom-key',
      baseURL: 'https://proxy.example.com',
    });
  });

  it('should throw AIClientError with reason timeout on internal timeout', async () => {
    mockGenerateText.mockImplementation(
      () => new Promise((_, reject) => setTimeout(() => reject(new Error('aborted')), 50)),
    );

    await expect(
      generate({ model: 'minimax:MiniMax-M2.7', prompt: 'slow', timeout: 10 }),
    ).rejects.toThrow(AIClientError);

    try {
      await generate({ model: 'minimax:MiniMax-M2.7', prompt: 'slow', timeout: 10 });
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
        model: 'minimax:MiniMax-M2.7',
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
        model: 'minimax:MiniMax-M2.7',
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
      await generate({ model: 'minimax:MiniMax-M2.7', prompt: 'bad' });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AIClientError);
      expect(err.reason).toBe('api');
      expect(err.statusCode).toBe(400);
    }
  });

  it('should calculate cost via aiCost module with the resolved provider/model', async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult());
    mockCalculateCost.mockReturnValue(0.042);

    const result = await generate({ model: 'minimax:MiniMax-M2.7', prompt: 'expensive' });

    expect(mockCalculateCost).toHaveBeenCalledWith('minimax', 'MiniMax-M2.7', {
      inputTokens: 100,
      outputTokens: 50,
      cachedInputTokens: 0,
      cacheCreationInputTokens: 0,
    });
    expect(result.costUsd).toBe(0.042);
  });
});

describe('stream', () => {
  let originalMinimaxKey;

  beforeEach(() => {
    _clearProviderCache();
    seedRegistry();
    mockGenerateText.mockReset();
    mockStreamText.mockReset();
    mockCalculateCost.mockReset();
    mockCreateAnthropic.mockClear();
    mockCalculateCost.mockReturnValue(0.002);
    originalMinimaxKey = process.env.MINIMAX_API_KEY;
    process.env.MINIMAX_API_KEY = 'minimax-test-key';
  });

  afterEach(() => {
    _clearProviderCache();
    if (originalMinimaxKey === undefined) {
      delete process.env.MINIMAX_API_KEY;
    } else {
      process.env.MINIMAX_API_KEY = originalMinimaxKey;
    }
  });

  it('should call streamText and await final results', async () => {
    mockStreamText.mockReturnValue(makeStreamResult());

    const result = await stream({ model: 'minimax:MiniMax-M2.7', prompt: 'stream me' });

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
    await withEnv('MOONSHOT_API_KEY', 'moonshot-key', async () => {
      await stream({
        model: 'moonshot:kimi-k2.6',
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
  });

  it('should throw AIClientError with reason timeout on stream timeout', async () => {
    mockStreamText.mockReturnValue({
      ...makeStreamResult(),
      text: new Promise((_, reject) => setTimeout(() => reject(new Error('abort')), 50)),
    });

    await expect(
      stream({ model: 'minimax:MiniMax-M2.7', prompt: 'slow', timeout: 10 }),
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
        model: 'minimax:MiniMax-M2.7',
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
      await stream({ model: 'minimax:MiniMax-M2.7', prompt: 'fail' });
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

    await withEnv('MOONSHOT_API_KEY', 'moonshot-key', async () => {
      await stream({
        model: 'moonshot:kimi-k2.6',
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
});

// ── withRetry tests (via generate/stream) ──────────────────────────────────

describe('withRetry', () => {
  let originalMinimaxKey;

  beforeEach(() => {
    _clearProviderCache();
    seedRegistry();
    mockGenerateText.mockReset();
    mockStreamText.mockReset();
    mockCalculateCost.mockReset();
    mockCreateAnthropic.mockClear();
    mockCalculateCost.mockReturnValue(0.001);
    originalMinimaxKey = process.env.MINIMAX_API_KEY;
    process.env.MINIMAX_API_KEY = 'minimax-test-key';
  });

  afterEach(() => {
    _clearProviderCache();
    if (originalMinimaxKey === undefined) {
      delete process.env.MINIMAX_API_KEY;
    } else {
      process.env.MINIMAX_API_KEY = originalMinimaxKey;
    }
  });

  it('should retry on 429 then succeed', async () => {
    const rateLimitErr = new Error('Rate limited');
    rateLimitErr.statusCode = 429;
    rateLimitErr.headers = { 'retry-after': '0.01' };

    mockGenerateText
      .mockRejectedValueOnce(rateLimitErr)
      .mockResolvedValueOnce(makeGenerateResult());

    const result = await generate({ model: 'minimax:MiniMax-M2.7', prompt: 'retry me' });

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

    await expect(
      generate({ model: 'minimax:MiniMax-M2.7', prompt: 'always fail' }),
    ).rejects.toThrow(AIClientError);

    expect(mockGenerateText).toHaveBeenCalledTimes(3);
  });

  it('should not retry on non-retryable error (401)', async () => {
    const authErr = new Error('Unauthorized');
    authErr.statusCode = 401;

    mockGenerateText.mockRejectedValue(authErr);

    await expect(generate({ model: 'minimax:MiniMax-M2.7', prompt: 'bad key' })).rejects.toThrow(
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

    const result = await stream({ model: 'minimax:MiniMax-M2.7', prompt: 'retry stream' });

    expect(mockStreamText).toHaveBeenCalledTimes(2);
    expect(result.text).toBe('retried stream');
  });
});

// ── generate edge cases ────────────────────────────────────────────────────

describe('generate — edge cases', () => {
  let originalMinimaxKey;

  beforeEach(() => {
    _clearProviderCache();
    seedRegistry();
    mockGenerateText.mockReset();
    mockStreamText.mockReset();
    mockCalculateCost.mockReset();
    mockCreateAnthropic.mockClear();
    mockCalculateCost.mockReturnValue(0.001);
    originalMinimaxKey = process.env.MINIMAX_API_KEY;
    process.env.MINIMAX_API_KEY = 'minimax-test-key';
  });

  afterEach(() => {
    _clearProviderCache();
    if (originalMinimaxKey === undefined) {
      delete process.env.MINIMAX_API_KEY;
    } else {
      process.env.MINIMAX_API_KEY = originalMinimaxKey;
    }
  });

  it('should fall back to usage when totalUsage is undefined', async () => {
    const result = makeGenerateResult({
      totalUsage: undefined,
      usage: { inputTokens: 42, outputTokens: 17, totalTokens: 59 },
    });
    mockGenerateText.mockResolvedValue(result);

    const res = await generate({ model: 'minimax:MiniMax-M2.7', prompt: 'fallback usage' });

    expect(res.usage.inputTokens).toBe(42);
    expect(res.usage.outputTokens).toBe(17);
  });

  it('should extract cache tokens from the provider-keyed providerMetadata bucket', async () => {
    const result = makeGenerateResult({
      providerMetadata: {
        minimax: { cacheReadInputTokens: 75, cacheCreationInputTokens: 10 },
      },
    });
    mockGenerateText.mockResolvedValue(result);
    mockCalculateCost.mockReturnValue(0.005);

    await generate({ model: 'minimax:MiniMax-M2.7', prompt: 'cached' });

    expect(mockCalculateCost).toHaveBeenCalledWith('minimax', 'MiniMax-M2.7', {
      inputTokens: 100,
      outputTokens: 50,
      cachedInputTokens: 75,
      cacheCreationInputTokens: 10,
    });
  });

  it('should fall back to the anthropic providerMetadata bucket when the provider bucket is absent', async () => {
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

    await generate({ model: 'minimax:MiniMax-M2.7', prompt: 'cached provider' });

    expect(mockCalculateCost).toHaveBeenCalledWith('minimax', 'MiniMax-M2.7', {
      inputTokens: 100,
      outputTokens: 50,
      cachedInputTokens: 50,
      cacheCreationInputTokens: 25,
    });
  });
});
