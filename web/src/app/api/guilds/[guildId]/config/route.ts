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

/**
 * Retrieve the configuration for a guild identified by the route `guildId`.
 *
 * @param request - The incoming NextRequest
 * @param params - Route parameters object (must include `guildId`)
 * @returns A NextResponse containing the guild configuration JSON on success; an error NextResponse on failure (e.g., 400 when `guildId` is missing, authorization failures, configuration errors, or upstream fetch errors)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> },
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

/**
 * Handles PATCH requests to update a guild's configuration.
 *
 * Attempts to validate the route parameter and request body, enforces guild-admin authorization,
 * and proxies a JSON PATCH to the upstream bot API for /guilds/{guildId}/config.
 *
 * @param request - The incoming NextRequest containing the JSON patch body.
 * @param params - Route parameters object; must provide `guildId`.
 * @returns A NextResponse forwarded from the bot API on success, or a NextResponse with an error status:
 *          - 400 when `guildId` is missing, the request body is invalid JSON, or the patch shape is invalid.
 *          - An authorization error response if the caller is not an authorized guild admin.
 *          - A configuration error response if the bot API configuration is invalid.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> },
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
    !(body as Record<string, unknown>).path ||
    !("value" in (body as Record<string, unknown>))
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
