import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { getMutualGuilds } from "@/lib/discord";

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request });

  if (!token?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const guilds = await getMutualGuilds(token.accessToken);
    return NextResponse.json(guilds);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch guilds";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
