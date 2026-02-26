import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  authorizeGuildAdmin,
  getBotApiConfig,
  buildUpstreamUrl,
  proxyToBotApi,
} from "@/lib/bot-api-proxy";

export const dynamic = "force-dynamic";

const LOG_PREFIX = "[api/moderation/cases/:id]";

/**
 * GET /api/moderation/cases/:id
 * Proxies to bot API GET /api/v1/moderation/cases/:id
 * Requires guildId query param for authorization.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guildId = request.nextUrl.searchParams.get("guildId");
  if (!guildId) {
    return NextResponse.json({ error: "guildId is required" }, { status: 400 });
  }

  const authError = await authorizeGuildAdmin(request, guildId, LOG_PREFIX);
  if (authError) return authError;

  const config = getBotApiConfig(LOG_PREFIX);
  if (config instanceof NextResponse) return config;

  const { id } = await params;
  const upstream = buildUpstreamUrl(
    config.baseUrl,
    `/moderation/cases/${encodeURIComponent(id)}`,
    LOG_PREFIX,
  );
  if (upstream instanceof NextResponse) return upstream;

  upstream.searchParams.set("guildId", guildId);

  return proxyToBotApi(upstream, config.secret, LOG_PREFIX, "Failed to fetch mod case");
}
