import type { BotGuild, DiscordGuild, MutualGuild } from "@/types/discord";

const DISCORD_API_BASE = "https://discord.com/api/v10";
const DISCORD_CDN = "https://cdn.discordapp.com";

/**
 * Fetch the guilds a user belongs to from the Discord API.
 */
export async function fetchUserGuilds(
  accessToken: string,
): Promise<DiscordGuild[]> {
  const response = await fetch(`${DISCORD_API_BASE}/users/@me/guilds`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    next: { revalidate: 60 }, // Cache for 60 seconds
  });

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
 */
export async function fetchBotGuilds(): Promise<BotGuild[]> {
  const botApiUrl = process.env.BOT_API_URL;

  if (!botApiUrl) {
    // If no bot API URL is configured, return empty array
    // This allows the dashboard to work in development without the bot running
    return [];
  }

  const response = await fetch(`${botApiUrl}/api/guilds`, {
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch bot guilds: ${response.status} ${response.statusText}`,
    );
  }

  return response.json();
}

/**
 * Get guilds where both the user and the bot are present.
 */
export async function getMutualGuilds(
  accessToken: string,
): Promise<MutualGuild[]> {
  const [userGuilds, botGuilds] = await Promise.all([
    fetchUserGuilds(accessToken),
    fetchBotGuilds(),
  ]);

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
