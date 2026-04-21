import 'server-only';

import { createHash } from 'node:crypto';
import { getBotApiBaseUrl } from '@/lib/bot-api';
import { logger } from '@/lib/logger';
import type { BotGuild, DiscordGuild, MutualGuild } from '@/types/discord';

const DISCORD_API_BASE = 'https://discord.com/api/v10';

/** Maximum number of retry attempts for rate-limited requests. */
const MAX_RETRIES = 3;

/** Default maximum delay we'll honor from a single retry-after header. */
const DEFAULT_MAX_RETRY_DELAY_MS = 5_000;

/** Default total time budget to spend sleeping across all retries. */
const DEFAULT_TOTAL_RETRY_BUDGET_MS = 8_000;

/** Discord returns at most 200 guilds per page. */
const GUILDS_PER_PAGE = 200;
const inFlightUserGuildRequests = new Map<string, Promise<DiscordGuild[]>>();

interface FetchWithRateLimitOptions extends RequestInit {
  rateLimit?: {
    maxRetries?: number;
    maxRetryDelayMs?: number;
    totalRetryBudgetMs?: number;
  };
}

function parseRetryAfterMs(response: Response): number {
  const retryAfter = response.headers.get('retry-after');
  const resetAfter = response.headers.get('x-ratelimit-reset-after');

  const parseSeconds = (value: string | null): number | null => {
    if (!value) {
      return null;
    }
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed * 1000 : null;
  };

  return parseSeconds(retryAfter) ?? parseSeconds(resetAfter) ?? 1000;
}

function getUserGuildRequestKey(accessToken: string): string {
  return createHash('sha256').update(accessToken).digest('hex');
}

function getAbortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
}

function isAbortLikeError(error: unknown): boolean {
  return (
    error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')
  );
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw getAbortReason(signal);
  }
}

function waitForPromiseOrAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  throwIfAborted(signal);

  if (!signal) {
    return promise;
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(getAbortReason(signal));
    };

    signal.addEventListener('abort', onAbort, { once: true });

    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

async function fetchAllUserGuildPages(accessToken: string): Promise<DiscordGuild[]> {
  const allGuilds: DiscordGuild[] = [];
  let after: string | undefined;
  let hasMore = true;

  do {
    const url = new URL(`${DISCORD_API_BASE}/users/@me/guilds`);
    url.searchParams.set('limit', String(GUILDS_PER_PAGE));
    if (after) {
      url.searchParams.set('after', after);
    }

    const response = await fetchWithRateLimit(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
      rateLimit: {
        maxRetryDelayMs: 2_000,
        totalRetryBudgetMs: 4_000,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch user guilds: ${response.status} ${response.statusText}`);
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new Error('Discord returned non-JSON response for user guilds');
    }
    if (!Array.isArray(data)) {
      throw new Error(
        'Discord returned unexpected response shape for user guilds (expected array)',
      );
    }
    const page: DiscordGuild[] = data;
    allGuilds.push(...page);

    hasMore = page.length >= GUILDS_PER_PAGE;
    if (hasMore) {
      after = page[page.length - 1].id;
    }
  } while (hasMore);

  return allGuilds;
}

/**
 * Fetch wrapper with basic rate limit retry logic.
 * When Discord returns 429 Too Many Requests, waits for the indicated
 * retry-after duration and retries up to MAX_RETRIES times.
 */
export async function fetchWithRateLimit(
  url: string,
  init?: FetchWithRateLimitOptions,
): Promise<Response> {
  const maxRetries = init?.rateLimit?.maxRetries ?? MAX_RETRIES;
  const maxRetryDelayMs = init?.rateLimit?.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS;
  const totalRetryBudgetMs = init?.rateLimit?.totalRetryBudgetMs ?? DEFAULT_TOTAL_RETRY_BUDGET_MS;
  let totalWaitMs = 0;
  const maxAttempts = maxRetries + 1;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, init);

    if (response.status !== 429) {
      return response;
    }

    // Rate limited — parse retry-after header (seconds)
    const waitMs = parseRetryAfterMs(response);
    const remainingBudgetMs = totalRetryBudgetMs - totalWaitMs;

    if (attempt === maxRetries || waitMs > maxRetryDelayMs || waitMs > remainingBudgetMs) {
      logger.warn(
        `[discord] Rate limited on ${url}, not retrying after ${waitMs}ms ` +
          `(attempt ${attempt + 1}/${maxAttempts}, remaining budget ${Math.max(remainingBudgetMs, 0)}ms)`,
      );
      return response;
    }

    logger.warn(
      `[discord] Rate limited on ${url}, retrying in ${waitMs}ms ` +
        `(attempt ${attempt + 1}/${maxAttempts}, remaining budget ${remainingBudgetMs}ms)`,
    );
    // Abort-aware sleep: if the caller's signal fires while we're waiting,
    // cancel the delay immediately instead of blocking for the full duration.
    const signal = init?.signal;
    if (signal?.aborted) {
      throw signal.reason;
    }
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer);
        reject(signal?.reason);
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, waitMs);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
    totalWaitMs += waitMs;
  }

  // Should never reach here, but satisfies TypeScript
  throw new Error('Unexpected end of rate limit retry loop');
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
  throwIfAborted(signal);

  const requestKey = getUserGuildRequestKey(accessToken);
  const existingRequest = inFlightUserGuildRequests.get(requestKey);

  if (existingRequest) {
    return waitForPromiseOrAbort(existingRequest, signal);
  }

  let requestPromise: Promise<DiscordGuild[]>;
  requestPromise = fetchAllUserGuildPages(accessToken).finally(() => {
    if (inFlightUserGuildRequests.get(requestKey) === requestPromise) {
      inFlightUserGuildRequests.delete(requestKey);
    }
  });

  inFlightUserGuildRequests.set(requestKey, requestPromise);

  return waitForPromiseOrAbort(requestPromise, signal);
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

export async function fetchBotGuilds(signal?: AbortSignal): Promise<BotGuildResult> {
  const botApiBaseUrl = getBotApiBaseUrl();

  if (!botApiBaseUrl) {
    logger.warn(
      '[discord] BOT_API_URL is not set — cannot filter guilds by bot presence. ' +
        'Set BOT_API_URL to enable mutual guild filtering.',
    );
    return { available: false, guilds: [] };
  }

  const botApiSecret = process.env.BOT_API_SECRET;
  if (!botApiSecret) {
    logger.warn(
      '[discord] BOT_API_SECRET is missing while BOT_API_URL is set. ' +
        'Skipping bot guild fetch — refusing to send unauthenticated request.',
    );
    return { available: false, guilds: [] };
  }

  try {
    const response = await fetchWithRateLimit(`${botApiBaseUrl}/guilds`, {
      headers: {
        'x-api-secret': botApiSecret,
      },
      signal,
      cache: 'no-store',
      rateLimit: {
        maxRetries: 1,
        maxRetryDelayMs: 250,
        totalRetryBudgetMs: 500,
      },
    });

    if (!response.ok) {
      logger.warn(
        `[discord] Bot API returned ${response.status} ${response.statusText} — ` +
          'continuing without bot guild filtering.',
      );
      return { available: false, guilds: [] };
    }

    const data: unknown = await response.json();
    if (!Array.isArray(data)) {
      logger.warn(
        '[discord] Bot API returned unexpected response shape (expected array) — ' +
          'continuing without bot guild filtering.',
      );
      return { available: false, guilds: [] as BotGuild[] };
    }
    return { available: true, guilds: data as BotGuild[] };
  } catch (error) {
    if (isAbortLikeError(error)) {
      throw error;
    }

    logger.warn(
      '[discord] Bot API is unreachable — continuing without bot guild filtering.',
      error,
    );
    return { available: false, guilds: [] as BotGuild[] };
  }
}

async function getUserGuildsWithBotPresence(
  accessToken: string,
  signal?: AbortSignal,
): Promise<{ userGuilds: DiscordGuild[]; botResult: BotGuildResult }> {
  const [userGuilds, botResult] = await Promise.all([
    fetchUserGuilds(accessToken, signal),
    fetchBotGuilds(signal).catch((err) => {
      logger.warn('[discord] Unexpected error fetching bot guilds — degrading gracefully.', err);
      return { available: false, guilds: [] } as BotGuildResult;
    }),
  ]);

  return { userGuilds, botResult };
}

/**
 * During bot API outages, auth-protected routes still need a guild list to avoid
 * failing closed for every server the user belongs to. We intentionally mark
 * the user's guilds as `botPresent: true` here to mean "treat as mutual for
 * auth fallback", not "the bot is definitely installed in this guild".
 */
function markGuildsAsMutualGuildsForAuthFallback(userGuilds: DiscordGuild[]): MutualGuild[] {
  return userGuilds.map((guild: DiscordGuild) => ({
    ...guild,
    botPresent: true,
  }));
}

/**
 * Get the dashboard guild directory for a user.
 * Returns all user guilds and annotates bot presence when it can be determined.
 * When the bot API is unavailable, botPresent is omitted so callers can treat
 * the status as unknown instead of incorrectly classifying the guild.
 */
export async function getUserGuildDirectory(
  accessToken: string,
  signal?: AbortSignal,
): Promise<MutualGuild[]> {
  const { userGuilds, botResult } = await getUserGuildsWithBotPresence(accessToken, signal);

  if (!botResult.available) {
    return userGuilds.map((guild) => ({
      ...guild,
    }));
  }

  const botGuildIds = new Set(botResult.guilds.map((g) => g.id));

  return userGuilds.map((guild) => ({
    ...guild,
    botPresent: botGuildIds.has(guild.id),
  }));
}

/**
 * Get guilds where both the user and the bot are present.
 * When bot presence cannot be determined, this degrades to an auth fallback
 * that keeps protected routes usable for the user's guilds until the bot API
 * recovers. In that fallback path, `botPresent: true` means "treat as mutual
 * for auth" rather than "the bot is confirmed installed".
 */
export async function getUserGuilds(
  accessToken: string,
  signal?: AbortSignal,
): Promise<MutualGuild[]> {
  const { userGuilds, botResult } = await getUserGuildsWithBotPresence(accessToken, signal);

  if (!botResult.available) {
    return markGuildsAsMutualGuildsForAuthFallback(userGuilds);
  }

  const botGuildIds = new Set(botResult.guilds.map((guild) => guild.id));

  return userGuilds
    .filter((guild) => botGuildIds.has(guild.id))
    .map((guild) => ({
      ...guild,
      botPresent: true,
    }));
}
