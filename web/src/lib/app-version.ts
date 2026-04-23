/**
 * Public web app version injected at build time.
 *
 * Falls back to `0.0.0` if the environment variable is not configured.
 */
export const WEB_APP_VERSION = process.env.NEXT_PUBLIC_WEB_APP_VERSION ?? '0.0.0';
