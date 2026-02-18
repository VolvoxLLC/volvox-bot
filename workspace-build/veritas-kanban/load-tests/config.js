/**
 * Shared configuration for k6 load tests.
 *
 * k6 does NOT use Node.js — `export` is ES module syntax
 * understood by the k6 runtime.
 */

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
export const API_BASE = `${BASE_URL}/api/v1`;
export const WS_URL = __ENV.WS_URL || 'ws://localhost:3001/ws';

export const API_KEY = __ENV.API_KEY || 'test-load-key';

export const defaultHeaders = {
  'Content-Type': 'application/json',
  'X-API-Key': API_KEY,
};

/**
 * Generate a unique task payload for creation.
 * @param {string} prefix - Prefix for the task title
 * @returns {object} Task creation payload
 */
export function makeTask(prefix = 'load-test') {
  const ts = Date.now();
  const rand = Math.random().toString(36).substring(2, 8);
  return {
    title: `${prefix}-${ts}-${rand}`,
    description: `Load test task created at ${new Date().toISOString()}`,
    type: 'code',
    priority: 'low',
  };
}
