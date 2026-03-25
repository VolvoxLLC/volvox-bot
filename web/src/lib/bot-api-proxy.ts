import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { getBotApiBaseUrl } from '@/lib/bot-api';
import { getMutualGuilds } from '@/lib/discord.server';
import { logger } from '@/lib/logger';

const REQUEST_TIMEOUT_MS = 10_000;
const ADMINISTRATOR_PERMISSION = 0x8n;
const MANAGE_GUILD_PERMISSION = 0x20n;
const KICK_MEMBERS_PERMISSION = 0x2n;
const BAN_MEMBERS_PERMISSION = 0x4n;
const MODERATE_MEMBERS_PERMISSION = 0x10000000000n;

export type GuildAccessLevel = 'viewer' | 'moderator' | 'admin' | 'bot-owner';
type RequiredGuildAccess = 'moderator' | 'admin';
type AuthToken = {
  accessToken: string;
  id?: string;
  sub?: string;
};
const GUILD_ACCESS_LEVELS = new Set<GuildAccessLevel>([
  'viewer',
  'moderator',
  'admin',
  'bot-owner',
]);

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

export function hasModeratorPermission(permissions: string): boolean {
  try {
    const bitfield = BigInt(permissions);
    return (
      (bitfield & MANAGE_GUILD_PERMISSION) === MANAGE_GUILD_PERMISSION ||
      (bitfield & KICK_MEMBERS_PERMISSION) === KICK_MEMBERS_PERMISSION ||
      (bitfield & BAN_MEMBERS_PERMISSION) === BAN_MEMBERS_PERMISSION ||
      (bitfield & MODERATE_MEMBERS_PERMISSION) === MODERATE_MEMBERS_PERMISSION
    );
  } catch {
    return false;
  }
}

function accessSatisfiesRequirement(
  access: GuildAccessLevel,
  required: RequiredGuildAccess,
): boolean {
  if (access === 'bot-owner' || access === 'admin') return true;
  return required === 'moderator' && access === 'moderator';
}

function getFallbackGuildAccess(guild: { owner?: boolean; permissions: string }): GuildAccessLevel {
  if (guild.owner) return 'admin';
  if (hasAdministratorPermission(guild.permissions)) return 'admin';
  if (hasModeratorPermission(guild.permissions)) return 'moderator';
  return 'viewer';
}

async function resolveGuildAccess(
  token: AuthToken,
  guildId: string,
  logPrefix: string,
  signal: AbortSignal,
): Promise<{ access: GuildAccessLevel; present: boolean }> {
  const mutualGuilds = await getMutualGuilds(token.accessToken, signal);
  const targetGuild = mutualGuilds.find((guild) => guild.id === guildId);

  if (!targetGuild) {
    return { access: 'viewer', present: false };
  }

  const fallbackAccess = getFallbackGuildAccess(targetGuild);
  const userId =
    typeof token.id === 'string' ? token.id : typeof token.sub === 'string' ? token.sub : '';
  const botApiBaseUrl = getBotApiBaseUrl();
  const botApiSecret = process.env.BOT_API_SECRET;

  if (!userId || !botApiBaseUrl || !botApiSecret) {
    return { access: fallbackAccess, present: true };
  }

  try {
    const url = new URL(`${botApiBaseUrl}/guilds/access`);
    url.searchParams.set('userId', userId);
    url.searchParams.set('guildIds', guildId);

    const response = await fetch(url.toString(), {
      headers: {
        'x-api-secret': botApiSecret,
      },
      signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      return { access: fallbackAccess, present: true };
    }

    const entries: unknown = await response.json();
    if (!Array.isArray(entries)) {
      return { access: fallbackAccess, present: true };
    }

    const entry = entries.find(
      (item): item is { id: string; access: GuildAccessLevel } =>
        typeof item === 'object' &&
        item !== null &&
        (item as { id?: unknown }).id === guildId &&
        typeof (item as { access?: unknown }).access === 'string' &&
        GUILD_ACCESS_LEVELS.has((item as { access: GuildAccessLevel }).access),
    );

    return { access: entry?.access ?? fallbackAccess, present: true };
  } catch (error) {
    logger.error(`${logPrefix} Failed to resolve guild access:`, error);
    return { access: fallbackAccess, present: true };
  }
}

async function authorizeGuildAccess(
  request: NextRequest,
  guildId: string,
  logPrefix: string,
  requiredAccess: RequiredGuildAccess,
): Promise<NextResponse | null> {
  const token = await getToken({ req: request });

  if (typeof token?.accessToken !== 'string' || token.accessToken.length === 0) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (token.error === 'RefreshTokenError') {
    return NextResponse.json({ error: 'Token expired. Please sign in again.' }, { status: 401 });
  }

  const authToken: AuthToken = {
    accessToken: token.accessToken,
    id: typeof token.id === 'string' ? token.id : undefined,
    sub: typeof token.sub === 'string' ? token.sub : undefined,
  };

  let resolved: Awaited<ReturnType<typeof resolveGuildAccess>>;
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new DOMException('Timed out', 'TimeoutError'));
  }, REQUEST_TIMEOUT_MS);
  try {
    resolved = await resolveGuildAccess(authToken, guildId, logPrefix, controller.signal);
  } catch (error) {
    logger.error(`${logPrefix} Failed to verify guild permissions:`, error);
    return NextResponse.json({ error: 'Failed to verify guild permissions' }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }

  if (!resolved.present || !accessSatisfiesRequirement(resolved.access, requiredAccess)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return null;
}

/**
 * Verify that the incoming request is from the owner or an administrator of the specified guild.
 *
 * @param request - The incoming NextRequest containing the user's session/token.
 * @param guildId - The Discord guild ID to authorize against.
 * @param logPrefix - Prefix used when logging contextual error messages.
 * @returns `null` if the requester is authorized; a `NextResponse` containing an error JSON otherwise.
 *          Possible responses:
 *          - 401 Unauthorized when the access token is missing or expired.
 *          - 502 Bad Gateway when mutual guilds cannot be verified.
 *          - 403 Forbidden when the user is neither the guild owner nor has administrator permission.
 */
export async function authorizeGuildAdmin(
  request: NextRequest,
  guildId: string,
  logPrefix: string,
): Promise<NextResponse | null> {
  return authorizeGuildAccess(request, guildId, logPrefix, 'admin');
}

export async function authorizeGuildModerator(
  request: NextRequest,
  guildId: string,
  logPrefix: string,
): Promise<NextResponse | null> {
  return authorizeGuildAccess(request, guildId, logPrefix, 'moderator');
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
  /**
   * When set, the upstream fetch uses `next: { revalidate }` for ISR-style
   * caching in Next.js instead of the default `cache: 'no-store'`.
   * Pass `false` to opt out of revalidation explicitly (same as the default).
   */
  revalidate?: number | false;
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

    // Use ISR-style caching when a revalidation window is provided; otherwise
    // bypass the Next.js data cache entirely to ensure fresh data.
    const fetchInit: RequestInit =
      typeof options?.revalidate === 'number'
        ? {
            method: options?.method ?? 'GET',
            headers: mergedHeaders,
            body: options?.body,
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            next: { revalidate: options.revalidate },
          }
        : {
            method: options?.method ?? 'GET',
            headers: mergedHeaders,
            body: options?.body,
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            cache: 'no-store',
          };

    const response = await fetch(upstreamUrl.toString(), fetchInit);

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
