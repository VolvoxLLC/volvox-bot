import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HealthMonitor } from '../../src/utils/health.js';

describe('HealthMonitor', () => {
  let monitor;

  beforeEach(() => {
    // Reset singleton between tests
    HealthMonitor.instance = null;
    monitor = HealthMonitor.getInstance();
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = HealthMonitor.getInstance();
      const instance2 = HealthMonitor.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should throw error if constructor called directly', () => {
      expect(() => new HealthMonitor()).toThrow('Use HealthMonitor.getInstance()');
    });
  });

  describe('recordStart', () => {
    it('should update start time', () => {
      const before = monitor.startTime;
      vi.useFakeTimers();
      vi.advanceTimersByTime(1000);
      monitor.recordStart();
      expect(monitor.startTime).toBeGreaterThan(before);
      vi.useRealTimers();
    });
  });

  describe('recordAIRequest', () => {
    it('should update last AI request timestamp', () => {
      expect(monitor.lastAIRequest).toBeNull();
      monitor.recordAIRequest();
      expect(monitor.lastAIRequest).toBeGreaterThan(0);
    });

    it('should update timestamp on each call', () => {
      monitor.recordAIRequest();
      const first = monitor.lastAIRequest;
      vi.useFakeTimers();
      vi.advanceTimersByTime(1000);
      monitor.recordAIRequest();
      const second = monitor.lastAIRequest;
      expect(second).toBeGreaterThan(first);
      vi.useRealTimers();
    });
  });

  describe('setAPIStatus', () => {
    it('should update API status', () => {
      monitor.setAPIStatus('ok');
      expect(monitor.apiStatus).toBe('ok');
      expect(monitor.lastAPICheck).toBeGreaterThan(0);
    });

    it('should accept error status', () => {
      monitor.setAPIStatus('error');
      expect(monitor.apiStatus).toBe('error');
    });

    it('should accept unknown status', () => {
      monitor.setAPIStatus('unknown');
      expect(monitor.apiStatus).toBe('unknown');
    });

    it('should update lastAPICheck timestamp', () => {
      const before = Date.now();
      monitor.setAPIStatus('ok');
      expect(monitor.lastAPICheck).toBeGreaterThanOrEqual(before);
    });
  });

  describe('getUptime', () => {
    it('should return uptime in milliseconds', () => {
      vi.useFakeTimers();
      monitor.recordStart();
      vi.advanceTimersByTime(5000);
      const uptime = monitor.getUptime();
      expect(uptime).toBe(5000);
      vi.useRealTimers();
    });

    it('should return positive number', () => {
      const uptime = monitor.getUptime();
      expect(uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getFormattedUptime', () => {
    it('should format seconds', () => {
      vi.useFakeTimers();
      monitor.recordStart();
      vi.advanceTimersByTime(30000); // 30 seconds
      expect(monitor.getFormattedUptime()).toBe('30s');
      vi.useRealTimers();
    });

    it('should format minutes and seconds', () => {
      vi.useFakeTimers();
      monitor.recordStart();
      vi.advanceTimersByTime(90000); // 1 minute 30 seconds
      expect(monitor.getFormattedUptime()).toBe('1m 30s');
      vi.useRealTimers();
    });

    it('should format hours, minutes, and seconds', () => {
      vi.useFakeTimers();
      monitor.recordStart();
      vi.advanceTimersByTime(3723000); // 1 hour 2 minutes 3 seconds
      expect(monitor.getFormattedUptime()).toBe('1h 2m 3s');
      vi.useRealTimers();
    });

    it('should format days, hours, and minutes', () => {
      vi.useFakeTimers();
      monitor.recordStart();
      vi.advanceTimersByTime(90123000); // 1 day 1 hour 2 minutes 3 seconds
      expect(monitor.getFormattedUptime()).toBe('1d 1h 2m');
      vi.useRealTimers();
    });
  });

  describe('getMemoryUsage', () => {
    it('should return memory usage object', () => {
      const usage = monitor.getMemoryUsage();
      expect(usage).toHaveProperty('heapUsed');
      expect(usage).toHaveProperty('heapTotal');
      expect(usage).toHaveProperty('rss');
      expect(usage).toHaveProperty('external');
    });

    it('should return values in megabytes', () => {
      const usage = monitor.getMemoryUsage();
      expect(usage.heapUsed).toBeGreaterThan(0);
      expect(usage.heapTotal).toBeGreaterThan(0);
      expect(usage.rss).toBeGreaterThan(0);
    });

    it('should return rounded integer values', () => {
      const usage = monitor.getMemoryUsage();
      expect(Number.isInteger(usage.heapUsed)).toBe(true);
      expect(Number.isInteger(usage.heapTotal)).toBe(true);
      expect(Number.isInteger(usage.rss)).toBe(true);
      expect(Number.isInteger(usage.external)).toBe(true);
    });
  });

  describe('getFormattedMemory', () => {
    it('should return formatted memory string', () => {
      const formatted = monitor.getFormattedMemory();
      expect(formatted).toMatch(/^\d+MB \/ \d+MB \(RSS: \d+MB\)$/);
    });
  });

  describe('getStatus', () => {
    it('should return complete status object', () => {
      monitor.setAPIStatus('ok');
      monitor.recordAIRequest();
      const status = monitor.getStatus();

      expect(status).toHaveProperty('uptime');
      expect(status).toHaveProperty('uptimeFormatted');
      expect(status).toHaveProperty('memory');
      expect(status).toHaveProperty('api');
      expect(status).toHaveProperty('lastAIRequest');
      expect(status).toHaveProperty('timestamp');
    });

    it('should include memory details', () => {
      const status = monitor.getStatus();
      expect(status.memory).toHaveProperty('heapUsed');
      expect(status.memory).toHaveProperty('heapTotal');
      expect(status.memory).toHaveProperty('rss');
      expect(status.memory).toHaveProperty('external');
      expect(status.memory).toHaveProperty('formatted');
    });

    it('should include API status', () => {
      monitor.setAPIStatus('ok');
      const status = monitor.getStatus();
      expect(status.api.status).toBe('ok');
      expect(status.api.lastCheck).toBeGreaterThan(0);
    });

    it('should include timestamp', () => {
      const before = Date.now();
      const status = monitor.getStatus();
      expect(status.timestamp).toBeGreaterThanOrEqual(before);
    });
  });

  describe('getDetailedStatus', () => {
    it('should return detailed status with process info', () => {
      const status = monitor.getDetailedStatus();

      expect(status).toHaveProperty('process');
      expect(status.process).toHaveProperty('pid');
      expect(status.process).toHaveProperty('platform');
      expect(status.process).toHaveProperty('nodeVersion');
      expect(status.process).toHaveProperty('uptime');
    });

    it('should include all basic status fields', () => {
      const status = monitor.getDetailedStatus();
      expect(status).toHaveProperty('uptime');
      expect(status).toHaveProperty('uptimeFormatted');
      expect(status).toHaveProperty('memory');
      expect(status).toHaveProperty('api');
    });

    it('should include array buffers in memory', () => {
      const status = monitor.getDetailedStatus();
      expect(status.memory).toHaveProperty('arrayBuffers');
      expect(typeof status.memory.arrayBuffers).toBe('number');
    });

    it('should include CPU usage', () => {
      const status = monitor.getDetailedStatus();
      expect(status).toHaveProperty('cpu');
      expect(status.cpu).toHaveProperty('user');
      expect(status.cpu).toHaveProperty('system');
    });

    it('should have valid process information', () => {
      const status = monitor.getDetailedStatus();
      expect(status.process.pid).toBeGreaterThan(0);
      expect(typeof status.process.platform).toBe('string');
      expect(status.process.nodeVersion).toMatch(/^v\d+\.\d+\.\d+/);
    });
  });
});