/**
 * Request Timeout Middleware Tests
 *
 * Verifies that hung connections are terminated with 408 and that
 * well-behaved requests, WebSocket upgrades, and streaming responses
 * are left alone.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { requestTimeout } from '../../middleware/request-timeout.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type EventMap = Record<string, Array<() => void>>;

function mockRequest(
  headers: Record<string, string | string[] | undefined> = {},
  overrides: Record<string, unknown> = {}
): Request {
  return {
    headers,
    originalUrl: '/api/v1/tasks',
    url: '/api/v1/tasks',
    path: '/api/v1/tasks',
    destroy: vi.fn(),
    ...overrides,
  } as unknown as Request;
}

interface MockRes extends Response {
  _statusCode: number;
  _json: unknown;
  _events: EventMap;
  _emit: (event: string) => void;
}

function mockResponse(): MockRes {
  const events: EventMap = {};

  const res = {
    _statusCode: 0,
    _json: null,
    _events: events,
    headersSent: false,
    locals: {},

    status(code: number) {
      res._statusCode = code;
      return res;
    },

    json(body: unknown) {
      res._json = body;
      return res;
    },

    on(event: string, cb: () => void) {
      if (!events[event]) events[event] = [];
      events[event].push(cb);
      return res;
    },

    /** Simulate emitting a response event (finish / close) */
    _emit(event: string) {
      (events[event] || []).forEach((cb) => cb());
    },
  } as unknown as MockRes;

  return res;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Request Timeout Middleware', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // Normal operation
  // -----------------------------------------------------------------------

  it('should call next() immediately and not block the request', () => {
    const middleware = requestTimeout();
    const req = mockRequest();
    const res = mockResponse();
    const next: NextFunction = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('should not send a timeout response when the request completes within the limit', () => {
    const middleware = requestTimeout(5_000);
    const req = mockRequest();
    const res = mockResponse();
    const next: NextFunction = vi.fn();

    middleware(req, res, next);

    // Simulate the response finishing before the timeout
    res._emit('finish');

    // Advance past the timeout window
    vi.advanceTimersByTime(6_000);

    expect(res._statusCode).toBe(0);
    expect(res._json).toBeNull();
    expect(req.destroy).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Timeout behaviour
  // -----------------------------------------------------------------------

  it('should respond with 408 when the default 30 s timeout is exceeded', () => {
    const middleware = requestTimeout();
    const req = mockRequest();
    const res = mockResponse();
    const next: NextFunction = vi.fn();

    middleware(req, res, next);

    vi.advanceTimersByTime(30_000);

    expect(res._statusCode).toBe(408);
    expect(res._json).toEqual({
      error: 'Request Timeout',
      message: 'Request exceeded the 30s timeout',
      code: 'REQUEST_TIMEOUT',
    });
    expect(req.destroy).toHaveBeenCalledOnce();
  });

  it('should respect a custom timeout value', () => {
    const middleware = requestTimeout(10_000);
    const req = mockRequest();
    const res = mockResponse();
    const next: NextFunction = vi.fn();

    middleware(req, res, next);

    // Not timed out yet
    vi.advanceTimersByTime(9_999);
    expect(res._statusCode).toBe(0);

    // Now it fires
    vi.advanceTimersByTime(1);
    expect(res._statusCode).toBe(408);
    expect(res._json).toEqual({
      error: 'Request Timeout',
      message: 'Request exceeded the 10s timeout',
      code: 'REQUEST_TIMEOUT',
    });
  });

  // -----------------------------------------------------------------------
  // Upload / attachment routes get 120 s
  // -----------------------------------------------------------------------

  it('should use 120 s timeout for attachment upload routes', () => {
    const middleware = requestTimeout(); // default 30 s
    const req = mockRequest(
      {},
      {
        originalUrl: '/api/v1/tasks/task_abc123/attachments',
        url: '/api/v1/tasks/task_abc123/attachments',
        path: '/tasks/task_abc123/attachments',
      }
    );
    const res = mockResponse();
    const next: NextFunction = vi.fn();

    middleware(req, res, next);

    // Should NOT fire at the 30 s mark
    vi.advanceTimersByTime(30_000);
    expect(res._statusCode).toBe(0);

    // Should fire at 120 s
    vi.advanceTimersByTime(90_000);
    expect(res._statusCode).toBe(408);
    expect(res._json).toEqual({
      error: 'Request Timeout',
      message: 'Request exceeded the 120s timeout',
      code: 'REQUEST_TIMEOUT',
    });
  });

  // -----------------------------------------------------------------------
  // WebSocket upgrade — skip
  // -----------------------------------------------------------------------

  it('should skip WebSocket upgrade requests', () => {
    const middleware = requestTimeout(100);
    const req = mockRequest({ upgrade: 'websocket' });
    const res = mockResponse();
    const next: NextFunction = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(200);

    // No timeout response should have been sent
    expect(res._statusCode).toBe(0);
    expect(req.destroy).not.toHaveBeenCalled();
  });

  it('should skip WebSocket upgrade requests (case-insensitive)', () => {
    const middleware = requestTimeout(100);
    const req = mockRequest({ upgrade: 'WebSocket' });
    const res = mockResponse();
    const next: NextFunction = vi.fn();

    middleware(req, res, next);

    vi.advanceTimersByTime(200);
    expect(res._statusCode).toBe(0);
  });

  // -----------------------------------------------------------------------
  // SSE / streaming — skip if headers already sent
  // -----------------------------------------------------------------------

  it('should not send timeout response if headers are already sent (SSE/streaming)', () => {
    const middleware = requestTimeout(100);
    const req = mockRequest();
    const res = mockResponse();
    const next: NextFunction = vi.fn();

    middleware(req, res, next);

    // Simulate headers already flushed (e.g. SSE or chunked transfer)
    (res as unknown as { headersSent: boolean }).headersSent = true;

    vi.advanceTimersByTime(100);

    // No duplicate response, no socket destruction
    expect(res._statusCode).toBe(0);
    expect(req.destroy).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Cleanup on client disconnect
  // -----------------------------------------------------------------------

  it('should clear timeout when the client disconnects (close event)', () => {
    const middleware = requestTimeout(5_000);
    const req = mockRequest();
    const res = mockResponse();
    const next: NextFunction = vi.fn();

    middleware(req, res, next);

    // Client drops the connection
    res._emit('close');

    vi.advanceTimersByTime(5_000);

    expect(res._statusCode).toBe(0);
    expect(req.destroy).not.toHaveBeenCalled();
  });
});
