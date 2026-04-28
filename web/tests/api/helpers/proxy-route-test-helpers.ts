import { beforeEach, expect, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  mockAuthorizeGuildAdmin: vi.fn(),
  mockAuthorizeGuildModerator: vi.fn(),
  mockBuildUpstreamUrl: vi.fn(),
  mockGetBotApiBaseUrl: vi.fn(),
  mockGetBotApiConfig: vi.fn(),
  mockGetToken: vi.fn(),
  mockProxyToBotApi: vi.fn(),
}));

export const mockAuthorizeGuildAdmin = mocks.mockAuthorizeGuildAdmin;
export const mockAuthorizeGuildModerator = mocks.mockAuthorizeGuildModerator;
export const mockBuildUpstreamUrl = mocks.mockBuildUpstreamUrl;
export const mockGetBotApiBaseUrl = mocks.mockGetBotApiBaseUrl;
export const mockGetBotApiConfig = mocks.mockGetBotApiConfig;
export const mockGetToken = mocks.mockGetToken;
export const mockProxyToBotApi = mocks.mockProxyToBotApi;

vi.mock('@/lib/bot-api-proxy', () => ({
  authorizeGuildAdmin: mocks.mockAuthorizeGuildAdmin,
  authorizeGuildModerator: mocks.mockAuthorizeGuildModerator,
  buildUpstreamUrl: mocks.mockBuildUpstreamUrl,
  getBotApiConfig: mocks.mockGetBotApiConfig,
  proxyToBotApi: mocks.mockProxyToBotApi,
}));

vi.mock('@/lib/bot-api', () => ({
  getBotApiBaseUrl: mocks.mockGetBotApiBaseUrl,
}));

vi.mock('next-auth/jwt', () => ({
  getToken: mocks.mockGetToken,
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

export const apiConfig = {
  baseUrl: 'https://bot.internal:3001/api/v1',
  secret: 'bot-secret',
};

function trimTrailingSlashes(value: string) {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) {
    end -= 1;
  }
  return value.slice(0, end);
}

function normalizePath(path: string) {
  return path.startsWith('/') ? path : `/${path}`;
}

function buildTestUpstreamUrl(baseUrl: string, path: string) {
  return new URL(`${trimTrailingSlashes(baseUrl)}${normalizePath(path)}`);
}

function basePathPrefix() {
  const pathname = new URL(apiConfig.baseUrl).pathname;
  return pathname === '/' ? '' : trimTrailingSlashes(pathname);
}

export function expectUpstreamPath(upstream: URL, expectedPath: string) {
  expect(upstream.pathname).toBe(`${basePathPrefix()}${normalizePath(expectedPath)}`);
}

/**
 * Build a NextRequest for route tests.
 *
 * Relative test paths are resolved against http://localhost so callers can pass
 * either `/api/...` paths or fully-qualified absolute URLs.
 */
export function request(url: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(new URL(url, 'http://localhost'), init);
}

export function guildParams(guildId = 'guild 1') {
  return { params: Promise.resolve({ guildId }) };
}

export async function expectJson(response: Response, expected: unknown) {
  await expect(response.json()).resolves.toEqual(expected);
}

export type ProxyRouteCase = {
  call: () => Promise<Response>;
  path: string;
  query?: Record<string, string>;
};

export function expectSearchParams(url: URL, expected: Record<string, string>) {
  for (const [key, value] of Object.entries(expected)) {
    expect(url.searchParams.get(key)).toBe(value);
  }
}

export async function expectProxiedRoute(routeCase: ProxyRouteCase) {
  mockProxyToBotApi.mockClear();
  const response = await routeCase.call();
  expect(response.status).toBe(200);
  const upstream = mockProxyToBotApi.mock.calls.at(-1)?.[0] as URL;
  expectUpstreamPath(upstream, routeCase.path);
  expectSearchParams(upstream, routeCase.query ?? {});
}

export async function expectProxiedRoutes(cases: readonly ProxyRouteCase[]) {
  for (const routeCase of cases) {
    await expectProxiedRoute(routeCase);
  }
}

export function proxyCases(cases: readonly ProxyRouteCase[]): readonly ProxyRouteCase[] {
  return cases;
}

export async function expectSharedProxyFailures(
  call: () => Promise<Response>,
  authorizeMock?: typeof mockAuthorizeGuildAdmin,
) {
  if (authorizeMock) {
    const authResponse = NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    authorizeMock.mockResolvedValueOnce(authResponse);
    await expect(call()).resolves.toBe(authResponse);
  }

  const configResponse = NextResponse.json({ error: 'Missing config' }, { status: 500 });
  mockGetBotApiConfig.mockReturnValueOnce(configResponse);
  await expect(call()).resolves.toBe(configResponse);

  const upstreamResponse = NextResponse.json({ error: 'Bad upstream' }, { status: 500 });
  mockBuildUpstreamUrl.mockReturnValueOnce(upstreamResponse);
  await expect(call()).resolves.toBe(upstreamResponse);
}

export async function expectCallsReturnStatus(
  calls: readonly (() => Promise<Response>)[],
  status: number,
) {
  for (const call of calls) {
    const response = await call();
    expect(response.status).toBe(status);
  }
}

export async function expectSharedProxyFailuresForCalls(
  calls: readonly (() => Promise<Response>)[],
  authorizeMock?: typeof mockAuthorizeGuildAdmin,
) {
  for (const call of calls) {
    await expectSharedProxyFailures(call, authorizeMock);
  }
}

export function setupProxyRouteMocks() {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthorizeGuildAdmin.mockResolvedValue(null);
    mockAuthorizeGuildModerator.mockResolvedValue(null);
    mockGetBotApiConfig.mockReturnValue(apiConfig);
    mockGetBotApiBaseUrl.mockReturnValue(apiConfig.baseUrl);
    mockGetToken.mockResolvedValue({ accessToken: 'access-token' });
    mockBuildUpstreamUrl.mockImplementation(buildTestUpstreamUrl);
    mockProxyToBotApi.mockResolvedValue(NextResponse.json({ ok: true }));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('id,name\n1,Ada\n', {
        status: 200,
        headers: { 'Content-Type': 'text/csv' },
      }),
    );
  });
}
