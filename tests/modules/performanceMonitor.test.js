import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger to prevent file I/O during tests
vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

describe('CircularBuffer', () => {
  let CircularBuffer;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../src/modules/performanceMonitor.js');
    CircularBuffer = mod.CircularBuffer;
  });

  it('returns empty array when empty', () => {
    const buf = new CircularBuffer(5);
    expect(buf.toArray()).toEqual([]);
    expect(buf.size).toBe(0);
  });

  it('stores items in order when not full', () => {
    const buf = new CircularBuffer(5);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    expect(buf.toArray()).toEqual([1, 2, 3]);
    expect(buf.size).toBe(3);
  });

  it('overwrites oldest when full (circular)', () => {
    const buf = new CircularBuffer(3);
    buf.push('a');
    buf.push('b');
    buf.push('c');
    buf.push('d'); // overwrites 'a'
    expect(buf.toArray()).toEqual(['b', 'c', 'd']);
    expect(buf.size).toBe(3);
  });

  it('handles exactly-full buffer correctly', () => {
    const buf = new CircularBuffer(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    expect(buf.toArray()).toEqual([1, 2, 3]);
  });

  it('clears the buffer', () => {
    const buf = new CircularBuffer(5);
    buf.push(1);
    buf.push(2);
    buf.clear();
    expect(buf.toArray()).toEqual([]);
    expect(buf.size).toBe(0);
  });

  it('wraps around correctly after multiple overwrites', () => {
    const buf = new CircularBuffer(3);
    for (let i = 1; i <= 9; i++) buf.push(i);
    // Last 3 pushed: 7, 8, 9
    expect(buf.toArray()).toEqual([7, 8, 9]);
  });
});

describe('PerformanceMonitor', () => {
  let PerformanceMonitor;
  let DEFAULT_THRESHOLDS;

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    const mod = await import('../../src/modules/performanceMonitor.js');
    PerformanceMonitor = mod.PerformanceMonitor;
    DEFAULT_THRESHOLDS = mod.DEFAULT_THRESHOLDS;
    // Reset singleton
    PerformanceMonitor.instance = null;
  });

  afterEach(() => {
    // Stop any running timer
    if (PerformanceMonitor.instance) {
      PerformanceMonitor.instance.stop();
    }
    PerformanceMonitor.instance = null;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── Singleton ──────────────────────────────────────────────

  it('returns same instance via getInstance', () => {
    const a = PerformanceMonitor.getInstance();
    const b = PerformanceMonitor.getInstance();
    expect(a).toBe(b);
  });

  it('throws if constructor called after instance exists', () => {
    PerformanceMonitor.getInstance();
    expect(() => new PerformanceMonitor()).toThrow('Use PerformanceMonitor.getInstance()');
  });

  // ── Start / Stop ───────────────────────────────────────────

  it('start() is idempotent', () => {
    const monitor = PerformanceMonitor.getInstance();
    monitor.start();
    const timer1 = monitor._timer;
    monitor.start(); // second call
    expect(monitor._timer).toBe(timer1); // same timer
    monitor.stop();
  });

  it('stop() clears the timer', () => {
    const monitor = PerformanceMonitor.getInstance();
    monitor.start();
    expect(monitor._timer).not.toBeNull();
    monitor.stop();
    expect(monitor._timer).toBeNull();
  });

  // ── Thresholds ─────────────────────────────────────────────

  it('returns default thresholds', () => {
    const monitor = PerformanceMonitor.getInstance();
    expect(monitor.getThresholds()).toEqual(DEFAULT_THRESHOLDS);
  });

  it('updates thresholds partially', () => {
    const monitor = PerformanceMonitor.getInstance();
    monitor.setThresholds({ memoryHeapMb: 256 });
    const thresholds = monitor.getThresholds();
    expect(thresholds.memoryHeapMb).toBe(256);
    // Other fields unchanged
    expect(thresholds.cpuPercent).toBe(DEFAULT_THRESHOLDS.cpuPercent);
  });

  it('getThresholds returns a copy', () => {
    const monitor = PerformanceMonitor.getInstance();
    const t1 = monitor.getThresholds();
    t1.memoryHeapMb = 9999;
    expect(monitor.getThresholds().memoryHeapMb).toBe(DEFAULT_THRESHOLDS.memoryHeapMb);
  });

  // ── Response Times ─────────────────────────────────────────

  it('records response times', () => {
    const monitor = PerformanceMonitor.getInstance();
    monitor.recordResponseTime('ping', 42, 'command');
    monitor.recordResponseTime('status', 15, 'command');
    const snap = monitor.getSnapshot();
    expect(snap.responseTimes).toHaveLength(2);
    expect(snap.responseTimes[0].name).toBe('ping');
    expect(snap.responseTimes[0].durationMs).toBe(42);
    expect(snap.responseTimes[0].type).toBe('command');
  });

  it('defaults type to command', () => {
    const monitor = PerformanceMonitor.getInstance();
    monitor.recordResponseTime('test', 10);
    const snap = monitor.getSnapshot();
    expect(snap.responseTimes[0].type).toBe('command');
  });

  it('records api type', () => {
    const monitor = PerformanceMonitor.getInstance();
    monitor.recordResponseTime('GET /health', 25, 'api');
    const snap = monitor.getSnapshot();
    expect(snap.responseTimes[0].type).toBe('api');
  });

  // ── Summary Statistics ─────────────────────────────────────

  it('returns zero summary when no response times recorded', () => {
    const monitor = PerformanceMonitor.getInstance();
    const snap = monitor.getSnapshot();
    expect(snap.summary).toEqual({ count: 0, avgMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 });
  });

  it('computes correct summary stats', () => {
    const monitor = PerformanceMonitor.getInstance();
    // Deterministic dataset: 10 values 10..100
    for (let i = 1; i <= 10; i++) {
      monitor.recordResponseTime('cmd', i * 10);
    }
    const { summary } = monitor.getSnapshot();
    expect(summary.count).toBe(10);
    expect(summary.maxMs).toBe(100);
    expect(summary.avgMs).toBe(55); // (10+20+...+100)/10 = 55
  });

  // ── Alerts ────────────────────────────────────────────────

  it('fires alert callback when threshold exceeded', () => {
    const monitor = PerformanceMonitor.getInstance();
    monitor.setThresholds({ responseTimeMs: 100 });
    const cb = vi.fn();
    monitor.onAlert(cb);
    monitor.recordResponseTime('slow-cmd', 200);
    expect(cb).toHaveBeenCalledWith('responseTimeMs', 200, 100, 'slow-cmd');
  });

  it('does not fire alert when under threshold', () => {
    const monitor = PerformanceMonitor.getInstance();
    monitor.setThresholds({ responseTimeMs: 1000 });
    const cb = vi.fn();
    monitor.onAlert(cb);
    monitor.recordResponseTime('fast-cmd', 50);
    expect(cb).not.toHaveBeenCalled();
  });

  it('respects alert cooldown (5 minutes)', () => {
    const monitor = PerformanceMonitor.getInstance();
    monitor.setThresholds({ responseTimeMs: 10 });
    const cb = vi.fn();
    monitor.onAlert(cb);

    monitor.recordResponseTime('cmd', 100); // triggers alert
    monitor.recordResponseTime('cmd', 100); // within cooldown — no alert
    expect(cb).toHaveBeenCalledTimes(1);

    // Advance past cooldown
    vi.advanceTimersByTime(6 * 60 * 1000);
    monitor.recordResponseTime('cmd', 100); // should trigger again
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('handles alert callback errors gracefully', () => {
    const monitor = PerformanceMonitor.getInstance();
    monitor.setThresholds({ responseTimeMs: 10 });
    monitor.onAlert(() => {
      throw new Error('callback exploded');
    });
    // Should not throw
    expect(() => monitor.recordResponseTime('cmd', 100)).not.toThrow();
  });

  // ── Snapshot Structure ─────────────────────────────────────

  it('getSnapshot returns expected shape', () => {
    const monitor = PerformanceMonitor.getInstance();
    const snap = monitor.getSnapshot();
    expect(snap).toHaveProperty('current');
    expect(snap).toHaveProperty('thresholds');
    expect(snap).toHaveProperty('timeSeries');
    expect(snap).toHaveProperty('responseTimes');
    expect(snap).toHaveProperty('summary');
    expect(snap.current).toHaveProperty('memoryHeapMb');
    expect(snap.current).toHaveProperty('memoryRssMb');
    expect(snap.current).toHaveProperty('cpuPercent');
    expect(snap.current).toHaveProperty('uptime');
    expect(snap.timeSeries).toHaveProperty('memoryHeapMb');
    expect(snap.timeSeries).toHaveProperty('memoryRssMb');
    expect(snap.timeSeries).toHaveProperty('cpuPercent');
  });

  // ── Periodic Sampling ──────────────────────────────────────

  it('populates time-series on interval tick', () => {
    const monitor = PerformanceMonitor.getInstance();
    monitor.start();

    // Initially no samples
    expect(monitor.getSnapshot().timeSeries.memoryHeapMb).toHaveLength(0);

    // Advance one interval
    vi.advanceTimersByTime(30_000);
    const snap = monitor.getSnapshot();
    expect(snap.timeSeries.memoryHeapMb).toHaveLength(1);
    expect(snap.timeSeries.memoryRssMb).toHaveLength(1);
    expect(snap.timeSeries.cpuPercent).toHaveLength(1);

    // Advance another interval
    vi.advanceTimersByTime(30_000);
    expect(monitor.getSnapshot().timeSeries.memoryHeapMb).toHaveLength(2);
  });
});
