import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('HealthMonitor', () => {
  let HealthMonitor;

  beforeEach(async () => {
    // Reset the module to clear the singleton between tests
    vi.resetModules();
    const mod = await import('../../src/utils/health.js');
    HealthMonitor = mod.HealthMonitor;
    // FRAGILE COUPLING: We directly set HealthMonitor.instance = null to reset
    // the singleton between tests. This relies on the internal implementation
    // detail that the singleton is stored as a static 'instance' property.
    // A cleaner approach would be a static resetInstance() method, but that
    // would add test-only code to production. If the singleton storage changes,
    // these tests will need updating.
    HealthMonitor.instance = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create singleton via getInstance', () => {
    const instance1 = HealthMonitor.getInstance();
    const instance2 = HealthMonitor.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('should throw if constructor called directly when instance exists', () => {
    HealthMonitor.getInstance(); // Create first instance
    expect(() => new HealthMonitor()).toThrow('Use HealthMonitor.getInstance()');
  });

  it('should record start time', () => {
    const monitor = HealthMonitor.getInstance();
    const before = Date.now();
    monitor.recordStart();
    const after = Date.now();
    expect(monitor.startTime).toBeGreaterThanOrEqual(before);
    expect(monitor.startTime).toBeLessThanOrEqual(after);
  });

  it('should record AI request timestamp', () => {
    const monitor = HealthMonitor.getInstance();
    expect(monitor.lastAIRequest).toBeNull();
    monitor.recordAIRequest();
    expect(typeof monitor.lastAIRequest).toBe('number');
    expect(monitor.lastAIRequest).toBeGreaterThan(0);
  });

  it('should set API status', () => {
    const monitor = HealthMonitor.getInstance();
    expect(monitor.apiStatus).toBe('unknown');
    monitor.setAPIStatus('ok');
    expect(monitor.apiStatus).toBe('ok');
    expect(typeof monitor.lastAPICheck).toBe('number');
    expect(monitor.lastAPICheck).toBeGreaterThan(0);

    monitor.setAPIStatus('error');
    expect(monitor.apiStatus).toBe('error');
  });

  it('should calculate uptime', () => {
    const monitor = HealthMonitor.getInstance();
    monitor.startTime = Date.now() - 5000;
    const uptime = monitor.getUptime();
    expect(uptime).toBeGreaterThanOrEqual(4900);
    expect(uptime).toBeLessThanOrEqual(6000);
  });

  it('should format uptime as seconds', () => {
    const monitor = HealthMonitor.getInstance();
    monitor.startTime = Date.now() - 30 * 1000;
    const formatted = monitor.getFormattedUptime();
    expect(formatted).toMatch(/\d+s/);
  });

  it('should format uptime as minutes', () => {
    const monitor = HealthMonitor.getInstance();
    monitor.startTime = Date.now() - 5 * 60 * 1000;
    const formatted = monitor.getFormattedUptime();
    expect(formatted).toMatch(/\d+m \d+s/);
  });

  it('should format uptime as hours', () => {
    const monitor = HealthMonitor.getInstance();
    monitor.startTime = Date.now() - 2 * 60 * 60 * 1000;
    const formatted = monitor.getFormattedUptime();
    expect(formatted).toMatch(/\d+h \d+m \d+s/);
  });

  it('should format uptime as days', () => {
    const monitor = HealthMonitor.getInstance();
    monitor.startTime = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const formatted = monitor.getFormattedUptime();
    expect(formatted).toMatch(/\d+d \d+h \d+m/);
  });

  it('should return memory usage stats', () => {
    const monitor = HealthMonitor.getInstance();
    const mem = monitor.getMemoryUsage();
    expect(typeof mem.heapUsed).toBe('number');
    expect(typeof mem.heapTotal).toBe('number');
    expect(typeof mem.rss).toBe('number');
    expect(typeof mem.external).toBe('number');
  });

  it('should return formatted memory string', () => {
    const monitor = HealthMonitor.getInstance();
    const formatted = monitor.getFormattedMemory();
    expect(formatted).toMatch(/\d+MB \/ \d+MB \(RSS: \d+MB\)/);
  });

  it('should return complete status', () => {
    const monitor = HealthMonitor.getInstance();
    monitor.recordAIRequest();
    monitor.setAPIStatus('ok');

    const status = monitor.getStatus();
    expect(status.uptime).toBeGreaterThanOrEqual(0);
    expect(typeof status.uptimeFormatted).toBe('string');
    expect(status.uptimeFormatted.length).toBeGreaterThan(0);
    expect(typeof status.memory.heapUsed).toBe('number');
    expect(typeof status.memory.formatted).toBe('string');
    expect(status.memory.formatted.length).toBeGreaterThan(0);
    expect(status.api.status).toBe('ok');
    expect(typeof status.api.lastCheck).toBe('number');
    expect(status.api.lastCheck).toBeGreaterThan(0);
    expect(typeof status.lastAIRequest).toBe('number');
    expect(typeof status.timestamp).toBe('number');
  });

  it('should return detailed status with process info', () => {
    const monitor = HealthMonitor.getInstance();
    const status = monitor.getDetailedStatus();

    expect(status.process.pid).toBe(process.pid);
    expect(status.process.platform).toBe(process.platform);
    expect(status.process.nodeVersion).toBe(process.version);
    expect(typeof status.process.uptime).toBe('number');
    expect(typeof status.memory.arrayBuffers).toBe('number');
    expect(status.cpu).toHaveProperty('user');
    expect(status.cpu).toHaveProperty('system');
  });
});
