import type { AuthOptions } from "next-auth";
import DiscordProvider from "next-auth/providers/discord";
import { logger } from "@/lib/logger";

// --- Runtime validation ---

const secret = process.env.NEXTAUTH_SECRET ?? "";
if (
  secret === "change-me-in-production" ||
  secret === "CHANGE_ME_generate_with_openssl_rand_base64_32" ||
  secret.length < 32
) {
  throw new Error(
    "[auth] NEXTAUTH_SECRET must be at least 32 characters and not the default placeholder. " +
      "Generate one with: openssl rand -base64 48",
  );
}

if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET) {
  throw new Error(
    "[auth] DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET must be set. " +
      "Create an OAuth2 application at https://discord.com/developers/applications",
  );
}

if (process.env.BOT_API_URL && !process.env.BOT_API_SECRET) {
  logger.warn(
    "[auth] BOT_API_URL is set but BOT_API_SECRET is missing. " +
      "Requests to the bot API will be unauthenticated. " +
      "Set BOT_API_SECRET to secure bot API communication.",
  );
}

/**
 * Discord OAuth2 scopes needed for the dashboard.
 * - identify: basic user info (id, username, avatar)
 * - guilds: list of guilds the user is in
 */
const DISCORD_SCOPES = "identify guilds";

/**
 * Refresh a Discord OAuth2 access token using the refresh token.
 * Returns updated token fields or the original token with an error flag.
 *
 * Exported for testing; not intended for direct use outside auth callbacks.
 */
export async function refreshDiscordToken(token: Record<string, unknown>): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID ?? "",
    client_secret: process.env.DISCORD_CLIENT_SECRET ?? "",
    grant_type: "refresh_token",
    refresh_token: token.refreshToken as string,
  });

  let response: Response;
  try {
    response = await fetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
  } catch (error) {
    logger.error("[auth] Network error refreshing Discord token:", error);
    return { ...token, error: "RefreshTokenError" };
  }

  if (!response.ok) {
    logger.error(
      `[auth] Failed to refresh Discord token: ${response.status} ${response.statusText}`,
    );
    return { ...token, error: "RefreshTokenError" };
  }

  const refreshed = await response.json() as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };

  return {
    ...token,
    accessToken: refreshed.access_token,
    accessTokenExpires: Date.now() + refreshed.expires_in * 1000,
    // Discord may rotate the refresh token
    refreshToken: refreshed.refresh_token ?? token.refreshToken,
    error: undefined,
  };
}

export const authOptions: AuthOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID ?? "",
      clientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
      authorization: {
        params: {
          scope: DISCORD_SCOPES,
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      // On initial sign-in, persist the Discord access token
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpires = account.expires_at
          ? account.expires_at * 1000
          : Date.now() + 7 * 24 * 60 * 60 * 1000; // Default to 7 days if provider omits expires_at
        token.id = account.providerAccountId;
      }

      // If the access token has not expired, return it as-is
      const expiresAt = token.accessTokenExpires as number | undefined;
      if (expiresAt && Date.now() < expiresAt) {
        return token;
      }

      // Access token has expired — attempt refresh
      if (token.refreshToken) {
        return refreshDiscordToken(token as Record<string, unknown>);
      }

      return token;
    },
    async session({ session, token }) {
      // Only expose user ID to the client session.
      // The access token stays in the server-side JWT — use getToken() in API routes.
      if (session.user) {
        session.user.id = token.id as string;
      }
      // Propagate token refresh errors so the client can redirect to sign-in
      if (token.error) {
        session.error = token.error as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
  secret: process.env.NEXTAUTH_SECRET,
};
