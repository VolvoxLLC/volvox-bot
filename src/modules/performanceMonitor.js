/**
 * Performance Monitor
 *
 * Tracks bot performance metrics over time:
 * - Memory usage (heap, RSS) — sampled every 30s
 * - CPU utilization — sampled every 30s
 * - Command/interaction response times
 * - API request response times
 * - Alert thresholds with configurable callbacks
 *
 * All time-series data is stored in circular buffers (in-memory).
 * Data is NOT persisted to disk; it resets on bot restart.
 */

import { info, warn } from '../logger.js';

/** How many data points to retain per metric (30s interval × 120 = 1hr) */
const DEFAULT_BUFFER_SIZE = 120;

/** How often to sample memory/CPU (ms) */
const SAMPLE_INTERVAL_MS = 30_000;

/**
 * Default alert thresholds
 */
const DEFAULT_THRESHOLDS = {
  memoryHeapMb: 512,
  memoryRssMb: 768,
  cpuPercent: 80,
  responseTimeMs: 5_000,
};

/**
 * Circular buffer — fixed capacity, overwrites oldest on full
 */
class CircularBuffer {
  constructor(capacity) {
    this._capacity = capacity;
    this._buf = new Array(capacity);
    this._head = 0;
    this._size = 0;
  }

  push(item) {
    this._buf[this._head] = item;
    this._head = (this._head + 1) % this._capacity;
    if (this._size < this._capacity) this._size++;
  }

  /** Returns oldest → newest */
  toArray() {
    if (this._size === 0) return [];
    if (this._size < this._capacity) {
      return this._buf.slice(0, this._size);
    }
    return [...this._buf.slice(this._head), ...this._buf.slice(0, this._head)];
  }

  get size() {
    return this._size;
  }

  clear() {
    this._head = 0;
    this._size = 0;
  }
}

/**
 * PerformanceMonitor singleton.
 */
class PerformanceMonitor {
  constructor() {
    if (PerformanceMonitor.instance) {
      throw new Error('Use PerformanceMonitor.getInstance()');
    }

    this._memHeap = new CircularBuffer(DEFAULT_BUFFER_SIZE);
    this._memRss = new CircularBuffer(DEFAULT_BUFFER_SIZE);
    this._cpu = new CircularBuffer(DEFAULT_BUFFER_SIZE);
    this._responseTimes = new CircularBuffer(DEFAULT_BUFFER_SIZE * 4);
    this._thresholds = { ...DEFAULT_THRESHOLDS };
    this._alertCallbacks = [];
    this._timer = null;
    this._prevCpuUsage = null;
    this._prevCpuTime = null;
    this._lastAlert = {};

    PerformanceMonitor.instance = this;
  }

  static getInstance() {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /** Start the periodic sampler. Idempotent. */
  start() {
    if (this._timer) return;

    this._prevCpuUsage = process.cpuUsage();
    this._prevCpuTime = Date.now();

    this._timer = setInterval(() => {
      this._sample();
    }, SAMPLE_INTERVAL_MS);

    if (this._timer.unref) this._timer.unref();

    info('PerformanceMonitor started', { intervalMs: SAMPLE_INTERVAL_MS });
  }

  /** Stop the periodic sampler. */
  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
      info('PerformanceMonitor stopped');
    }
  }

  /**
   * Update alert thresholds at runtime.
   * @param {object} thresholds
   */
  setThresholds(thresholds) {
    this._thresholds = { ...this._thresholds, ...thresholds };
    info('PerformanceMonitor thresholds updated', this._thresholds);
  }

  getThresholds() {
    return { ...this._thresholds };
  }

  /**
   * Register an alert callback.
   * Called when a metric exceeds its threshold (5-minute cooldown per metric).
   * @param {Function} fn - (metric, value, threshold, label) => void
   */
  onAlert(fn) {
    this._alertCallbacks.push(fn);
  }

  /**
   * Record a response time sample.
   * @param {string} name - Command or endpoint label
   * @param {number} durationMs
   * @param {'command'|'api'} type
   */
  recordResponseTime(name, durationMs, type = 'command') {
    this._responseTimes.push({ timestamp: Date.now(), name, durationMs, type });
    this._checkThreshold('responseTimeMs', durationMs, this._thresholds.responseTimeMs, name);
  }

  /**
   * Get a full performance snapshot.
   */
  getSnapshot() {
    const mem = process.memoryUsage();
    return {
      current: {
        memoryHeapMb: Math.round(mem.heapUsed / 1024 / 1024),
        memoryRssMb: Math.round(mem.rss / 1024 / 1024),
        memoryHeapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
        memoryExternalMb: Math.round(mem.external / 1024 / 1024),
        cpuPercent: this._getLastCpuPercent(),
        uptime: process.uptime(),
      },
      thresholds: this.getThresholds(),
      timeSeries: {
        memoryHeapMb: this._memHeap.toArray(),
        memoryRssMb: this._memRss.toArray(),
        cpuPercent: this._cpu.toArray(),
      },
      responseTimes: this._responseTimes.toArray(),
      summary: this._buildSummary(),
    };
  }

  // ─── Private ───────────────────────────────────────────────

  _sample() {
    const ts = Date.now();
    const mem = process.memoryUsage();
    const heapMb = Math.round(mem.heapUsed / 1024 / 1024);
    const rssMb = Math.round(mem.rss / 1024 / 1024);
    const cpuPct = this._sampleCpu();

    this._memHeap.push({ timestamp: ts, value: heapMb });
    this._memRss.push({ timestamp: ts, value: rssMb });
    this._cpu.push({ timestamp: ts, value: cpuPct });

    this._checkThreshold('memoryHeapMb', heapMb, this._thresholds.memoryHeapMb);
    this._checkThreshold('memoryRssMb', rssMb, this._thresholds.memoryRssMb);
    this._checkThreshold('cpuPercent', cpuPct, this._thresholds.cpuPercent);
  }

  /** Calculate CPU utilization % since last sample. */
  _sampleCpu() {
    const now = Date.now();
    const currentCpu = process.cpuUsage();

    if (!this._prevCpuUsage || !this._prevCpuTime) {
      this._prevCpuUsage = currentCpu;
      this._prevCpuTime = now;
      return 0;
    }

    const elapsedMs = now - this._prevCpuTime;
    const userDelta = currentCpu.user - this._prevCpuUsage.user;
    const systemDelta = currentCpu.system - this._prevCpuUsage.system;
    const cpuDeltaMs = (userDelta + systemDelta) / 1000;
    const pct = Math.min(100, Math.round((cpuDeltaMs / elapsedMs) * 100));

    this._prevCpuUsage = currentCpu;
    this._prevCpuTime = now;

    return pct;
  }

  _getLastCpuPercent() {
    const arr = this._cpu.toArray();
    return arr.length > 0 ? arr[arr.length - 1].value : 0;
  }

  _checkThreshold(metric, value, threshold, label = '') {
    if (value <= threshold) return;

    const cooldownMs = 5 * 60 * 1000;
    const key = label ? `${metric}:${label}` : metric;
    const lastTs = this._lastAlert[key] || 0;
    if (Date.now() - lastTs < cooldownMs) return;

    this._lastAlert[key] = Date.now();
    const fullLabel = label ? `${metric} [${label}]` : metric;
    warn(`Performance alert: ${fullLabel} exceeded threshold`, { value, threshold, metric, label });

    for (const cb of this._alertCallbacks) {
      try {
        cb(metric, value, threshold, label);
      } catch (err) {
        warn('PerformanceMonitor alert callback threw', { err: err?.message });
      }
    }
  }

  _buildSummary() {
    const samples = this._responseTimes.toArray();
    if (samples.length === 0) {
      return { count: 0, avgMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 };
    }

    const durations = samples.map((s) => s.durationMs).sort((a, b) => a - b);
    const len = durations.length;
    const avg = Math.round(durations.reduce((a, b) => a + b, 0) / len);

    return {
      count: len,
      avgMs: avg,
      p50Ms: durations[Math.floor(len * 0.5)] ?? 0,
      p95Ms: durations[Math.floor(len * 0.95)] ?? 0,
      p99Ms: durations[Math.floor(len * 0.99)] ?? 0,
      maxMs: durations[len - 1] ?? 0,
    };
  }
}

PerformanceMonitor.instance = null;

export { PerformanceMonitor, CircularBuffer, DEFAULT_THRESHOLDS, SAMPLE_INTERVAL_MS };
