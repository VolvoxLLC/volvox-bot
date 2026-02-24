import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  authorizeGuildAdmin,
  getBotApiConfig,
  buildUpstreamUrl,
  proxyToBotApi,
} from "@/lib/bot-api-proxy";

export const dynamic = "force-dynamic";

const LOG_PREFIX = "[api/guilds/:guildId/roles]";

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
    `/guilds/${encodeURIComponent(guildId)}/roles`,
    LOG_PREFIX,
  );
  if (upstreamUrl instanceof NextResponse) return upstreamUrl;

  return proxyToBotApi(upstreamUrl, apiConfig.secret, LOG_PREFIX, "Failed to fetch roles");
}
