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
    const parsed = retryAfter ? Number.parseFloat(retryAfter) : NaN;
    const waitMs = Number.isFinite(parsed) && parsed > 0 ? parsed * 1000 : 1000;

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

    // Note: Next.js skips the Data Cache for requests with Authorization
    // headers when there's an uncached request above in the component tree,
    // so `next: { revalidate }` is unreliable here. Use cache: 'no-store'
    // to be explicit about always fetching fresh data.
    const response = await fetchWithRateLimit(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal,
      cache: "no-store",
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
/** Result of fetchBotGuilds — discriminates API-unavailable from genuinely empty. */
export interface BotGuildResult {
  /** Whether the bot API was reachable and returned a valid response. */
  available: boolean;
  guilds: BotGuild[];
}

export async function fetchBotGuilds(): Promise<BotGuildResult> {
  const botApiUrl = process.env.BOT_API_URL;

  if (!botApiUrl) {
    logger.warn(
      "[discord] BOT_API_URL is not set — cannot filter guilds by bot presence. " +
        "Set BOT_API_URL to enable mutual guild filtering.",
    );
    return { available: false, guilds: [] };
  }

  const botApiSecret = process.env.BOT_API_SECRET;
  if (!botApiSecret) {
    logger.warn(
      "[discord] BOT_API_SECRET is missing while BOT_API_URL is set. " +
        "Skipping bot guild fetch — refusing to send unauthenticated request.",
    );
    return { available: false, guilds: [] };
  }

  try {
    const response = await fetch(`${botApiUrl}/api/guilds`, {
      headers: {
        Authorization: `Bearer ${botApiSecret}`,
      },
      cache: "no-store",
    } as RequestInit);

    if (!response.ok) {
      logger.warn(
        `[discord] Bot API returned ${response.status} ${response.statusText} — ` +
          "continuing without bot guild filtering.",
      );
      return { available: false, guilds: [] };
    }

    const data: unknown = await response.json();
    if (!Array.isArray(data)) {
      logger.warn(
        "[discord] Bot API returned unexpected response shape (expected array) — " +
          "continuing without bot guild filtering.",
      );
      return { available: false, guilds: [] as BotGuild[] };
    }
    return { available: true, guilds: data as BotGuild[] };
  } catch (error) {
    logger.warn(
      "[discord] Bot API is unreachable — continuing without bot guild filtering.",
      error,
    );
    return { available: false, guilds: [] as BotGuild[] };
  }
}

/**
 * Get guilds where both the user and the bot are present.
 * If bot guilds can't be determined (BOT_API_URL unset), returns all user
 * guilds with botPresent=false so the UI can still be useful.
 */
export async function getMutualGuilds(
  accessToken: string,
  signal?: AbortSignal,
): Promise<MutualGuild[]> {
  const [userGuilds, botResult] = await Promise.all([
    fetchUserGuilds(accessToken, signal),
    // Defensive catch: even though fetchBotGuilds handles errors internally,
    // wrap at the Promise.all level so an unexpected throw can never break
    // the entire guild fetch — gracefully degrade to showing all user guilds.
    fetchBotGuilds().catch((err) => {
      logger.warn("[discord] Unexpected error fetching bot guilds — degrading gracefully.", err);
      return { available: false, guilds: [] } as BotGuildResult;
    }),
  ]);

  // If the bot API was unavailable, return all user guilds unfiltered so
  // the UI can still be useful. If the API was available but the bot is
  // genuinely in zero guilds, return an empty list.
  if (!botResult.available) {
    return userGuilds.map((guild) => ({
      ...guild,
      botPresent: false as const,
    }));
  }

  const botGuildIds = new Set(botResult.guilds.map((g) => g.id));

  return userGuilds
    .filter((guild) => botGuildIds.has(guild.id))
    .map((guild) => ({
      ...guild,
      botPresent: true as const,
    }));
}
