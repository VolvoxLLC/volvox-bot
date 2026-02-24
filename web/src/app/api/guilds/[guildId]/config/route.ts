import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { getBotApiBaseUrl } from "@/lib/bot-api";
import { getMutualGuilds } from "@/lib/discord.server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const REQUEST_TIMEOUT_MS = 10_000;
const ADMINISTRATOR_PERMISSION = 0x8n;

function hasAdministratorPermission(permissions: string): boolean {
  try {
    return (BigInt(permissions) & ADMINISTRATOR_PERMISSION) === ADMINISTRATOR_PERMISSION;
  } catch {
    return false;
  }
}

async function authorizeGuildAdmin(
  request: NextRequest,
  guildId: string,
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
    logger.error("[api/guilds/:guildId/config] Failed to verify guild permissions:", error);
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

function getBotApiConfig(): { baseUrl: string; secret: string } | NextResponse {
  const botApiBaseUrl = getBotApiBaseUrl();
  const botApiSecret = process.env.BOT_API_SECRET;

  if (!botApiBaseUrl || !botApiSecret) {
    logger.error("[api/guilds/:guildId/config] BOT_API_URL and BOT_API_SECRET are required");
    return NextResponse.json(
      { error: "Bot API is not configured" },
      { status: 500 },
    );
  }

  return { baseUrl: botApiBaseUrl, secret: botApiSecret };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> | { guildId: string } },
) {
  const { guildId } = await params;
  if (!guildId) {
    return NextResponse.json({ error: "Missing guildId" }, { status: 400 });
  }

  const authError = await authorizeGuildAdmin(request, guildId);
  if (authError) return authError;

  const apiConfig = getBotApiConfig();
  if (apiConfig instanceof NextResponse) return apiConfig;

  let upstreamUrl: URL;
  try {
    upstreamUrl = new URL(
      `${apiConfig.baseUrl}/guilds/${encodeURIComponent(guildId)}/config`,
    );
  } catch {
    logger.error("[api/guilds/:guildId/config] Invalid BOT_API_URL");
    return NextResponse.json(
      { error: "Bot API is not configured correctly" },
      { status: 500 },
    );
  }

  try {
    const response = await fetch(upstreamUrl.toString(), {
      headers: { "x-api-secret": apiConfig.secret },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });

    const data: unknown = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    logger.error("[api/guilds/:guildId/config] Failed to fetch config:", error);
    return NextResponse.json(
      { error: "Failed to fetch config" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> | { guildId: string } },
) {
  const { guildId } = await params;
  if (!guildId) {
    return NextResponse.json({ error: "Missing guildId" }, { status: 400 });
  }

  const authError = await authorizeGuildAdmin(request, guildId);
  if (authError) return authError;

  const apiConfig = getBotApiConfig();
  if (apiConfig instanceof NextResponse) return apiConfig;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let upstreamUrl: URL;
  try {
    upstreamUrl = new URL(
      `${apiConfig.baseUrl}/guilds/${encodeURIComponent(guildId)}/config`,
    );
  } catch {
    logger.error("[api/guilds/:guildId/config] Invalid BOT_API_URL");
    return NextResponse.json(
      { error: "Bot API is not configured correctly" },
      { status: 500 },
    );
  }

  try {
    const response = await fetch(upstreamUrl.toString(), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-api-secret": apiConfig.secret,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });

    const data: unknown = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    logger.error("[api/guilds/:guildId/config] Failed to update config:", error);
    return NextResponse.json(
      { error: "Failed to update config" },
      { status: 500 },
    );
  }
}
