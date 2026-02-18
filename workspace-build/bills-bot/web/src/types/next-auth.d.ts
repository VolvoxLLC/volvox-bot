import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    /** Propagated from JWT when token refresh fails */
    error?: string;
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
    id?: string;
    error?: string;
  }
}
