/**
 * Health Monitor - Tracks bot health metrics
 *
 * Monitors:
 * - Uptime (time since bot started)
 * - Memory usage
 * - Last AI request timestamp
 * - Anthropic API connectivity status
 */

/**
 * Singleton health monitor instance
 */
class HealthMonitor {
  constructor() {
    if (HealthMonitor.instance) {
      throw new Error('Use HealthMonitor.getInstance() to obtain the singleton');
    }

    this.startTime = Date.now();
    this.lastAIRequest = null;
    this.apiStatus = 'unknown';
    this.lastAPICheck = null;

    HealthMonitor.instance = this;
  }

  /**
   * Get singleton instance
   */
  static getInstance() {
    if (!HealthMonitor.instance) {
      HealthMonitor.instance = new HealthMonitor();
    }
    return HealthMonitor.instance;
  }

  /**
   * Record the start time (call when bot is ready)
   */
  recordStart() {
    this.startTime = Date.now();
  }

  /**
   * Record AI request activity
   */
  recordAIRequest() {
    this.lastAIRequest = Date.now();
  }

  /**
   * Update API status
   * @param {string} status - 'ok', 'error', or 'unknown'
   */
  setAPIStatus(status) {
    this.apiStatus = status;
    this.lastAPICheck = Date.now();
  }

  /**
   * Get current uptime in milliseconds
   */
  getUptime() {
    return Date.now() - this.startTime;
  }

  /**
   * Get formatted uptime string
   */
  getFormattedUptime() {
    const uptime = this.getUptime();
    const seconds = Math.floor(uptime / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Get memory usage stats
   */
  getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
      rss: Math.round(usage.rss / 1024 / 1024), // MB
      external: Math.round(usage.external / 1024 / 1024), // MB
    };
  }

  /**
   * Get formatted memory usage string
   */
  getFormattedMemory() {
    const mem = this.getMemoryUsage();
    return `${mem.heapUsed}MB / ${mem.heapTotal}MB (RSS: ${mem.rss}MB)`;
  }

  /**
   * Get complete health status
   */
  getStatus() {
    const memory = this.getMemoryUsage();

    return {
      uptime: this.getUptime(),
      uptimeFormatted: this.getFormattedUptime(),
      memory: {
        heapUsed: memory.heapUsed,
        heapTotal: memory.heapTotal,
        rss: memory.rss,
        external: memory.external,
        formatted: this.getFormattedMemory(),
      },
      api: {
        status: this.apiStatus,
        lastCheck: this.lastAPICheck,
      },
      lastAIRequest: this.lastAIRequest,
      timestamp: Date.now(),
    };
  }

  /**
   * Get detailed diagnostics (for admin use)
   */
  getDetailedStatus() {
    const status = this.getStatus();
    const memory = process.memoryUsage();

    return {
      ...status,
      process: {
        pid: process.pid,
        platform: process.platform,
        nodeVersion: process.version,
        uptime: process.uptime(),
      },
      memory: {
        ...status.memory,
        arrayBuffers: Math.round(memory.arrayBuffers / 1024 / 1024),
      },
      cpu: process.cpuUsage(),
    };
  }
}

export { HealthMonitor };

/**
 * Memory usage threshold (%) above which health.degraded is fired.
 * heapUsed / heapTotal > this fraction triggers the event.
 */
export const MEMORY_DEGRADED_THRESHOLD = 0.8;

/**
 * Event loop lag threshold in ms above which health.degraded is fired.
 */
export const EVENT_LOOP_LAG_THRESHOLD_MS = 100;

/**
 * Measure approximate event loop lag in milliseconds.
 * Schedules a setImmediate and measures how long it took.
 *
 * @returns {Promise<number>} Lag in milliseconds
 */
export function measureEventLoopLag() {
  return new Promise((resolve) => {
    const start = Date.now();
    setImmediate(() => resolve(Date.now() - start));
  });
}

