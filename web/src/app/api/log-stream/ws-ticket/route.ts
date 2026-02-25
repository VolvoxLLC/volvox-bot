import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Returns WebSocket connection info for the log stream.
 *
 * Validates session then returns the WS URL and bot API secret so the
 * browser can authenticate to the bot's /ws/logs endpoint.
 *
 * The secret is scoped to authenticated dashboard users only — it never
 * appears in client-side HTML or public bundles.
 */
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

  const botApiUrl = process.env.BOT_API_URL;
  const botApiSecret = process.env.BOT_API_SECRET;

  if (!botApiUrl || !botApiSecret) {
    logger.error("[api/logs/ws-ticket] BOT_API_URL and BOT_API_SECRET are required");
    return NextResponse.json(
      { error: "Bot API is not configured" },
      { status: 500 },
    );
  }

  // Convert http(s):// to ws(s):// for WebSocket connection
  let wsUrl: string;
  try {
    const url = new URL(botApiUrl.replace(/\/+$/, ""));
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    wsUrl = `${url.origin}/ws/logs`;
  } catch {
    logger.error("[api/logs/ws-ticket] Invalid BOT_API_URL", { botApiUrl });
    return NextResponse.json(
      { error: "Bot API is not configured correctly" },
      { status: 500 },
    );
  }

  return NextResponse.json({ wsUrl, secret: botApiSecret });
}
