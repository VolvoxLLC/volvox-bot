import type { AuthOptions } from "next-auth";
import DiscordProvider from "next-auth/providers/discord";

/**
 * Discord OAuth2 scopes needed for the dashboard.
 * - identify: basic user info (id, username, avatar)
 * - guilds: list of guilds the user is in
 * - email: user's email address
 */
const DISCORD_SCOPES = "identify guilds email";

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
