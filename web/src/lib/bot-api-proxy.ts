import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { getBotApiBaseUrl } from "@/lib/bot-api";
import { getMutualGuilds } from "@/lib/discord.server";
import { logger } from "@/lib/logger";

const REQUEST_TIMEOUT_MS = 10_000;
const ADMINISTRATOR_PERMISSION = 0x8n;

export function hasAdministratorPermission(permissions: string): boolean {
  try {
    return (BigInt(permissions) & ADMINISTRATOR_PERMISSION) === ADMINISTRATOR_PERMISSION;
  } catch {
    return false;
  }
}

/**
 * Authorize that the request comes from an admin of the given guild.
 * Returns null on success, or a NextResponse error to short-circuit.
 */
export async function authorizeGuildAdmin(
  request: NextRequest,
  guildId: string,
  logPrefix: string,
): Promise<NextResponse | null> {
  const token = await getToken({ req: request });

  if (typeof token?.accessToken !== "string" || token.accessToken.length === 0) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (token.error === "RefreshTokenError") {
    return NextResponse.json(
      { error: "Token expired. Please sign in again." },
      { status: 401 },
    );
  }

  let mutualGuilds: Awaited<ReturnType<typeof getMutualGuilds>>;
  try {
    mutualGuilds = await getMutualGuilds(
      token.accessToken,
      AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    );
  } catch (error) {
    logger.error(
      `${logPrefix} Failed to verify guild permissions:`,
      error,
    );
    return NextResponse.json(
      { error: "Failed to verify guild permissions" },
      { status: 502 },
    );
  }

  const targetGuild = mutualGuilds.find((guild) => guild.id === guildId);
  if (
    !targetGuild ||
    !(targetGuild.owner || hasAdministratorPermission(targetGuild.permissions))
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return null; // authorized
}

interface BotApiConfig {
  baseUrl: string;
  secret: string;
}

/**
 * Resolve the bot API base URL and secret from env vars.
 * Returns the config on success, or a NextResponse error to short-circuit.
 */
export function getBotApiConfig(logPrefix: string): BotApiConfig | NextResponse {
  const botApiBaseUrl = getBotApiBaseUrl();
  const botApiSecret = process.env.BOT_API_SECRET;

  if (!botApiBaseUrl || !botApiSecret) {
    logger.error(`${logPrefix} BOT_API_URL and BOT_API_SECRET are required`);
    return NextResponse.json(
      { error: "Bot API is not configured" },
      { status: 500 },
    );
  }

  return { baseUrl: botApiBaseUrl, secret: botApiSecret };
}

/**
 * Build a validated upstream URL for the bot API.
 * Returns the URL on success, or a NextResponse error to short-circuit.
 */
export function buildUpstreamUrl(
  baseUrl: string,
  path: string,
  logPrefix: string,
): URL | NextResponse {
  try {
    return new URL(`${baseUrl}${path}`);
  } catch {
    logger.error(`${logPrefix} Invalid BOT_API_URL`, { baseUrl });
    return NextResponse.json(
      { error: "Bot API is not configured correctly" },
      { status: 500 },
    );
  }
}

interface ProxyOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

/**
 * Proxy a request to the bot API and return the response as NextResponse.
 */
export async function proxyToBotApi(
  upstreamUrl: URL,
  secret: string,
  logPrefix: string,
  errorMessage: string,
  options?: ProxyOptions,
): Promise<NextResponse> {
  try {
    const response = await fetch(upstreamUrl.toString(), {
      method: options?.method ?? "GET",
      headers: {
        "x-api-secret": secret,
        ...options?.headers,
      },
      body: options?.body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data: unknown = await response.json();
      return NextResponse.json(data, { status: response.status });
    }

    const text = await response.text();
    return NextResponse.json(
      { error: text || "Unexpected response from bot API" },
      { status: response.status },
    );
  } catch (error) {
    logger.error(`${logPrefix} ${errorMessage}:`, error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 },
    );
  }
}
