import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { getBotApiBaseUrl } from '@/lib/bot-api';
import { permissionsToDashboardRole } from '@/lib/dashboard-roles';
import { getMutualGuilds } from '@/lib/discord.server';
import { logger } from '@/lib/logger';

const REQUEST_TIMEOUT_MS = 10_000;
const ADMINISTRATOR_PERMISSION = 0x8n;

/**
 * Determines whether a Discord permission bitfield includes the administrator permission.
 *
 * @param permissions - The permission bitfield as a decimal string
 * @returns `true` if the administrator permission bit is present, `false` otherwise
 */
export function hasAdministratorPermission(permissions: string): boolean {
  try {
    return (BigInt(permissions) & ADMINISTRATOR_PERMISSION) === ADMINISTRATOR_PERMISSION;
  } catch {
    return false;
  }
}

export type GuildMinRole = 'viewer' | 'moderator' | 'admin';

const ROLE_ORDER: Record<GuildMinRole, number> = {
  viewer: 0,
  moderator: 1,
  admin: 2,
};

function roleFromGuild(guild: {
  access?: string;
  owner?: boolean;
  permissions: string;
}): GuildMinRole | null {
  if (guild.owner) return 'admin';
  const access = guild.access;
  if (access === 'owner' || access === 'admin') return 'admin';
  if (access === 'moderator') return 'moderator';
  if (access === 'viewer') return 'viewer';
  // When access not set (e.g. bot unavailable), derive from Discord permissions
  const derived = permissionsToDashboardRole(guild.permissions);
  if (derived === 'admin' || derived === 'owner') return 'admin';
  if (derived === 'moderator') return 'moderator';
  if (derived === 'viewer') return 'viewer';
  return null;
}

/**
 * Verify that the incoming request has at least the required dashboard role for the guild.
 */
export async function authorizeGuildRole(
  request: NextRequest,
  guildId: string,
  minRole: GuildMinRole,
  logPrefix: string,
): Promise<NextResponse | null> {
  const token = await getToken({ req: request });

  if (typeof token?.accessToken !== 'string' || token.accessToken.length === 0) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (token.error === 'RefreshTokenError') {
    return NextResponse.json({ error: 'Token expired. Please sign in again.' }, { status: 401 });
  }

  let mutualGuilds: Awaited<ReturnType<typeof getMutualGuilds>>;
  try {
    mutualGuilds = await getMutualGuilds(
      token.accessToken,
      AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    );
  } catch (error) {
    logger.error(`${logPrefix} Failed to verify guild permissions:`, error);
    return NextResponse.json({ error: 'Failed to verify guild permissions' }, { status: 502 });
  }

  const targetGuild = mutualGuilds.find((g) => g.id === guildId);
  const role = targetGuild ? roleFromGuild(targetGuild) : null;
  if (role === null) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (ROLE_ORDER[role] < ROLE_ORDER[minRole]) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return null;
}

/**
 * Verify that the incoming request is from the owner or an administrator of the specified guild.
 * Equivalent to authorizeGuildRole(..., 'admin', ...).
 */
export async function authorizeGuildAdmin(
  request: NextRequest,
  guildId: string,
  logPrefix: string,
): Promise<NextResponse | null> {
  return authorizeGuildRole(request, guildId, 'admin', logPrefix);
}

export interface BotApiConfig {
  baseUrl: string;
  secret: string;
}

/**
 * Resolve the bot API base URL and secret from environment and validate configuration.
 *
 * @param logPrefix - Prefix used in logs to provide contextual information
 * @returns A `BotApiConfig` containing `baseUrl` and `secret` when configured, otherwise a `NextResponse` with a 500 status indicating the Bot API is not configured
 */
export function getBotApiConfig(logPrefix: string): BotApiConfig | NextResponse {
  const botApiBaseUrl = getBotApiBaseUrl();
  const botApiSecret = process.env.BOT_API_SECRET;

  if (!botApiBaseUrl || !botApiSecret) {
    logger.error(`${logPrefix} BOT_API_URL and BOT_API_SECRET are required`);
    return NextResponse.json({ error: 'Bot API is not configured' }, { status: 500 });
  }

  return { baseUrl: botApiBaseUrl, secret: botApiSecret };
}

/**
 * Constructs and validates an upstream URL for the bot API.
 *
 * @param logPrefix - Prefix used when logging errors for context
 * @returns A `URL` for the resolved upstream endpoint, or a `NextResponse` containing a 500 error if the URL cannot be constructed
 */
export function buildUpstreamUrl(
  baseUrl: string,
  path: string,
  logPrefix: string,
): URL | NextResponse {
  try {
    const normalizedBase = baseUrl.replace(/\/+$/, '');
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return new URL(`${normalizedBase}${normalizedPath}`);
  } catch {
    logger.error(`${logPrefix} Invalid BOT_API_URL`, { baseUrl });
    return NextResponse.json({ error: 'Bot API is not configured correctly' }, { status: 500 });
  }
}

export interface ProxyOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

/**
 * Send a request to the bot API and return its response as a NextResponse.
 *
 * If the upstream response has a JSON content type the JSON is returned with the upstream status.
 * For non-JSON responses the body text is returned inside an `{ error: string }` JSON object with the upstream status.
 * On network or unexpected errors the provided `errorMessage` is logged and a 500 JSON response containing `{ error: errorMessage }` is returned.
 *
 * @param upstreamUrl - Fully constructed URL of the bot API endpoint to call
 * @param secret - Shared secret added as the `x-api-secret` header for authentication
 * @param logPrefix - Prefix used when logging errors for context
 * @param errorMessage - Message used for the returned error JSON and log on failure
 * @param options - Optional request options (method, headers, body)
 * @returns A NextResponse containing either the upstream JSON payload (with the upstream status) or an error JSON object; returns status 500 on internal failure
 */
export async function proxyToBotApi(
  upstreamUrl: URL,
  secret: string,
  logPrefix: string,
  errorMessage: string,
  options?: ProxyOptions,
): Promise<NextResponse> {
  try {
    // Spread caller headers first, then force the auth secret last so it
    // can never be overridden by values smuggled through options.headers.
    const mergedHeaders: Record<string, string> = {
      ...options?.headers,
      'x-api-secret': secret,
    };
    const response = await fetch(upstreamUrl.toString(), {
      method: options?.method ?? 'GET',
      headers: mergedHeaders,
      body: options?.body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    });

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data: unknown = await response.json();
      return NextResponse.json(data, { status: response.status });
    }

    const text = await response.text();
    return NextResponse.json(
      { error: text || 'Unexpected response from bot API' },
      { status: response.status },
    );
  } catch (error) {
    if ((error as Error).name === 'AbortError' || (error as Error).name === 'TimeoutError') {
      logger.error(`${logPrefix} ${errorMessage}: request timed out`);
      return NextResponse.json({ error: errorMessage }, { status: 504 });
    }
    logger.error(`${logPrefix} ${errorMessage}:`, error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
