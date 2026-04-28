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

/**
 * Remove trailing '/' characters from the given string.
 *
 * @param value - The input string to trim
 * @returns The input string without any trailing '/' characters
 */
function trimTrailingSlashes(value: string) {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) {
    end -= 1;
  }
  return value.slice(0, end);
}

/**
 * Ensures the given path begins with a leading slash.
 *
 * @param path - The path to normalize; may or may not start with `/`.
 * @returns The input path, prefixed with `/` if it did not already start with one.
 */
function normalizePath(path: string) {
  return path.startsWith('/') ? path : `/${path}`;
}

/**
 * Constructs a URL by combining a base API URL with a request path.
 *
 * @param baseUrl - The base URL (may include trailing slashes)
 * @param path - The request path (may be missing a leading slash)
 * @returns A URL representing `trimTrailingSlashes(baseUrl)` joined with `normalizePath(path)`
 */
function buildTestUpstreamUrl(baseUrl: string, path: string) {
  return new URL(`${trimTrailingSlashes(baseUrl)}${normalizePath(path)}`);
}

/**
 * Compute the base-path prefix extracted from apiConfig.baseUrl.
 *
 * @returns The base path prefix: an empty string when the base URL's pathname is "/", otherwise the pathname with trailing slashes removed.
 */
function basePathPrefix() {
  const pathname = new URL(apiConfig.baseUrl).pathname;
  return pathname === '/' ? '' : trimTrailingSlashes(pathname);
}

/**
 * Asserts that an upstream URL's pathname matches the expected path, including the API base-path prefix.
 *
 * @param upstream - The upstream URL whose pathname will be checked
 * @param expectedPath - The expected path (relative to the API base path)
 */
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

/**
 * Create a route params object for a guild identifier.
 *
 * @param guildId - The guild id to include in the params (defaults to `'guild 1'`).
 * @returns An object with a `params` Promise that resolves to `{ guildId }`
 */
export function guildParams(guildId = 'guild 1') {
  return { params: Promise.resolve({ guildId }) };
}

/**
 * Asserts that the given Response's JSON body is deeply equal to the expected value.
 *
 * @param response - The Response whose JSON body will be parsed and compared
 * @param expected - The expected value to compare against the parsed JSON
 */
export async function expectJson(response: Response, expected: unknown) {
  await expect(response.json()).resolves.toEqual(expected);
}

export type ProxyRouteCase = {
  call: () => Promise<Response>;
  path: string;
  query?: Record<string, string>;
};

/**
 * Asserts that the URL's query string contains the provided keys with the specified values.
 *
 * @param url - The URL whose search parameters will be checked
 * @param expected - An object mapping query parameter names to their expected values
 */
export function expectSearchParams(url: URL, expected: Record<string, string>) {
  for (const [key, value] of Object.entries(expected)) {
    expect(url.searchParams.get(key)).toBe(value);
  }
}

/**
 * Runs a proxied-route test case and asserts the route responded with HTTP 200 and targeted the expected upstream pathname and query parameters.
 *
 * @param routeCase - Test case containing `call` (executes the route), `path` (expected upstream pathname), and optional `query` (expected upstream query parameters)
 */
export async function expectProxiedRoute(routeCase: ProxyRouteCase) {
  mockProxyToBotApi.mockClear();
  const response = await routeCase.call();
  expect(response.status).toBe(200);
  const upstream = mockProxyToBotApi.mock.calls.at(-1)?.[0] as URL;
  expectUpstreamPath(upstream, routeCase.path);
  expectSearchParams(upstream, routeCase.query ?? {});
}

/**
 * Run proxied-route assertions for each provided test case.
 *
 * @param cases - An array of test cases where each case provides a `call` function to execute, the expected upstream `path`, and optional `query` parameters; each case is executed and its proxied-route assertions are performed.
 */
export async function expectProxiedRoutes(cases: readonly ProxyRouteCase[]) {
  for (const routeCase of cases) {
    await expectProxiedRoute(routeCase);
  }
}

/**
 * Wraps and returns an array of proxy route test cases.
 *
 * @param cases - The proxy route test cases to return unchanged
 * @returns The same `cases` array passed in
 */
export function proxyCases(cases: readonly ProxyRouteCase[]): readonly ProxyRouteCase[] {
  return cases;
}

/**
 * Verifies a route call produces the shared proxy failure responses in sequence.
 *
 * When `authorizeMock` is provided, asserts the call first resolves to a 403 Forbidden next-auth response.
 * Then asserts the call resolves to a 500 "Missing config" response produced by the bot API config lookup,
 * and finally asserts the call resolves to a 500 "Bad upstream" response produced by upstream URL building.
 *
 * @param call - A function that invokes the route and returns a Response
 * @param authorizeMock - Optional authorization mock to test the 403 Forbidden failure path
 */
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

/**
 * Asserts that each provided call resolves to a Response with the given HTTP status.
 *
 * Awaits each call in sequence and checks that `response.status` strictly equals `status`.
 *
 * @param calls - An array of functions that each return a Promise resolving to a `Response`
 * @param status - The expected HTTP status code for every response
 */
export async function expectCallsReturnStatus(
  calls: readonly (() => Promise<Response>)[],
  status: number,
) {
  for (const call of calls) {
    const response = await call();
    expect(response.status).toBe(status);
  }
}

/**
 * Applies the shared proxy failure assertions to every provided call.
 *
 * @param calls - Array of functions that execute a proxied route and return a `Response`
 * @param authorizeMock - Optional authorization mock used to simulate an authorization failure for each call
 */
export async function expectSharedProxyFailuresForCalls(
  calls: readonly (() => Promise<Response>)[],
  authorizeMock?: typeof mockAuthorizeGuildAdmin,
) {
  for (const call of calls) {
    await expectSharedProxyFailures(call, authorizeMock);
  }
}

/**
 * Installs a beforeEach hook that resets and configures common mocks used by proxy-route tests.
 *
 * The hook clears all mocks and sets default return values and implementations for authorization,
 * bot API config and base URL retrieval, token retrieval, upstream URL construction, the proxy call,
 * and stubs global fetch to return a deterministic CSV response.
 */
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
