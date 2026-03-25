/**
 * Welcome API Routes
 * Provides dashboard preview for welcome message templates
 */

import { Router } from 'express';
import { getConfig } from '../../modules/config.js';
import {
  pickWelcomeVariant,
  renderWelcomeMessage,
  resolveWelcomeTemplate,
} from '../../modules/welcome.js';

const router = Router({ mergeParams: true });

/**
 * POST /guilds/:id/welcome/preview
 *
 * Render a welcome message template with mock or provided member data.
 * Used by the dashboard to preview how a message will look.
 *
 * Body (all fields optional):
 *   - template   {string}  Template to preview (overrides config)
 *   - variants   {string[]}  Variants array to preview (overrides config)
 *   - channelId  {string}  Channel ID to resolve per-channel config
 *   - member     {object}  Mock member data: { id, username }
 *   - guild      {object}  Mock guild data: { name, memberCount }
 *
 * Returns: { rendered: string, template: string }
 */
router.post('/preview', (req, res) => {
  const guildId = req.params.id;
  const config = getConfig(guildId) || {};
  const welcomeConfig = config.welcome || {};

  // Mock defaults
  const member = {
    id: req.body?.member?.id || '123456789',
    username: req.body?.member?.username || 'ExampleUser',
  };

  const guild = {
    name: req.body?.guild?.name || config.welcome?.guildName || 'Your Server',
    memberCount: req.body?.guild?.memberCount ?? 42,
  };

  // Resolve template: explicit body > per-channel config > global config
  let template;
  if (typeof req.body?.template === 'string') {
    template = req.body.template;
  } else if (Array.isArray(req.body?.variants) && req.body.variants.length > 0) {
    template = pickWelcomeVariant(req.body.variants, welcomeConfig.message);
  } else if (req.body?.channelId) {
    template = resolveWelcomeTemplate(req.body.channelId, welcomeConfig);
  } else {
    template = resolveWelcomeTemplate(welcomeConfig.channelId, welcomeConfig);
  }

  const rendered = renderWelcomeMessage(template, member, guild);

  return res.json({ rendered, template });
});

/**
 * GET /guilds/:id/welcome/variables
 *
 * Return the list of supported template variables and their descriptions.
 * Useful for dashboard tooltip/autocomplete.
 */
router.get('/variables', (_req, res) => {
  return res.json({
    variables: [
      { variable: '{user}', description: 'Discord mention of the new member (e.g. <@123>)' },
      { variable: '{username}', description: 'Plain username of the new member' },
      { variable: '{server}', description: 'Name of the server' },
      { variable: '{memberCount}', description: 'Current member count' },
      { variable: '{greeting}', description: 'Time-of-day greeting line (dynamic)' },
      { variable: '{vibeLine}', description: 'Community activity description (dynamic)' },
      { variable: '{ctaLine}', description: 'Suggested channels call-to-action (dynamic)' },
      { variable: '{milestoneLine}', description: 'Member milestone or count line (dynamic)' },
      { variable: '{timeOfDay}', description: 'morning, afternoon, evening, or night (dynamic)' },
      { variable: '{activityLevel}', description: 'quiet, light, steady, busy, or hype (dynamic)' },
      { variable: '{topChannels}', description: 'Most active channel mentions (dynamic)' },
    ],
  });
});

export default router;
