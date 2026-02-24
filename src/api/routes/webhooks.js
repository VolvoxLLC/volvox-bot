/**
 * Webhook Routes
 * Endpoints for receiving webhook notifications from external services (e.g. dashboard)
 */

import { Router } from 'express';
import { error, info } from '../../logger.js';
import { getConfig, setConfigValue } from '../../modules/config.js';
import { SAFE_CONFIG_KEYS } from '../utils/configAllowlist.js';
import { validateConfigPatchBody } from '../utils/validateConfigPatch.js';

const router = Router();

/**
 * POST /config-update — Receive a config update pushed from the dashboard.
 * Persists the change via setConfigValue.
 *
 * Body: { guildId: "123456", path: "ai.model", value: "claude-3" }
 *
 * Auth: API secret only (req.authMethod === 'api-secret').
 */
router.post('/config-update', async (req, res) => {
  if (req.authMethod !== 'api-secret') {
    return res.status(403).json({ error: 'This endpoint requires API secret authentication' });
  }

  const { guildId } = req.body || {};

  if (!guildId || typeof guildId !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "guildId" in request body' });
  }

  const result = validateConfigPatchBody(req.body, SAFE_CONFIG_KEYS);
  if (result.error) {
    const response = { error: result.error };
    if (result.details) response.details = result.details;
    return res.status(result.status).json(response);
  }

  const { path, value, topLevelKey } = result;

  try {
    await setConfigValue(path, value, guildId);
    const effectiveConfig = getConfig(guildId);
    const effectiveSection = effectiveConfig[topLevelKey] || {};
    info('Config updated via dashboard webhook', { path, guildId });
    return res.json(effectiveSection);
  } catch (err) {
    error('Failed to update config via dashboard webhook', { path, error: err.message });
    return res.status(500).json({ error: 'Failed to update config' });
  }
});

export default router;
