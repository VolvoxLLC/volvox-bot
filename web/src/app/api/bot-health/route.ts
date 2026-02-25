import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { getBotApiBaseUrl } from "@/lib/bot-api";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** Request timeout for health proxy calls (10 seconds). */
const REQUEST_TIMEOUT_MS = 10_000;

export async function GET(request: NextRequest) {
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

  const botApiBaseUrl = getBotApiBaseUrl();
  const botApiSecret = process.env.BOT_API_SECRET;

  if (!botApiBaseUrl || !botApiSecret) {
    const missing = [
      !botApiBaseUrl && "BOT_API_URL",
      !botApiSecret && "BOT_API_SECRET",
    ].filter(Boolean);
    logger.error("[api/bot-health] Missing required env vars", { missing });
    return NextResponse.json(
      { error: "Bot API is not configured" },
      { status: 500 },
    );
  }

  let upstreamUrl: URL;
  try {
    upstreamUrl = new URL(`${botApiBaseUrl}/health`);
  } catch {
    logger.error("[api/bot-health] Invalid BOT_API_URL", { botApiBaseUrl });
    return NextResponse.json(
      { error: "Bot API is not configured correctly" },
      { status: 500 },
    );
  }

  try {
    const response = await fetch(upstreamUrl.toString(), {
      headers: {
        "x-api-secret": botApiSecret,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });

    const contentType = response.headers.get("content-type") ?? "";
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
    logger.error("[api/bot-health] Failed to proxy health data", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to fetch health data" },
      { status: 500 },
    );
  }
}
