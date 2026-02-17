/**
 * SDKProcess — Long-lived Claude Agent SDK process manager.
 *
 * Wraps the SDK's `query()` API with streaming input (AsyncQueue) to keep a
 * single subprocess alive across multiple send() calls.  Token-based recycling
 * bounds context growth: when accumulated tokens exceed a configurable limit
 * the process is transparently replaced.
 *
 * If the SDK does not support streaming input for a given configuration, the
 * class falls back to spawning a fresh query() per send() — the external API
 * stays identical.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { info, error as logError, warn } from '../logger.js';

// ── AsyncQueue ──────────────────────────────────────────────────────────────

/**
 * Push-based async iterable that feeds messages into the SDK's streaming input.
 */
export class AsyncQueue {
  /** @type {Array<*>} */
  #queue = [];
  /** @type {Array<Function>} */
  #waiters = [];
  #closed = false;

  /**
   * Enqueue a value. If a consumer is already waiting, resolve it immediately.
   * @param {*} value
   */
  push(value) {
    if (this.#closed) return;
    if (this.#waiters.length > 0) {
      const resolve = this.#waiters.shift();
      resolve({ value, done: false });
    } else {
      this.#queue.push(value);
    }
  }

  /** Signal end-of-stream. */
  close() {
    this.#closed = true;
    // Resolve any pending consumers with done
    for (const resolve of this.#waiters) {
      resolve({ value: undefined, done: true });
    }
    this.#waiters.length = 0;
  }

  [Symbol.asyncIterator]() {
    return {
      next: () => {
        if (this.#queue.length > 0) {
          return Promise.resolve({ value: this.#queue.shift(), done: false });
        }
        if (this.#closed) {
          return Promise.resolve({ value: undefined, done: true });
        }
        return new Promise((resolve) => {
          this.#waiters.push(resolve);
        });
      },
    };
  }
}

// ── SDKProcess ──────────────────────────────────────────────────────────────

export class SDKProcess {
  #name;
  #options;
  #inputQueue = null;
  #queryGen = null;
  #sessionId = null;
  #alive = false;
  #accumulatedTokens = 0;
  #tokenLimit;
  #useStreaming;

  // Mutex state — serialises concurrent send() calls.
  #mutexPromise = Promise.resolve();

  // Consume-loop bookkeeping
  #pendingResolve = null;
  #pendingReject = null;

  /**
   * @param {string} name  Human-readable label ('classifier' | 'responder')
   * @param {Object} options  Options forwarded to `query()` (model, systemPrompt, outputFormat, etc.)
   * @param {Object} [meta]
   * @param {number} [meta.tokenLimit=20000]  Accumulated-token threshold before auto-recycle
   * @param {boolean} [meta.useStreaming=true]  Set to false to force per-call mode
   */
  constructor(name, options, { tokenLimit = 20000, useStreaming = true } = {}) {
    this.#name = name;
    this.#options = options;
    this.#tokenLimit = tokenLimit;
    this.#useStreaming = useStreaming;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  /**
   * Start the long-lived SDK process.  Resolves once the init/system message
   * has been received (or immediately in per-call mode).
   */
  async start() {
    if (this.#useStreaming) {
      await this.#startStreaming();
    } else {
      // Per-call mode — nothing to boot
      this.#alive = true;
      this.#accumulatedTokens = 0;
    }
  }

  async #startStreaming() {
    this.#inputQueue = new AsyncQueue();
    this.#accumulatedTokens = 0;

    this.#queryGen = query({
      prompt: this.#inputQueue,
      options: { ...this.#options, persistSession: false },
    });

    // Launch the background consume loop (fire-and-forget — errors are handled internally).
    // Init happens lazily: the SDK spawns its subprocess when the first message is pushed
    // to the queue, and the consume loop captures session_id from the init message.
    this.#runConsumeLoop();
    this.#alive = true;
  }

  /** Background loop that reads messages from the SDK generator. */
  async #runConsumeLoop() {
    try {
      for await (const message of this.#queryGen) {
        // System/init — capture session_id for subsequent sends
        if (message.type === 'system' && message.subtype === 'init') {
          this.#sessionId = message.session_id;
          continue;
        }

        if (message.type === 'result') {
          // Track tokens (SDK may use camelCase or snake_case)
          const usage = message.usage;
          if (usage) {
            const inp = usage.inputTokens ?? usage.input_tokens ?? 0;
            const out = usage.outputTokens ?? usage.output_tokens ?? 0;
            this.#accumulatedTokens += inp + out;
          }
          this.#pendingResolve?.(message);
          this.#pendingResolve = null;
          this.#pendingReject = null;
        }
        // All other message types (progress, thinking, etc.) are ignored.
      }
    } catch (err) {
      this.#alive = false;
      this.#pendingReject?.(err);
      this.#pendingReject = null;
      this.#pendingResolve = null;
    }
  }

  // ── send() ──────────────────────────────────────────────────────────────

  /**
   * Send a prompt to the underlying SDK process and wait for the result.
   * Concurrent calls are serialised via an internal mutex.
   *
   * @param {string} prompt  The user-turn prompt text.
   * @returns {Promise<Object>} Parsed structured_output (or raw result).
   */
  async send(prompt) {
    const release = await this.#acquireMutex();
    try {
      const result = this.#useStreaming
        ? await this.#sendStreaming(prompt)
        : await this.#sendPerCall(prompt);

      // Token recycling — non-blocking so the caller gets the result now.
      if (this.#accumulatedTokens >= this.#tokenLimit) {
        info(`Recycling ${this.#name} process`, {
          accumulatedTokens: this.#accumulatedTokens,
          tokenLimit: this.#tokenLimit,
        });
        this.recycle().catch((err) =>
          logError(`Failed to recycle ${this.#name}`, { error: err.message }),
        );
      }

      return result;
    } finally {
      release();
    }
  }

  async #sendStreaming(prompt) {
    if (!this.#alive) {
      throw new Error(`${this.#name}: process is not alive`);
    }

    const resultPromise = new Promise((resolve, reject) => {
      this.#pendingResolve = resolve;
      this.#pendingReject = reject;
    });

    // Push a user-turn message into the streaming input.
    this.#inputQueue.push({
      type: 'user',
      message: { role: 'user', content: prompt },
      parent_tool_use_id: null,
      session_id: this.#sessionId ?? '',
    });

    const message = await resultPromise;
    return this.#extractResult(message);
  }

  async #sendPerCall(prompt) {
    const generator = query({
      prompt,
      options: { ...this.#options },
    });

    let result = null;
    for await (const message of generator) {
      if (message.type === 'result') {
        // Track tokens (SDK may use camelCase or snake_case)
        const usage = message.usage;
        if (usage) {
          const inp = usage.inputTokens ?? usage.input_tokens ?? 0;
          const out = usage.outputTokens ?? usage.output_tokens ?? 0;
          this.#accumulatedTokens += inp + out;
        }
        result = message;
      }
    }

    if (!result) {
      throw new Error(`${this.#name}: query returned no result`);
    }

    return this.#extractResult(result);
  }

  /**
   * Extract the meaningful payload from an SDK result message.
   * Prefers structured_output, falls back to raw result.
   */
  #extractResult(message) {
    if (message.is_error) {
      const errMsg = message.errors?.map((e) => e.message || e).join('; ') || 'Unknown SDK error';
      throw new Error(`${this.#name}: SDK error — ${errMsg}`);
    }
    // Return the full message so callers can inspect usage, cost, etc.
    return message;
  }

  // ── Recycle / restart ───────────────────────────────────────────────────

  /** Recycle: close current process and start a fresh one. */
  async recycle() {
    this.close();
    await this.start();
  }

  /** Restart with exponential backoff (for unexpected terminations). */
  async restart(attempt = 0) {
    const delay = Math.min(1000 * 2 ** attempt, 30_000);
    warn(`Restarting ${this.#name} process`, { attempt, delayMs: delay });
    await new Promise((r) => setTimeout(r, delay));
    try {
      await this.recycle();
    } catch (err) {
      logError(`${this.#name} restart failed`, { error: err.message, attempt });
      if (attempt < 3) {
        await this.restart(attempt + 1);
      } else {
        throw err;
      }
    }
  }

  /** Gracefully close the process. */
  close() {
    if (this.#inputQueue) {
      this.#inputQueue.close();
      this.#inputQueue = null;
    }
    this.#alive = false;
    this.#sessionId = null;

    // Reject any pending send()
    if (this.#pendingReject) {
      this.#pendingReject(new Error(`${this.#name}: process closed`));
      this.#pendingReject = null;
      this.#pendingResolve = null;
    }
  }

  // ── Mutex ───────────────────────────────────────────────────────────────

  /** Acquire the send mutex. Returns a release function. */
  #acquireMutex() {
    let release;
    const next = new Promise((resolve) => {
      release = resolve;
    });
    const prev = this.#mutexPromise;
    this.#mutexPromise = prev.then(() => next);
    return prev.then(() => release);
  }

  // ── Accessors ───────────────────────────────────────────────────────────

  /** Whether the process is alive and ready to accept send() calls. */
  get alive() {
    return this.#alive;
  }

  /** Accumulated tokens (input + output) since last recycle. */
  get tokenCount() {
    return this.#accumulatedTokens;
  }

  /** Human-readable process name. */
  get name() {
    return this.#name;
  }
}
