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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> | { guildId: string } },
) {
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

  const { guildId } = await params;
  if (!guildId) {
    return NextResponse.json({ error: "Missing guildId" }, { status: 400 });
  }

  let mutualGuilds: Awaited<ReturnType<typeof getMutualGuilds>>;
  try {
    mutualGuilds = await getMutualGuilds(
      token.accessToken,
      AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    );
  } catch (error) {
    logger.error(
      "[api/guilds/:guildId/channels] Failed to verify guild permissions:",
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

  const botApiBaseUrl = getBotApiBaseUrl();
  const botApiSecret = process.env.BOT_API_SECRET;

  if (!botApiBaseUrl || !botApiSecret) {
    logger.error(
      "[api/guilds/:guildId/channels] BOT_API_URL and BOT_API_SECRET are required",
    );
    return NextResponse.json(
      { error: "Bot API is not configured" },
      { status: 500 },
    );
  }

  let upstreamUrl: URL;
  try {
    upstreamUrl = new URL(
      `${botApiBaseUrl}/guilds/${encodeURIComponent(guildId)}/channels`,
    );
  } catch {
    logger.error("[api/guilds/:guildId/channels] Invalid BOT_API_URL", {
      botApiBaseUrl,
    });
    return NextResponse.json(
      { error: "Bot API is not configured correctly" },
      { status: 500 },
    );
  }

  try {
    const response = await fetch(upstreamUrl.toString(), {
      headers: { "x-api-secret": botApiSecret },
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
    logger.error("[api/guilds/:guildId/channels] Failed to proxy channels:", error);
    return NextResponse.json(
      { error: "Failed to fetch channels" },
      { status: 500 },
    );
  }
}
