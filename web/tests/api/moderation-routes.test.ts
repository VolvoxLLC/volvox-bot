import { describe, expect, it } from 'vitest';

import {
  expectJson,
  expectProxiedRoutes,
  expectSharedProxyFailures,
  mockAuthorizeGuildModerator,
  proxyCases,
  request,
  setupProxyRouteMocks,
} from './helpers/proxy-route-test-helpers';

import * as moderationCaseDetailRoute from '@/app/api/moderation/cases/[id]/route';
import * as moderationCasesRoute from '@/app/api/moderation/cases/route';
import * as moderationStatsRoute from '@/app/api/moderation/stats/route';
import * as userHistoryRoute from '@/app/api/moderation/user/[userId]/history/route';

describe('moderation proxy routes', () => {
  setupProxyRouteMocks();

  it('covers moderation proxy routes with required guild validation', async () => {
    const missingGuild = await moderationCasesRoute.GET(request('http://localhost/api'));
    expect(missingGuild.status).toBe(400);
    await expectJson(missingGuild, { error: 'guildId is required' });

    const cases = proxyCases([
      {
        call: () => moderationCasesRoute.GET(request('http://localhost/api?guildId=guild-1&targetId=user-1&action=ban&page=2&ignored=x')),
        path: '/moderation/cases',
        query: { guildId: 'guild-1', targetId: 'user-1', action: 'ban', page: '2' },
      },
      {
        call: () => moderationCaseDetailRoute.GET(request('http://localhost/api?guildId=guild-1'), {
          params: Promise.resolve({ id: 'case-1' }),
        }),
        path: '/moderation/cases/case-1',
        query: { guildId: 'guild-1' },
      },
      {
        call: () => moderationStatsRoute.GET(request('http://localhost/api?guildId=guild-1')),
        path: '/moderation/stats',
        query: { guildId: 'guild-1' },
      },
      {
        call: () => userHistoryRoute.GET(request('http://localhost/api?guildId=guild-1&page=2'), {
          params: Promise.resolve({ userId: 'user-1' }),
        }),
        path: '/moderation/user/user-1/history',
        query: { guildId: 'guild-1', page: '2' },
      },
    ]);

    await expectProxiedRoutes(cases);
  });

  it('covers missing guild guards for moderation routes', async () => {
    const missingGuildCases = [
      () => moderationCaseDetailRoute.GET(request('http://localhost/api'), {
        params: Promise.resolve({ id: 'case-1' }),
      }),
      () => moderationStatsRoute.GET(request('http://localhost/api')),
      () => userHistoryRoute.GET(request('http://localhost/api'), {
        params: Promise.resolve({ userId: 'user-1' }),
      }),
    ];

    for (const call of missingGuildCases) {
      const response = await call();
      expect(response.status).toBe(400);
    }
  });

  it('returns auth, config, and upstream construction errors from moderation routes', async () => {
    const moderatorRoutes = [
      () => moderationCasesRoute.GET(request('http://localhost/api?guildId=guild-1')),
      () => moderationCaseDetailRoute.GET(request('http://localhost/api?guildId=guild-1'), {
        params: Promise.resolve({ id: 'case-1' }),
      }),
      () => moderationStatsRoute.GET(request('http://localhost/api?guildId=guild-1')),
      () => userHistoryRoute.GET(request('http://localhost/api?guildId=guild-1'), {
        params: Promise.resolve({ userId: 'user-1' }),
      }),
    ];

    for (const call of moderatorRoutes) {
      await expectSharedProxyFailures(call, mockAuthorizeGuildModerator);
    }
  });
});
