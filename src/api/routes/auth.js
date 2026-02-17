/**
 * Auth Routes
 * Discord OAuth2 authentication endpoints
 */

import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { error, info } from '../../logger.js';

const router = Router();

const DISCORD_API = 'https://discord.com/api/v10';

/**
 * GET /discord — Redirect to Discord OAuth2 authorization
 */
router.get('/discord', (_req, res) => {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return res.status(500).json({ error: 'OAuth2 not configured' });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify guilds',
  });

  res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

/**
 * GET /discord/callback — Handle Discord OAuth2 callback
 * Exchanges code for token, fetches user info, creates JWT
 */
router.get('/discord/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'Missing authorization code' });
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
    });

    if (!userResponse.ok) {
      error('Discord user fetch failed', { status: userResponse.status });
      return res.status(401).json({ error: 'Failed to fetch user info' });
    }

    const user = await userResponse.json();

    // Fetch user guilds
    const guildsResponse = await fetch(`${DISCORD_API}/users/@me/guilds`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!guildsResponse.ok) {
      error('Discord guilds fetch failed', { status: guildsResponse.status });
      return res.status(401).json({ error: 'Failed to fetch user guilds' });
    }

    const guilds = await guildsResponse.json();

    // Create JWT
    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        discriminator: user.discriminator,
        avatar: user.avatar,
        guilds: guilds.map((g) => ({
          id: g.id,
          name: g.name,
          permissions: g.permissions,
        })),
      },
      sessionSecret,
      { expiresIn: '7d' },
    );

    info('User authenticated via OAuth2', { userId: user.id, username: user.username });

    // Redirect with token as query parameter
    const dashboardUrl = process.env.DASHBOARD_URL || '/';
    res.redirect(`${dashboardUrl}?token=${token}`);
  } catch (err) {
    error('OAuth2 callback error', { error: err.message });
    res.status(500).json({ error: 'Authentication failed' });
  }
});

/**
 * GET /me — Return current authenticated user info from JWT
 */
router.get('/me', (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.slice(7);
  const sessionSecret = process.env.SESSION_SECRET;

  if (!sessionSecret) {
    return res.status(500).json({ error: 'Session not configured' });
  }

  try {
    const decoded = jwt.verify(token, sessionSecret);
    res.json({
      userId: decoded.userId,
      username: decoded.username,
      discriminator: decoded.discriminator,
      avatar: decoded.avatar,
      guilds: decoded.guilds,
    });
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

/**
 * POST /logout — Placeholder for logout (JWT is stateless, client discards token)
 */
router.post('/logout', (_req, res) => {
  res.json({ message: 'Logged out successfully' });
});

export default router;
