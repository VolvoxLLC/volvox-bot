import { describe, expect, it } from 'vitest';

import {
  expectCallsReturnStatus,
  expectProxiedRoutes,
  expectSharedProxyFailuresForCalls,
  guildParams,
  mockAuthorizeGuildAdmin,
  mockProxyToBotApi,
  proxyCases,
  request,
  setupProxyRouteMocks,
} from './helpers/proxy-route-test-helpers';

import * as conversationDetailRoute from '@/app/api/guilds/[guildId]/conversations/[conversationId]/route';
import * as conversationFlagRoute from '@/app/api/guilds/[guildId]/conversations/[conversationId]/flag/route';
import * as conversationFlagsRoute from '@/app/api/guilds/[guildId]/conversations/flags/route';
import * as conversationStatsRoute from '@/app/api/guilds/[guildId]/conversations/stats/route';
import * as conversationsRoute from '@/app/api/guilds/[guildId]/conversations/route';

describe('guild conversation proxy routes', () => {
  setupProxyRouteMocks();

  it('covers conversation proxy routes and query forwarding', async () => {
    const cases = proxyCases([
      {
        call: () => conversationsRoute.GET(request('http://localhost/api?search=ai&channel=chan-1&page=2'), guildParams()),
        path: '/guilds/guild%201/conversations',
        query: { search: 'ai', channel: 'chan-1', page: '2' },
      },
      {
        call: () => conversationDetailRoute.GET(request('http://localhost/api'), {
          params: Promise.resolve({ guildId: 'guild 1', conversationId: 'conversation 1' }),
        }),
        path: '/guilds/guild%201/conversations/conversation%201',
      },
      {
        call: () => conversationFlagsRoute.GET(request('http://localhost/api?page=3&status=open&ignored=x'), guildParams()),
        path: '/guilds/guild%201/conversations/flags',
        query: { page: '3', status: 'open' },
      },
      {
        call: () => conversationStatsRoute.GET(request('http://localhost/api?range=7d'), guildParams()),
        path: '/guilds/guild%201/conversations/stats',
      },
    ]);

    await expectProxiedRoutes(cases);
  });

  it('covers conversation flag JSON validation and proxy body', async () => {
    const response = await conversationFlagRoute.POST(
      request('http://localhost/api', {
        method: 'POST',
        body: JSON.stringify({ messageId: 'msg-1', reason: 'spam' }),
      }),
      { params: Promise.resolve({ guildId: 'guild 1', conversationId: 'conversation 1' }) },
    );

    expect(response.status).toBe(200);
    expect(mockProxyToBotApi.mock.calls.at(-1)?.[4]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ messageId: 'msg-1', reason: 'spam' }),
    });

    const invalid = await conversationFlagRoute.POST(
      request('http://localhost/api', { method: 'POST', body: '{' }),
      { params: Promise.resolve({ guildId: 'guild 1', conversationId: 'conversation 1' }) },
    );
    expect(invalid.status).toBe(400);
  });

  it('covers missing guild guards for conversation routes', async () => {
    const missingGuildCases = [
      () => conversationsRoute.GET(request('http://localhost/api'), guildParams('')),
      () => conversationDetailRoute.GET(request('http://localhost/api'), {
        params: Promise.resolve({ guildId: '', conversationId: 'conversation-1' }),
      }),
      () => conversationFlagRoute.POST(
        request('http://localhost/api', {
          method: 'POST',
          body: JSON.stringify({ messageId: 'msg-1' }),
        }),
        { params: Promise.resolve({ guildId: 'guild-1', conversationId: '' }) },
      ),
      () => conversationFlagsRoute.GET(request('http://localhost/api'), guildParams('')),
      () => conversationStatsRoute.GET(request('http://localhost/api'), guildParams('')),
    ];

    await expectCallsReturnStatus(missingGuildCases, 400);
  });

  it('returns auth, config, and upstream construction errors from conversation routes', async () => {
    const adminRoutes = [
      () => conversationsRoute.GET(request('http://localhost/api'), guildParams('guild-1')),
      () => conversationDetailRoute.GET(request('http://localhost/api'), {
        params: Promise.resolve({ guildId: 'guild-1', conversationId: 'conversation-1' }),
      }),
      () => conversationFlagRoute.POST(
        request('http://localhost/api', {
          method: 'POST',
          body: JSON.stringify({ messageId: 'msg-1' }),
        }),
        { params: Promise.resolve({ guildId: 'guild-1', conversationId: 'conversation-1' }) },
      ),
      () => conversationFlagsRoute.GET(request('http://localhost/api'), guildParams('guild-1')),
      () => conversationStatsRoute.GET(request('http://localhost/api'), guildParams('guild-1')),
    ];

    await expectSharedProxyFailuresForCalls(adminRoutes, mockAuthorizeGuildAdmin);
  });

  it('returns early for missing conversation detail identifiers', async () => {
    const missing = await conversationDetailRoute.GET(request('http://localhost/api'), {
      params: Promise.resolve({ guildId: '', conversationId: 'conversation-1' }),
    });
    expect(missing.status).toBe(400);
  });
});
