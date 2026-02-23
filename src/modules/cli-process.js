/**
 * CLIProcess — Claude CLI subprocess manager with dual-mode support.
 *
 * Spawns the `claude` binary directly in headless
 * mode.  Supports two lifecycle modes controlled by the `streaming` option:
 *
 * - **Short-lived** (default, `streaming: false`):  Each `send()` spawns a
 *   fresh `claude -p <prompt>` process that exits after returning its result.
 *   No token accumulation, clean abort via process kill.
 *
 * - **Long-lived** (`streaming: true`):  A single subprocess is kept alive
 *   across multiple `send()` calls using NDJSON stream-json I/O.  Tokens are
 *   tracked and the process is transparently recycled when a configurable
 *   threshold is exceeded.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { debug, info, error as logError, warn } from '../logger.js';
import { CLIProcessError } from '../utils/errors.js';

// Resolve the `claude` binary path from node_modules/.bin (may not be in PATH in Docker).
const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCAL_BIN = resolve(__dirname, '..', '..', 'node_modules', '.bin', 'claude');
const CLAUDE_BIN = existsSync(LOCAL_BIN) ? LOCAL_BIN : 'claude';

export { CLIProcessError };

// ── AsyncQueue ───────────────────────────────────────────────────────────────

/**
 * Push-based async iterable for buffering stdin writes in long-lived mode.
 */
export class AsyncQueue {
  /** @type {Array<*>} */
  #queue = [];
  /** @type {Array<Function>} */
  #waiters = [];
  #closed = false;

  push(value) {
    if (this.#closed) return;
    if (this.#waiters.length > 0) {
      const resolve = this.#waiters.shift();
      resolve({ value, done: false });
    } else {
      this.#queue.push(value);
    }
  }

  close() {
    this.#closed = true;
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

// ── Helpers ──────────────────────────────────────────────────────────────────

const MAX_STDERR_LINES = 20;

/**
 * Build CLI argument array from a flags object.
 * @param {Object} flags
 * @param {boolean} longLived  Whether to include stream-json input flags.
 * @returns {string[]}
 */
function buildArgs(flags, longLived) {
  const args = ['-p'];

  // Always output NDJSON and enable verbose diagnostics
  args.push('--output-format', 'stream-json');
  args.push('--verbose');

  if (longLived) {
    args.push('--input-format', 'stream-json');
  }

  if (flags.model) {
    args.push('--model', flags.model);
  }

  if (flags.systemPromptFile) {
    args.push('--system-prompt-file', flags.systemPromptFile);
  }

  if (flags.systemPrompt) {
    args.push('--system-prompt', flags.systemPrompt);
  }

  if (flags.appendSystemPrompt) {
    args.push('--append-system-prompt', flags.appendSystemPrompt);
  }

  if (flags.tools !== undefined) {
    args.push('--tools', flags.tools);
  }

  if (flags.allowedTools) {
    const toolList = Array.isArray(flags.allowedTools) ? flags.allowedTools : [flags.allowedTools];
    for (const tool of toolList) {
      args.push('--allowedTools', tool);
    }
  }

  if (flags.permissionMode) {
    args.push('--permission-mode', flags.permissionMode);
  } else {
    args.push('--permission-mode', 'bypassPermissions');
  }

  // Required when using bypassPermissions — without this the CLI hangs
  // waiting for interactive permission approval it can never get (no TTY).
  args.push('--dangerously-skip-permissions');

  args.push('--no-session-persistence');

  if (flags.maxBudgetUsd != null) {
    args.push('--max-budget-usd', String(flags.maxBudgetUsd));
  }

  return args;
}

/**
 * Build the subprocess environment with thinking token configuration.
 * @param {Object} flags
 * @param {string} [flags.baseUrl]  Override ANTHROPIC_BASE_URL (e.g. for claude-code-router proxy)
 * @param {string} [flags.apiKey]   Override ANTHROPIC_API_KEY (e.g. for provider-specific key)
 * @returns {Object}
 */
function buildEnv(flags) {
  const env = { ...process.env };
  const tokens = flags.thinkingTokens ?? 4096;
  env.MAX_THINKING_TOKENS = String(tokens);

  if (flags.baseUrl) {
    env.ANTHROPIC_BASE_URL = flags.baseUrl;
  }
  if (flags.apiKey) {
    env.ANTHROPIC_API_KEY = flags.apiKey;
    delete env.CLAUDE_CODE_OAUTH_TOKEN; // avoid conflicting auth headers
  }

  return env;
}

// ── CLIProcess ───────────────────────────────────────────────────────────────

export class CLIProcess {
  #name;
  #flags;
  #streaming;
  #tokenLimit;
  #timeout;

  // Long-lived state
  #proc = null;
  #sessionId = null;
  #alive = false;
  #accumulatedTokens = 0;
  #stderrBuffer = [];

  // Long-lived consume-loop bookkeeping
  #pendingResolve = null;
  #pendingReject = null;

  // Short-lived: reference to the in-flight process for abort
  #inflightProc = null;

  // Mutex state — serialises concurrent send() calls.
  #mutexPromise = Promise.resolve();

  /**
   * @param {string} name  Human-readable label ('classifier' | 'responder' | 'ai-chat')
   * @param {Object} flags  CLI flag configuration
   * @param {string} [flags.model]  Model name (e.g. 'claude-sonnet-4-6')
   * @param {string} [flags.systemPromptFile]  Path to system prompt .md file
   * @param {string} [flags.systemPrompt]  System prompt as a string
   * @param {string} [flags.appendSystemPrompt]  Text appended to system prompt
   * @param {string} [flags.tools]  Tools flag ('' to disable all)
   * @param {string|string[]} [flags.allowedTools]  Allowed tool names
   * @param {string} [flags.permissionMode]  Permission mode (default: 'bypassPermissions')
   * @param {number} [flags.maxBudgetUsd]  Budget cap per process lifetime
   * @param {number} [flags.thinkingTokens]  MAX_THINKING_TOKENS env (default: 4096)
   * @param {string} [flags.baseUrl]  Override ANTHROPIC_BASE_URL (e.g. 'http://router:3456' for CCR proxy)
   * @param {string} [flags.apiKey]  Override ANTHROPIC_API_KEY (e.g. provider-specific key for routed requests)
   * @param {Object} [meta]
   * @param {number} [meta.tokenLimit=20000]  Token threshold before auto-recycle (long-lived only)
   * @param {boolean} [meta.streaming=false]  true for long-lived mode
   * @param {number} [meta.timeout=120000]  Per-send timeout in milliseconds
   */
  constructor(name, flags = {}, { tokenLimit = 20000, streaming = false, timeout = 120_000 } = {}) {
    this.#name = name;
    this.#flags = flags;
    this.#streaming = streaming;
    this.#tokenLimit = tokenLimit;
    this.#timeout = timeout;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async start() {
    if (this.#streaming) {
      await this.#startLongLived();
    } else {
      this.#alive = true;
      this.#accumulatedTokens = 0;
    }
  }

  async #startLongLived() {
    this.#accumulatedTokens = 0;
    this.#stderrBuffer = [];
    this.#sessionId = null;

    const args = buildArgs(this.#flags, true);
    const env = buildEnv(this.#flags);

    this.#proc = spawn(CLAUDE_BIN, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
    });

    // EPIPE protection: if the child dies between the alive check and stdin.write,
    // catch the error instead of crashing the host process.
    this.#proc.stdin.on('error', (err) => {
      warn(`${this.#name}: stdin error (child may have exited)`, { error: err.message });
      this.#alive = false;
    });

    // Capture stderr for diagnostics
    this.#proc.stderr.on('data', (chunk) => {
      const lines = chunk.toString().split('\n').filter(Boolean);
      this.#stderrBuffer.push(...lines);
      if (this.#stderrBuffer.length > MAX_STDERR_LINES) {
        this.#stderrBuffer = this.#stderrBuffer.slice(-MAX_STDERR_LINES);
      }
    });

    // Handle unexpected exit
    this.#proc.on('exit', (code, signal) => {
      if (this.#alive) {
        warn(`${this.#name}: long-lived process exited`, { code, signal });
        this.#alive = false;
        if (this.#pendingReject) {
          this.#pendingReject(
            new CLIProcessError(
              `${this.#name}: process exited unexpectedly (code=${code}, signal=${signal})`,
              'exit',
              { code, signal },
            ),
          );
          this.#pendingReject = null;
          this.#pendingResolve = null;
        }
      }
    });

    // Start the background consume loop
    this.#runConsumeLoop();
    this.#alive = true;
    info(`${this.#name}: long-lived process started`, { pid: this.#proc.pid });
  }

  #runConsumeLoop() {
    const rl = createInterface({ input: this.#proc.stdout, crlfDelay: Infinity });

    rl.on('line', (line) => {
      if (!line.trim()) return;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        warn(`${this.#name}: non-JSON stdout line`, { line: line.slice(0, 200) });
        return;
      }

      // Capture session_id from init message
      if (msg.type === 'system' && msg.subtype === 'init') {
        this.#sessionId = msg.session_id;
        return;
      }

      if (msg.type === 'result') {
        this.#trackTokens(msg);
        this.#pendingResolve?.(msg);
        this.#pendingResolve = null;
        this.#pendingReject = null;
      }
    });

    rl.on('close', () => {
      if (this.#alive) {
        this.#alive = false;
        this.#pendingReject?.(
          new CLIProcessError(`${this.#name}: stdout closed unexpectedly`, 'exit'),
        );
        this.#pendingReject = null;
        this.#pendingResolve = null;
      }
    });
  }

  // ── send() ───────────────────────────────────────────────────────────────

  /**
   * Send a prompt and await the result.
   * Concurrent calls are serialised via an internal mutex.
   *
   * @param {string} prompt  The user-turn prompt text.
   * @param {Object} [overrides]  Per-call flag overrides (short-lived mode only).
   * @param {string} [overrides.systemPrompt]  Override system prompt string.
   * @param {string} [overrides.appendSystemPrompt]  Override append-system-prompt.
   * @param {string} [overrides.systemPromptFile]  Override system prompt file path.
   * @param {Object} [options]  Additional options.
   * @param {Function} [options.onEvent]  Callback for intermediate NDJSON messages (short-lived only).
   * @returns {Promise<Object>} The result message from the CLI.
   */
  async send(prompt, overrides = {}, { onEvent } = {}) {
    const release = await this.#acquireMutex();
    try {
      const result = this.#streaming
        ? await this.#sendLongLived(prompt)
        : await this.#sendShortLived(prompt, overrides, onEvent);

      // Token recycling — non-blocking so the caller gets the result now.
      if (this.#streaming && this.#accumulatedTokens >= this.#tokenLimit) {
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

  async #sendShortLived(prompt, overrides = {}, onEvent = null) {
    const mergedFlags = { ...this.#flags, ...overrides };
    const args = buildArgs(mergedFlags, false);

    // In short-lived mode, the prompt is a positional argument after -p
    args.push(prompt);

    const env = buildEnv(mergedFlags);
    const stderrLines = [];

    return new Promise((resolve, reject) => {
      const proc = spawn(CLAUDE_BIN, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env,
      });

      this.#inflightProc = proc;

      // Timeout handling
      const timer = setTimeout(() => {
        proc.kill('SIGKILL');
        reject(
          new CLIProcessError(
            `${this.#name}: send() timed out after ${this.#timeout}ms`,
            'timeout',
          ),
        );
      }, this.#timeout);

      let result = null;

      // Capture stderr
      proc.stderr.on('data', (chunk) => {
        const lines = chunk.toString().split('\n').filter(Boolean);
        stderrLines.push(...lines);
        if (stderrLines.length > MAX_STDERR_LINES) {
          stderrLines.splice(0, stderrLines.length - MAX_STDERR_LINES);
        }
      });

      const rl = createInterface({ input: proc.stdout, crlfDelay: Infinity });

      rl.on('line', (line) => {
        if (!line.trim()) return;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          debug(`${this.#name}: non-JSON stdout line (short-lived)`, { line: line.slice(0, 200) });
          return;
        }
        if (msg.type === 'result') {
          result = msg;
        } else if (onEvent) {
          onEvent(msg);
        }
      });

      proc.on('exit', (code, signal) => {
        clearTimeout(timer);
        this.#inflightProc = null;

        if (result) {
          try {
            resolve(this.#extractResult(result));
          } catch (err) {
            reject(err);
          }
        } else {
          const stderr = stderrLines.join('\n');
          reject(
            new CLIProcessError(
              `${this.#name}: process exited without result (code=${code}, signal=${signal})${stderr ? `\nstderr: ${stderr}` : ''}`,
              'exit',
              { code, signal },
            ),
          );
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        this.#inflightProc = null;
        reject(
          new CLIProcessError(`${this.#name}: failed to spawn process — ${err.message}`, 'exit'),
        );
      });
    });
  }

  async #sendLongLived(prompt) {
    if (!this.#alive) {
      throw new CLIProcessError(`${this.#name}: process is not alive`, 'exit');
    }

    return new Promise((resolve, reject) => {
      this.#pendingResolve = (msg) => {
        clearTimeout(timer);
        try {
          resolve(this.#extractResult(msg));
        } catch (err) {
          reject(err);
        }
      };
      this.#pendingReject = (err) => {
        clearTimeout(timer);
        reject(err);
      };

      // Timeout handling
      const timer = setTimeout(() => {
        this.#pendingResolve = null;
        this.#pendingReject = null;
        // Kill and restart the long-lived process
        this.#proc?.kill('SIGKILL');
        reject(
          new CLIProcessError(
            `${this.#name}: send() timed out after ${this.#timeout}ms`,
            'timeout',
          ),
        );
      }, this.#timeout);

      // Write NDJSON user-turn message to stdin
      const message = JSON.stringify({
        type: 'user',
        message: { role: 'user', content: prompt },
        session_id: this.#sessionId ?? '',
        parent_tool_use_id: null,
      });

      this.#proc.stdin.write(`${message}\n`);
    });
  }

  // ── Result extraction ────────────────────────────────────────────────────

  #extractResult(message) {
    if (message.is_error) {
      const errMsg = message.errors?.map((e) => e.message || e).join('; ') || 'Unknown CLI error';
      logError(`${this.#name}: CLI error`, {
        error: errMsg,
        errorCount: message.errors?.length ?? 0,
        resultSnippet: JSON.stringify(message).slice(0, 500),
      });
      throw new CLIProcessError(`${this.#name}: CLI error — ${errMsg}`, 'exit');
    }
    return message;
  }

  #trackTokens(message) {
    const usage = message.usage;
    if (usage) {
      const inp = usage.inputTokens ?? usage.input_tokens ?? 0;
      const out = usage.outputTokens ?? usage.output_tokens ?? 0;
      this.#accumulatedTokens += inp + out;
    }
  }

  // ── Recycle / restart ────────────────────────────────────────────────────

  async recycle() {
    this.close();
    await this.start();
  }

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

  close() {
    if (this.#proc) {
      try {
        this.#proc.kill('SIGTERM');
      } catch {
        // Process may have already exited
      }
      this.#proc = null;
    }

    if (this.#inflightProc) {
      try {
        this.#inflightProc.kill('SIGTERM');
      } catch {
        // Process may have already exited
      }
      this.#inflightProc = null;
    }

    this.#alive = false;
    this.#sessionId = null;

    if (this.#pendingReject) {
      this.#pendingReject(new CLIProcessError(`${this.#name}: process closed`, 'killed'));
      this.#pendingReject = null;
      this.#pendingResolve = null;
    }
  }

  // ── Mutex ────────────────────────────────────────────────────────────────

  #acquireMutex() {
    let release;
    const next = new Promise((resolve) => {
      release = resolve;
    });
    const prev = this.#mutexPromise;
    this.#mutexPromise = prev.then(() => next);
    return prev.then(() => release);
  }

  // ── Accessors ────────────────────────────────────────────────────────────

  get alive() {
    return this.#alive;
  }

  get tokenCount() {
    return this.#accumulatedTokens;
  }

  get name() {
    return this.#name;
  }

  get stderrDiagnostics() {
    return this.#stderrBuffer.join('\n');
  }
}
