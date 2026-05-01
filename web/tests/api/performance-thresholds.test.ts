import { describe, expect, it } from 'vitest';

import {
  expectSharedProxyFailures,
  mockGetToken,
  mockProxyToBotApi,
  request,
  setupProxyRouteMocks,
} from './helpers/proxy-route-test-helpers';

import * as performanceRoute from '@/app/api/performance/route';
import * as thresholdsRoute from '@/app/api/performance/thresholds/route';

describe('performance and threshold proxy routes', () => {
  setupProxyRouteMocks();

  it('covers performance and threshold authorization branches', async () => {
    await performanceRoute.GET(request('http://localhost/api'));
    await thresholdsRoute.GET(request('http://localhost/api'));
    await thresholdsRoute.PUT(
      request('http://localhost/api', { method: 'PUT', body: JSON.stringify({ slowQueryMs: 250 }) }),
    );

    expect(mockProxyToBotApi).toHaveBeenCalledWith(
      expect.any(URL),
      'bot-secret',
      '[api/performance/thresholds]',
      'Failed to update thresholds',
      expect.objectContaining({ method: 'PUT' }),
    );

    mockGetToken.mockResolvedValueOnce({ accessToken: 'token', id: 'not-owner' });
    const forbidden = await performanceRoute.GET(request('http://localhost/api'));
    expect(forbidden.status).toBe(403);

    mockGetToken.mockResolvedValueOnce({ id: 'owner-1' }).mockResolvedValueOnce(null);
    const unauthorized = await performanceRoute.GET(request('http://localhost/api'));
    expect(unauthorized.status).toBe(401);

    mockGetToken
      .mockResolvedValueOnce({ accessToken: 'token', id: 'owner-1' })
      .mockResolvedValueOnce({ accessToken: 'token', error: 'RefreshTokenError' });
    const expired = await thresholdsRoute.GET(request('http://localhost/api'));
    expect(expired.status).toBe(401);

    const invalidBody = await thresholdsRoute.PUT(
      request('http://localhost/api', { method: 'PUT', body: '{' }),
    );
    expect(invalidBody.status).toBe(400);
  });

  it('returns config and upstream construction errors from token-authenticated performance routes', async () => {
    const performanceRoutes = [
      () => performanceRoute.GET(request('http://localhost/api')),
      () => thresholdsRoute.GET(request('http://localhost/api')),
      () => thresholdsRoute.PUT(
        request('http://localhost/api', { method: 'PUT', body: JSON.stringify({ slowQueryMs: 250 }) }),
      ),
    ];

    for (const call of performanceRoutes) {
      await expectSharedProxyFailures(call);
    }
  });
});
