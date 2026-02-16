import type { AuthOptions } from "next-auth";
import DiscordProvider from "next-auth/providers/discord";

/**
 * Discord OAuth2 scopes needed for the dashboard.
 * - identify: basic user info (id, username, avatar)
 * - guilds: list of guilds the user is in
 * - email: user's email address
 */
const DISCORD_SCOPES = "identify guilds email";

/**
 * Refresh a Discord OAuth2 access token using the refresh token.
 * Returns updated token fields or the original token with an error flag.
 */
async function refreshDiscordToken(token: Record<string, unknown>): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID ?? "",
    client_secret: process.env.DISCORD_CLIENT_SECRET ?? "",
    grant_type: "refresh_token",
    refresh_token: token.refreshToken as string,
  });

  const response = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok) {
    console.error(
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
          : undefined;
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
      // Expose the Discord access token and user ID to the client session
      session.accessToken = token.accessToken as string | undefined;
      if (session.user) {
        session.user.id = token.id as string;
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
