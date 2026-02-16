import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { getMutualGuilds } from "@/lib/discord.server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request });

  if (!token?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const guilds = await getMutualGuilds(token.accessToken as string);
    return NextResponse.json(guilds);
  } catch (error) {
    logger.error("[api/guilds] Failed to fetch guilds:", error);
    return NextResponse.json(
      { error: "Failed to fetch guilds" },
      { status: 500 },
    );
  }
}
