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
const MAX_OAUTH_STATES = 10_000;

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
 * GET /discord — Redirect to Discord OAuth2 authorization
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
  // Cap state store size to prevent unbounded memory growth
  if (oauthStates.size > MAX_OAUTH_STATES) {
    const oldest = oauthStates.keys().next().value;
    oauthStates.delete(oldest);
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
 * GET /discord/callback — Handle Discord OAuth2 callback
 * Exchanges code for token, fetches user info, creates JWT
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

    // Store access token server-side (never in the JWT)
    sessionStore.set(user.id, accessToken);

    // Create JWT with user info only (no access token — stored server-side)
    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        avatar: user.avatar,
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
    // Strip existing fragment to avoid collision, then append token
    const redirectBase = dashboardUrl.includes('#') ? dashboardUrl.split('#')[0] : dashboardUrl;
    res.redirect(`${redirectBase}#token=${token}`);
  } catch (err) {
    error('OAuth2 callback error', { error: err.message });
    res.status(500).json({ error: 'Authentication failed' });
  }
});

/**
 * GET /me — Return current authenticated user info from JWT
 * Fetches fresh guilds from Discord using the stored access token
 */
router.get('/me', requireOAuth(), async (req, res) => {
  const { userId, username, avatar } = req.user;
  const accessToken = sessionStore.get(userId);

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
 * POST /logout — Invalidate the user's server-side session
 */
router.post('/logout', requireOAuth(), (req, res) => {
  sessionStore.delete(req.user.userId);
  res.json({ message: 'Logged out successfully' });
});

export default router;
