/**
 * Auth Routes
 * Discord OAuth2 authentication endpoints
 */

import crypto from 'node:crypto';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { error, info, warn } from '../../logger.js';
import { requireOAuth } from '../middleware/oauth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { DISCORD_API, fetchUserGuilds } from '../utils/discordApi.js';
import { sessionStore } from '../utils/sessionStore.js';

const router = Router();

// Note: sessionStore canonical home is '../utils/sessionStore.js'.
// Import directly from there, not from this file.

/** CSRF state store: state → expiry timestamp */
const oauthStates = new Map();
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_OAUTH_STATES = 1_000;

/**
 * Seed an OAuth state for testing purposes.
 * Adds a state entry with the default TTL so integration tests can exercise
 * the callback endpoint without performing the redirect flow.
 *
 * @param {string} state - The state value to seed
 */
export function _seedOAuthState(state) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('_seedOAuthState is not available in production');
  }
  if (!process.env.VITEST) {
    throw new Error('_seedOAuthState is only available in test environments');
  }
  oauthStates.set(state, Date.now() + STATE_TTL_MS);
}

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/** Allowed dashboard URL hostnames for HTTP redirect validation */
const ALLOWED_REDIRECT_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Determine whether a DASHBOARD_URL value is an allowed redirect target.
 *
 * Accepts `https:` URLs. Accepts `http:` only for localhost/loopback hosts when NODE_ENV is not 'production'.
 * Uses strict URL parsing to avoid hostname prefix-matching attacks.
 *
 * @param {string|undefined} value - DASHBOARD_URL string from environment.
 * @returns {boolean} `true` if the URL is allowed, `false` otherwise.
 */
function isValidDashboardUrl(value) {
  if (typeof value !== 'string' || value.trim().length === 0) return false;
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'https:') return true;
    // Allow plain HTTP only for localhost/loopback in non-production environments
    if (
      parsed.protocol === 'http:' &&
      ALLOWED_REDIRECT_HOSTS.has(parsed.hostname) &&
      process.env.NODE_ENV !== 'production'
    )
      return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Remove expired state entries from the store
 */
function cleanExpiredStates() {
  const now = Date.now();
  for (const [key, expiry] of oauthStates) {
    if (now >= expiry) oauthStates.delete(key);
  }
}

/**
 * Remove expired session entries from the store
 */
function cleanExpiredSessions() {
  sessionStore.cleanup();
}

/** Periodic cleanup interval for expired OAuth states */
const stateCleanupInterval = setInterval(cleanExpiredStates, CLEANUP_INTERVAL_MS);
stateCleanupInterval.unref();

/** Periodic cleanup interval for expired sessions */
const sessionCleanupInterval = setInterval(cleanExpiredSessions, CLEANUP_INTERVAL_MS);
sessionCleanupInterval.unref();

/**
 * Stop all periodic cleanup intervals (state + session).
 * Should be called during server shutdown.
 */
export function stopAuthCleanup() {
  clearInterval(stateCleanupInterval);
  clearInterval(sessionCleanupInterval);
}

/** Rate limiter for OAuth initiation — 10 requests per 15 minutes per IP */
const oauthRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

/**
 * @openapi
 * /auth/discord:
 *   get:
 *     tags:
 *       - Auth
 *     summary: Initiate Discord OAuth2 login
 *     description: Redirects the user to Discord's OAuth2 authorization page. On success, Discord redirects back to the callback URL.
 *     responses:
 *       "302":
 *         description: Redirect to Discord authorization page
 *       "429":
 *         $ref: "#/components/responses/RateLimited"
 *       "500":
 *         description: OAuth2 not configured
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 */
router.get('/discord', oauthRateLimit, (_req, res) => {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    error('OAuth2 not configured — required Discord environment variables are missing');
    return res.status(500).json({ error: 'OAuth2 not configured' });
  }

  cleanExpiredStates();

  const state = crypto.randomUUID();
  oauthStates.set(state, Date.now() + STATE_TTL_MS);
  // Cap state store size to prevent unbounded memory growth — evict 10% oldest on overflow
  if (oauthStates.size > MAX_OAUTH_STATES) {
    const evictCount = Math.ceil(MAX_OAUTH_STATES * 0.1);
    const iter = oauthStates.keys();
    for (let i = 0; i < evictCount; i++) {
      const { value, done } = iter.next();
      if (done) break;
      oauthStates.delete(value);
    }
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify guilds',
    state,
  });

  res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

/**
 * @openapi
 * /auth/discord/callback:
 *   get:
 *     tags:
 *       - Auth
 *     summary: Discord OAuth2 callback
 *     description: >
 *       Handles the OAuth2 callback from Discord. Exchanges the authorization code
 *       for an access token, fetches user info, creates a JWT session, sets an httpOnly
 *       cookie, and redirects to the dashboard.
 *     parameters:
 *       - in: query
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *         description: Authorization code from Discord
 *       - in: query
 *         name: state
 *         required: true
 *         schema:
 *           type: string
 *         description: CSRF state parameter
 *     responses:
 *       "302":
 *         description: Redirect to dashboard with session cookie set
 *       "400":
 *         description: Missing authorization code
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 *       "401":
 *         description: Failed to exchange code or fetch user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 *       "403":
 *         description: Invalid or expired OAuth state
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 *       "500":
 *         $ref: "#/components/responses/ServerError"
 *       "502":
 *         description: Invalid response from Discord
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 */
router.get('/discord/callback', async (req, res) => {
  cleanExpiredStates();

  const { code, state } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'Missing authorization code' });
  }

  // Validate CSRF state parameter
  if (!state || !oauthStates.has(state)) {
    return res.status(403).json({ error: 'Invalid or expired OAuth state' });
  }

  const stateExpiry = oauthStates.get(state);
  oauthStates.delete(state);

  if (!stateExpiry || Date.now() >= stateExpiry) {
    return res.status(403).json({ error: 'Invalid or expired OAuth state' });
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;
  const sessionSecret = process.env.SESSION_SECRET;

  if (!clientId || !clientSecret || !redirectUri || !sessionSecret) {
    error('OAuth2 not configured for /discord/callback', {
      hasClientId: Boolean(clientId),
      hasClientSecret: Boolean(clientSecret),
      hasRedirectUri: Boolean(redirectUri),
      hasSessionSecret: Boolean(sessionSecret),
    });
    return res.status(500).json({ error: 'OAuth2 not configured' });
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!tokenResponse.ok) {
      error('Discord token exchange failed', { status: tokenResponse.status });
      return res.status(401).json({ error: 'Failed to exchange authorization code' });
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    if (typeof accessToken !== 'string' || accessToken.trim().length === 0) {
      error('Discord token exchange returned invalid payload', {
        hasAccessToken: Object.hasOwn(tokenData, 'access_token'),
        accessTokenType: typeof accessToken,
      });
      return res.status(502).json({ error: 'Invalid response from Discord' });
    }

    // Fetch user info
    const userResponse = await fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!userResponse.ok) {
      error('Discord user fetch failed', { status: userResponse.status });
      return res.status(401).json({ error: 'Failed to fetch user info' });
    }

    const user = await userResponse.json();
    if (typeof user?.id !== 'string' || user.id.trim().length === 0) {
      error('Discord user fetch returned invalid payload', {
        hasUserId: Object.hasOwn(user ?? {}, 'id'),
        userIdType: typeof user?.id,
      });
      return res.status(502).json({ error: 'Invalid response from Discord' });
    }

    // Generate session nonce for JWT binding
    const jti = crypto.randomUUID();

    // Store access token and session nonce server-side (never in the JWT)
    await sessionStore.set(user.id, { accessToken, jti });

    // Create JWT with user info and session nonce (no access token — stored server-side)
    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        avatar: user.avatar,
        jti,
      },
      sessionSecret,
      { algorithm: 'HS256', expiresIn: '1h' },
    );

    info('User authenticated via OAuth2', { userId: user.id });

    // DASHBOARD_URL is admin-configured environment input, not user-controlled request data.
    // Redirect with token as fragment to avoid server-side logging.
    const dashboardUrl = isValidDashboardUrl(process.env.DASHBOARD_URL)
      ? process.env.DASHBOARD_URL
      : '/';
    if (dashboardUrl === '/' && process.env.DASHBOARD_URL) {
      warn('Invalid DASHBOARD_URL; falling back to root redirect', {
        dashboardUrl: process.env.DASHBOARD_URL,
      });
    }
    // Set JWT as httpOnly cookie instead of exposing in URL fragment
    const redirectBase = dashboardUrl.includes('#') ? dashboardUrl.split('#')[0] : dashboardUrl;
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 3600000,
      path: '/',
    });
    res.redirect(redirectBase);
  } catch (err) {
    error('OAuth2 callback error', { error: err.message });
    res.status(500).json({ error: 'Authentication failed' });
  }
});

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags:
 *       - Auth
 *     summary: Get current user
 *     description: Returns the authenticated user's profile and guild list. Requires a valid Bearer JWT in the Authorization header.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       "200":
 *         description: Current user info
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 userId:
 *                   type: string
 *                 username:
 *                   type: string
 *                 avatar:
 *                   type: string
 *                   nullable: true
 *                 guilds:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       permissions:
 *                         type: string
 *       "401":
 *         $ref: "#/components/responses/Unauthorized"
 *       "503":
 *         $ref: "#/components/responses/ServiceUnavailable"
 */
router.get('/me', requireOAuth(), async (req, res) => {
  const { userId, username, avatar } = req.user;

  let accessToken;
  try {
    const session = await sessionStore.get(userId);
    accessToken = session?.accessToken;
  } catch (err) {
    error('Redis error fetching session in /me', { error: err.message, userId });
    return res.status(503).json({ error: 'Session store unavailable' });
  }

  let guilds = [];
  if (accessToken) {
    try {
      const userGuilds = await fetchUserGuilds(userId, accessToken);
      guilds = userGuilds.map((g) => ({
        id: g.id,
        name: g.name,
        permissions: g.permissions,
      }));
    } catch (fetchErr) {
      error('Failed to fetch guilds for /me', { error: fetchErr.message, userId });
    }
  }

  res.json({ userId, username, avatar, guilds });
});

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Log out
 *     description: Invalidates the server-side session. Requires a valid Bearer JWT in the Authorization header.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       "200":
 *         description: Successfully logged out
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Logged out successfully
 *       "401":
 *         $ref: "#/components/responses/Unauthorized"
 */
router.post('/logout', requireOAuth(), async (req, res) => {
  try {
    await sessionStore.delete(req.user.userId);
  } catch (err) {
    error('Redis error deleting session on logout', {
      error: err.message,
      userId: req.user.userId,
    });
    // User's intent is to log out — succeed anyway
  }
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
  res.json({ message: 'Logged out successfully' });
});

export default router;
