import { withAuth } from "next-auth/middleware";

/**
 * Next.js 16 proxy (route protection middleware).
 * Redirects unauthenticated users to the login page for protected routes.
 *
 * Next.js 16 uses the "proxy" file convention (proxy.ts in src/).
 * Must use a default export for Next.js to detect it.
 */
export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: ["/dashboard/:path*"],
};
