import "server-only";

import type { BotGuild, DiscordGuild, MutualGuild } from "@/types/discord";
import { logger } from "@/lib/logger";

const DISCORD_API_BASE = "https://discord.com/api/v10";

/** Maximum number of retry attempts for rate-limited requests. */
const MAX_RETRIES = 3;

/** Discord returns at most 200 guilds per page. */
const GUILDS_PER_PAGE = 200;

/**
 * Fetch wrapper with basic rate limit retry logic.
 * When Discord returns 429 Too Many Requests, waits for the indicated
 * retry-after duration and retries up to MAX_RETRIES times.
 */
export async function fetchWithRateLimit(
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

    logger.warn(
      `[discord] Rate limited on ${url}, retrying in ${waitMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
    );
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  // Should never reach here, but satisfies TypeScript
  throw new Error("Unexpected end of rate limit retry loop");
}

/**
 * Fetch ALL guilds a user belongs to from the Discord API.
 * Uses cursor-based pagination with the `after` parameter to handle
 * users in more than 200 guilds.
 */
export async function fetchUserGuilds(
  accessToken: string,
  signal?: AbortSignal,
): Promise<DiscordGuild[]> {
  const allGuilds: DiscordGuild[] = [];
  let after: string | undefined;

  do {
    const url = new URL(`${DISCORD_API_BASE}/users/@me/guilds`);
    url.searchParams.set("limit", String(GUILDS_PER_PAGE));
    if (after) {
      url.searchParams.set("after", after);
    }

    const response = await fetchWithRateLimit(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal,
      next: { revalidate: 60 },
    } as RequestInit);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch user guilds: ${response.status} ${response.statusText}`,
      );
    }

    const page: DiscordGuild[] = await response.json();
    allGuilds.push(...page);

    // If we got fewer than the max, we've fetched everything
    if (page.length < GUILDS_PER_PAGE) {
      break;
    }

    // Set cursor to the last guild's ID for the next page
    after = page[page.length - 1].id;
  } while (true);

  return allGuilds;
}

/**
 * Fetch guilds the bot is present in.
 * This calls our own bot API to get the list of guilds.
 * Requires BOT_API_SECRET env var for authentication.
 */
export async function fetchBotGuilds(): Promise<BotGuild[]> {
  const botApiUrl = process.env.BOT_API_URL;

  if (!botApiUrl) {
    logger.warn(
      "[discord] BOT_API_URL is not set — cannot filter guilds by bot presence. " +
        "Set BOT_API_URL to enable mutual guild filtering.",
    );
    return [];
  }

  const botApiSecret = process.env.BOT_API_SECRET;
  if (!botApiSecret) {
    logger.warn(
      "[discord] BOT_API_SECRET is missing while BOT_API_URL is set. " +
        "Skipping bot guild fetch — refusing to send unauthenticated request.",
    );
    return [];
  }

  try {
    const response = await fetch(`${botApiUrl}/api/guilds`, {
      headers: {
        Authorization: `Bearer ${botApiSecret}`,
      },
      next: { revalidate: 60 },
    } as RequestInit);

    if (!response.ok) {
      logger.warn(
        `[discord] Bot API returned ${response.status} ${response.statusText} — ` +
          "continuing without bot guild filtering.",
      );
      return [];
    }

    return response.json();
  } catch (error) {
    logger.warn(
      "[discord] Bot API is unreachable — continuing without bot guild filtering.",
      error,
    );
    return [];
  }
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
