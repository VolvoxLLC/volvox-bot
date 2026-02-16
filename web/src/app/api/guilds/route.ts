import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getMutualGuilds } from "@/lib/discord";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const guilds = await getMutualGuilds(session.accessToken);
    return NextResponse.json(guilds);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch guilds";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
