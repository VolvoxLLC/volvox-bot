import { describe, expect, it, vi } from 'vitest';

import {
  expectJson,
  expectSearchParams,
  expectSharedProxyFailures,
  mockAuthorizeGuildAdmin,
  mockGetBotApiBaseUrl,
  mockProxyToBotApi,
  request,
  setupProxyRouteMocks,
} from './helpers/proxy-route-test-helpers';

import * as statsRoute from '@/app/api/stats/route';
import * as tempRoleDetailRoute from '@/app/api/temp-roles/[id]/route';
import * as tempRolesRoute from '@/app/api/temp-roles/route';

describe('stats and temp role proxy routes', () => {
  setupProxyRouteMocks();

  it('covers public stats proxy responses', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      Response.json({ guilds: 12, users: 34 }),
    );
    const ok = await statsRoute.GET();
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Cache-Control')).toContain('s-maxage=60');

    mockGetBotApiBaseUrl.mockReturnValueOnce(null);
    const unconfigured = await statsRoute.GET();
    expect(unconfigured.status).toBe(503);

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response('nope', { status: 502 }));
    const upstreamError = await statsRoute.GET();
    expect(upstreamError.status).toBe(502);

    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('down'));
    const unavailable = await statsRoute.GET();
    expect(unavailable.status).toBe(503);
  });

  it('covers temp role list, assignment, and revoke routes', async () => {
    const missingListGuild = await tempRolesRoute.GET(request('http://localhost/api'));
    expect(missingListGuild.status).toBe(400);

    const list = await tempRolesRoute.GET(
      request('http://localhost/api?guildId=guild-1&userId=user-1&page=2&ignored=x'),
    );
    expect(list.status).toBe(200);
    let upstream = mockProxyToBotApi.mock.calls.at(-1)?.[0] as URL;
    expect(upstream.pathname).toBe('/temp-roles');
    expectSearchParams(upstream, { guildId: 'guild-1', userId: 'user-1' });

    const assign = await tempRolesRoute.POST(
      request('http://localhost/api', {
        method: 'POST',
        body: JSON.stringify({ guildId: 'guild-1', userId: 'user-1', roleId: 'role-1' }),
      }),
    );
    expect(assign.status).toBe(200);
    expect(mockProxyToBotApi.mock.calls.at(-1)?.[4]).toMatchObject({ method: 'POST' });

    const invalidAssign = await tempRolesRoute.POST(
      request('http://localhost/api', { method: 'POST', body: '{' }),
    );
    expect(invalidAssign.status).toBe(400);

    const revoke = await tempRoleDetailRoute.DELETE(
      request('http://localhost/api?guildId=guild-1'),
      { params: Promise.resolve({ id: 'temp role 1' }) },
    );
    expect(revoke.status).toBe(200);
    upstream = mockProxyToBotApi.mock.calls.at(-1)?.[0] as URL;
    expect(upstream.pathname).toBe('/temp-roles/temp%20role%201');
    expectSearchParams(upstream, { guildId: 'guild-1' });
    expect(mockProxyToBotApi.mock.calls.at(-1)?.[4]).toMatchObject({ method: 'DELETE' });
  });

  it('covers missing guild guards for temp role routes', async () => {
    const missingGuildCases = [
      () => tempRolesRoute.POST(
        request('http://localhost/api', { method: 'POST', body: JSON.stringify({}) }),
      ),
      () => tempRoleDetailRoute.DELETE(request('http://localhost/api'), {
        params: Promise.resolve({ id: 'temp-role-1' }),
      }),
    ];

    for (const call of missingGuildCases) {
      const response = await call();
      expect(response.status).toBe(400);
    }
  });

  it('returns auth, config, and upstream construction errors from temp role routes', async () => {
    const adminRoutes = [
      () => tempRolesRoute.GET(request('http://localhost/api?guildId=guild-1')),
      () => tempRolesRoute.POST(
        request('http://localhost/api', {
          method: 'POST',
          body: JSON.stringify({ guildId: 'guild-1', userId: 'user-1', roleId: 'role-1' }),
        }),
      ),
      () => tempRoleDetailRoute.DELETE(request('http://localhost/api?guildId=guild-1'), {
        params: Promise.resolve({ id: 'temp-role-1' }),
      }),
    ];

    for (const call of adminRoutes) {
      await expectSharedProxyFailures(call, mockAuthorizeGuildAdmin);
    }
  });
});
