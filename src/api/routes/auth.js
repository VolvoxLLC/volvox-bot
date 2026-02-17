/**
 * Auth Routes
 * Discord OAuth2 authentication endpoints
 */

import crypto from 'node:crypto';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { error, info } from '../../logger.js';
import { requireOAuth } from '../middleware/oauth.js';

const router = Router();

const DISCORD_API = 'https://discord.com/api/v10';

/** Session TTL matches JWT expiry */
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * TTL-based session store: userId → { accessToken, expiresAt }
 * Extends Map to transparently handle expiry on get/has/delete.
 */
class SessionStore extends Map {
  set(userId, accessToken) {
    return super.set(userId, { accessToken, expiresAt: Date.now() + SESSION_TTL_MS });
  }

  get(userId) {
    const entry = super.get(userId);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      super.delete(userId);
      return undefined;
    }
    return entry.accessToken;
  }

  has(userId) {
    const entry = super.get(userId);
    if (!entry) return false;
    if (Date.now() >= entry.expiresAt) {
      super.delete(userId);
      return false;
    }
    return true;
  }
}

export const sessionStore = new SessionStore();

/** CSRF state store: state → expiry timestamp */
const oauthStates = new Map();
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Remove expired state entries from the store
 */
function cleanExpiredStates() {
  const now = Date.now();
  for (const [key, expiry] of oauthStates) {
    if (now > expiry) oauthStates.delete(key);
  }
}

/**
 * Remove expired session entries from the store
 */
function cleanExpiredSessions() {
  const now = Date.now();
  for (const [key, entry] of sessionStore.entries()) {
    if (now >= entry.expiresAt) sessionStore.delete(key);
  }
}

/** Periodic cleanup interval for expired OAuth states */
const stateCleanupInterval = setInterval(cleanExpiredStates, CLEANUP_INTERVAL_MS);
stateCleanupInterval.unref();

/** Periodic cleanup interval for expired sessions */
const sessionCleanupInterval = setInterval(cleanExpiredSessions, CLEANUP_INTERVAL_MS);
sessionCleanupInterval.unref();

/**
 * Stop the periodic cleanup intervals.
 * Should be called during server shutdown.
 */
export function stopAuthCleanup() {
  clearInterval(stateCleanupInterval);
}

/**
 * Stop the periodic session cleanup interval.
 * Should be called during server shutdown.
 */
export function stopSessionCleanup() {
  clearInterval(sessionCleanupInterval);
}

/**
 * Get the access token for a user from the session store.
 * Returns undefined if the session has expired or does not exist.
 *
 * @param {string} userId - Discord user ID
 * @returns {string|undefined} The access token, or undefined
 */
export function getSessionToken(userId) {
  return sessionStore.get(userId);
}

/**
 * GET /discord — Redirect to Discord OAuth2 authorization
 */
router.get('/discord', (_req, res) => {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return res.status(500).json({ error: 'OAuth2 not configured' });
  }

  cleanExpiredStates();

  const state = crypto.randomUUID();
  oauthStates.set(state, Date.now() + STATE_TTL_MS);

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

  if (Date.now() > stateExpiry) {
    return res.status(403).json({ error: 'Invalid or expired OAuth state' });
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;
  const sessionSecret = process.env.SESSION_SECRET;

  if (!clientId || !clientSecret || !redirectUri || !sessionSecret) {
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

    // Store access token server-side (never in the JWT)
    sessionStore.set(user.id, accessToken);

    // Create JWT with user info only (no access token — stored server-side)
    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        discriminator: user.discriminator,
        avatar: user.avatar,
      },
      sessionSecret,
      { algorithm: 'HS256', expiresIn: '1h' },
    );

    info('User authenticated via OAuth2', { userId: user.id, username: user.username });

    // Redirect with token as fragment to avoid server-side logging
    const dashboardUrl = process.env.DASHBOARD_URL || '/';
    res.redirect(`${dashboardUrl}#token=${token}`);
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
  const { userId, username, discriminator, avatar } = req.user;
  const accessToken = sessionStore.get(userId);

  let guilds = [];
  if (accessToken) {
    try {
      const response = await fetch(`${DISCORD_API}/users/@me/guilds`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) {
        guilds = (await response.json()).map((g) => ({
          id: g.id,
          name: g.name,
          permissions: g.permissions,
        }));
      }
    } catch {
      // Guilds fetch failed, return user info without guilds
    }
  }

  res.json({ userId, username, discriminator, avatar, guilds });
});

/**
 * POST /logout — Invalidate the user's server-side session
 */
router.post('/logout', requireOAuth(), (req, res) => {
  sessionStore.delete(req.user.userId);
  res.json({ message: 'Logged out successfully' });
});

export default router;
