import { describe, expect, it } from 'vitest';

import {
  expectJson,
  expectProxiedRoutes,
  expectSharedProxyFailures,
  guildParams,
  mockAuthorizeGuildAdmin,
  mockProxyToBotApi,
  proxyCases,
  request,
  setupProxyRouteMocks,
} from './helpers/proxy-route-test-helpers';

import * as auditLogRoute from '@/app/api/guilds/[guildId]/audit-log/route';
import * as configRoute from '@/app/api/guilds/[guildId]/config/route';
import * as rolesRoute from '@/app/api/guilds/[guildId]/roles/route';

describe('guild config, roles, and audit proxy routes', () => {
  setupProxyRouteMocks();

  it('covers audit log query forwarding', async () => {
    const cases = proxyCases([
      {
        call: () => auditLogRoute.GET(request('http://localhost/api?limit=25&offset=5&ignored=x'), guildParams()),
        path: '/guilds/guild%201/audit-log',
        query: { limit: '25', offset: '5' },
      },
    ]);

    await expectProxiedRoutes(cases);
  });

  it('covers config read and write validation before proxying', async () => {
    await configRoute.GET(request('http://localhost/api'), guildParams());

    const patchResponse = await configRoute.PATCH(
      request('http://localhost/api', {
        method: 'PATCH',
        body: JSON.stringify({ path: 'features.xp.enabled', value: true }),
      }),
      guildParams(),
    );
    expect(patchResponse.status).toBe(200);
    expect(mockProxyToBotApi.mock.calls.at(-1)?.[4]).toMatchObject({ method: 'PATCH' });

    const putResponse = await configRoute.PUT(
      request('http://localhost/api', {
        method: 'PUT',
        body: JSON.stringify([{ path: 'features.levels.enabled', value: false }]),
      }),
      guildParams(),
    );
    expect(putResponse.status).toBe(200);
    expect(mockProxyToBotApi.mock.calls.at(-1)?.[4]).toMatchObject({ method: 'PUT' });

    const invalidPatch = await configRoute.PATCH(
      request('http://localhost/api', { method: 'PATCH', body: JSON.stringify({ path: '' }) }),
      guildParams(),
    );
    expect(invalidPatch.status).toBe(400);
    await expectJson(invalidPatch, {
      error: 'Invalid patch: expected { path: string, value: unknown }',
    });

    const invalidPut = await configRoute.PUT(
      request('http://localhost/api', { method: 'PUT', body: JSON.stringify({ path: 'x' }) }),
      guildParams(),
    );
    expect(invalidPut.status).toBe(400);
    await expectJson(invalidPut, { error: 'Invalid payload: expected an array of patches' });
  });

  it('covers missing guild guards for config, roles, and audit routes', async () => {
    const missingGuildCases = [
      () => auditLogRoute.GET(request('http://localhost/api'), guildParams('')),
      () => configRoute.GET(request('http://localhost/api'), guildParams('')),
      () => rolesRoute.GET(request('http://localhost/api'), guildParams('')),
    ];

    for (const call of missingGuildCases) {
      const response = await call();
      expect(response.status).toBe(400);
    }
  });

  it('returns auth, config, and upstream construction errors from config, roles, and audit routes', async () => {
    const adminRoutes = [
      () => auditLogRoute.GET(request('http://localhost/api'), guildParams('guild-1')),
      () => configRoute.GET(request('http://localhost/api'), guildParams('guild-1')),
      () => rolesRoute.GET(request('http://localhost/api'), guildParams('guild-1')),
    ];

    for (const call of adminRoutes) {
      await expectSharedProxyFailures(call, mockAuthorizeGuildAdmin);
    }
  });
});
