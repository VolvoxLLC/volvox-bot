import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  authorizeGuildAdmin,
  getBotApiConfig,
  buildUpstreamUrl,
  proxyToBotApi,
} from "@/lib/bot-api-proxy";

export const dynamic = "force-dynamic";

const LOG_PREFIX = "[api/guilds/:guildId/config]";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> | { guildId: string } },
) {
  const { guildId } = await params;
  if (!guildId) {
    return NextResponse.json({ error: "Missing guildId" }, { status: 400 });
  }

  const authError = await authorizeGuildAdmin(request, guildId, LOG_PREFIX);
  if (authError) return authError;

  const apiConfig = getBotApiConfig(LOG_PREFIX);
  if (apiConfig instanceof NextResponse) return apiConfig;

  const upstreamUrl = buildUpstreamUrl(
    apiConfig.baseUrl,
    `/guilds/${encodeURIComponent(guildId)}/config`,
    LOG_PREFIX,
  );
  if (upstreamUrl instanceof NextResponse) return upstreamUrl;

  return proxyToBotApi(upstreamUrl, apiConfig.secret, LOG_PREFIX, "Failed to fetch config");
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> | { guildId: string } },
) {
  const { guildId } = await params;
  if (!guildId) {
    return NextResponse.json({ error: "Missing guildId" }, { status: 400 });
  }

  const authError = await authorizeGuildAdmin(request, guildId, LOG_PREFIX);
  if (authError) return authError;

  const apiConfig = getBotApiConfig(LOG_PREFIX);
  if (apiConfig instanceof NextResponse) return apiConfig;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate PATCH body shape: must have { path: string, value: unknown }
  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).path !== "string" ||
    !(body as Record<string, unknown>).path
  ) {
    return NextResponse.json(
      { error: "Invalid patch: expected { path: string, value: unknown }" },
      { status: 400 },
    );
  }

  const upstreamUrl = buildUpstreamUrl(
    apiConfig.baseUrl,
    `/guilds/${encodeURIComponent(guildId)}/config`,
    LOG_PREFIX,
  );
  if (upstreamUrl instanceof NextResponse) return upstreamUrl;

  return proxyToBotApi(upstreamUrl, apiConfig.secret, LOG_PREFIX, "Failed to update config", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
