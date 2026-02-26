import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  authorizeGuildAdmin,
  getBotApiConfig,
  buildUpstreamUrl,
  proxyToBotApi,
} from "@/lib/bot-api-proxy";

export const dynamic = "force-dynamic";

const LOG_PREFIX = "[api/moderation/user/:userId/history]";

/**
 * GET /api/moderation/user/[userId]/history
 * Proxies to bot API GET /api/v1/moderation/user/:userId/history
 * Requires guildId query param for authorization.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  const guildId = request.nextUrl.searchParams.get("guildId");
  if (!guildId) {
    return NextResponse.json({ error: "guildId is required" }, { status: 400 });
  }

  const authError = await authorizeGuildAdmin(request, guildId, LOG_PREFIX);
  if (authError) return authError;

  const config = getBotApiConfig(LOG_PREFIX);
  if (config instanceof NextResponse) return config;

  const { userId } = await params;
  const upstream = buildUpstreamUrl(
    config.baseUrl,
    `/moderation/user/${encodeURIComponent(userId)}/history`,
    LOG_PREFIX,
  );
  if (upstream instanceof NextResponse) return upstream;

  upstream.searchParams.set("guildId", guildId);

  const page = request.nextUrl.searchParams.get("page");
  if (page !== null) upstream.searchParams.set("page", page);

  const limit = request.nextUrl.searchParams.get("limit");
  if (limit !== null) upstream.searchParams.set("limit", limit);

  return proxyToBotApi(
    upstream,
    config.secret,
    LOG_PREFIX,
    "Failed to fetch user mod history",
  );
}
