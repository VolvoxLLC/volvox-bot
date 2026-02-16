import type { BotGuild, DiscordGuild, MutualGuild } from "@/types/discord";

const DISCORD_API_BASE = "https://discord.com/api/v10";
const DISCORD_CDN = "https://cdn.discordapp.com";

/** Maximum number of retry attempts for rate-limited requests. */
const MAX_RETRIES = 3;

/**
 * Fetch wrapper with basic rate limit retry logic.
 * When Discord returns 429 Too Many Requests, waits for the indicated
 * retry-after duration and retries up to MAX_RETRIES times.
 */
async function fetchWithRateLimit(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(url, init);

    if (response.status !== 429) {
      return response;
    }

    // Rate limited — parse retry-after header (seconds)
    const retryAfter = response.headers.get("retry-after");
    const waitMs = retryAfter ? Number.parseFloat(retryAfter) * 1000 : 1000;

    if (attempt === MAX_RETRIES) {
      return response; // Out of retries, return the 429 as-is
    }

    console.warn(
      `[discord] Rate limited on ${url}, retrying in ${waitMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
    );
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  // Should never reach here, but satisfies TypeScript
  throw new Error("Unexpected end of rate limit retry loop");
}

/**
 * Fetch the guilds a user belongs to from the Discord API.
 */
export async function fetchUserGuilds(
  accessToken: string,
): Promise<DiscordGuild[]> {
  const response = await fetchWithRateLimit(
    `${DISCORD_API_BASE}/users/@me/guilds`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      next: { revalidate: 60 }, // Cache for 60 seconds
    } as RequestInit,
  );

  if (!response.ok) {
    throw new Error(
      `Failed to fetch user guilds: ${response.status} ${response.statusText}`,
    );
  }

  return response.json();
}

/**
 * Fetch guilds the bot is present in.
 * This calls our own bot API to get the list of guilds.
 * Requires BOT_API_SECRET env var for authentication.
 */
export async function fetchBotGuilds(): Promise<BotGuild[]> {
  const botApiUrl = process.env.BOT_API_URL;

  if (!botApiUrl) {
    console.warn(
      "[discord] BOT_API_URL is not set — cannot filter guilds by bot presence. " +
        "Set BOT_API_URL to enable mutual guild filtering.",
    );
    return [];
  }

  const headers: Record<string, string> = {};
  const botApiSecret = process.env.BOT_API_SECRET;
  if (botApiSecret) {
    headers.Authorization = `Bearer ${botApiSecret}`;
  }

  const response = await fetch(`${botApiUrl}/api/guilds`, {
    headers,
    next: { revalidate: 60 },
  } as RequestInit);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch bot guilds: ${response.status} ${response.statusText}`,
    );
  }

  return response.json();
}

/**
 * Get guilds where both the user and the bot are present.
 * If bot guilds can't be determined (BOT_API_URL unset), returns all user
 * guilds with botPresent=false so the UI can still be useful.
 */
export async function getMutualGuilds(
  accessToken: string,
): Promise<MutualGuild[]> {
  const [userGuilds, botGuilds] = await Promise.all([
    fetchUserGuilds(accessToken),
    fetchBotGuilds(),
  ]);

  // If no bot guilds could be fetched, return all user guilds unfiltered
  if (botGuilds.length === 0) {
    return userGuilds.map((guild) => ({
      ...guild,
      botPresent: false as const,
    }));
  }

  const botGuildIds = new Set(botGuilds.map((g) => g.id));

  return userGuilds
    .filter((guild) => botGuildIds.has(guild.id))
    .map((guild) => ({
      ...guild,
      botPresent: true as const,
    }));
}

/**
 * Get the URL for a guild's icon.
 */
export function getGuildIconUrl(
  guildId: string,
  iconHash: string | null,
  size = 128,
): string {
  if (!iconHash) {
    // Return a default icon based on guild name initial
    return `${DISCORD_CDN}/embed/avatars/0.png`;
  }
  const ext = iconHash.startsWith("a_") ? "gif" : "webp";
  return `${DISCORD_CDN}/icons/${guildId}/${iconHash}.${ext}?size=${size}`;
}

/**
 * Get the URL for a user's avatar.
 */
export function getUserAvatarUrl(
  userId: string,
  avatarHash: string | null,
  discriminator = "0",
  size = 128,
): string {
  if (!avatarHash) {
    const index = discriminator === "0" ? Number(BigInt(userId) >> 22n) % 6 : Number(discriminator) % 5;
    return `${DISCORD_CDN}/embed/avatars/${index}.png`;
  }
  const ext = avatarHash.startsWith("a_") ? "gif" : "webp";
  return `${DISCORD_CDN}/avatars/${userId}/${avatarHash}.${ext}?size=${size}`;
}
