/**
 * Webhook Routes
 * Endpoints for receiving webhook notifications from external services (e.g. dashboard)
 */

import { Router } from 'express';
import { error, info } from '../../logger.js';
import { getConfig, setConfigValue } from '../../modules/config.js';
import { SAFE_CONFIG_KEYS } from '../utils/configAllowlist.js';

const router = Router();

/**
 * POST /config-update — Receive a config update pushed from the dashboard.
 * Persists the change via setConfigValue.
 *
 * Body: { guildId: "123456", path: "ai.model", value: "claude-3" }
 *
 * Auth: API secret only (req.authMethod === 'api-secret').
 */
router.post('/config-update', (req, res) => {
  if (req.authMethod !== 'api-secret') {
    return res.status(403).json({ error: 'This endpoint requires API secret authentication' });
  }

  const { guildId, path, value } = req.body || {};

  if (!guildId || typeof guildId !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "guildId" in request body' });
  }

  if (!path || typeof path !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "path" in request body' });
  }

  if (value === undefined) {
    return res.status(400).json({ error: 'Missing "value" in request body' });
  }

  const topLevelKey = path.split('.')[0];
  if (!SAFE_CONFIG_KEYS.includes(topLevelKey)) {
    return res.status(403).json({ error: 'Modifying this config key is not allowed' });
  }

  if (!path.includes('.')) {
    return res
      .status(400)
      .json({ error: 'Config path must include at least one dot separator (e.g., "ai.model")' });
  }

  const segments = path.split('.');
  if (segments.some((s) => s === '')) {
    return res.status(400).json({ error: 'Config path contains empty segments' });
  }

  setConfigValue(path, value, guildId)
    .then(() => {
      const effectiveConfig = getConfig(guildId);
      const effectiveSection = effectiveConfig[topLevelKey] || {};
      info('Config updated via dashboard webhook', { path, guildId });
      res.json(effectiveSection);
    })
    .catch((err) => {
      error('Failed to update config via dashboard webhook', { path, error: err.message });
      res.status(500).json({ error: 'Failed to update config' });
    });
});

export default router;
