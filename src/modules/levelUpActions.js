/**
 * Level-Up Action Pipeline
 * Executes an ordered list of configurable actions when a user levels up.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/365
 */

import { info, warn } from '../logger.js';
import { buildTemplateContext } from '../utils/templateEngine.js';
import { handleAddReaction } from './actions/addReaction.js';
import { handleAnnounce } from './actions/announce.js';
import { handleGrantRole } from './actions/grantRole.js';
import { handleNickPrefix, handleNickSuffix } from './actions/nickPrefix.js';
import { handleRemoveRole } from './actions/removeRole.js';
import { checkRoleRateLimit, collectXpManagedRoles } from './actions/roleUtils.js';
import { handleSendDm } from './actions/sendDm.js';
import { handleWebhook } from './actions/webhook.js';
import { handleXpBonus } from './actions/xpBonus.js';

/**
 * Action handler registry: action type → async handler function.
 * @type {Map<string, (action: Object, context: Object) => Promise<void>>}
 */
const actionRegistry = new Map();

/**
 * Register an action handler for a given type.
 * Used internally for built-in actions and externally for Phase 2 additions.
 *
 * @param {string} type - Action type identifier (e.g. 'grantRole').
 * @param {(action: Object, context: Object) => Promise<void>} handler
 */
export function registerAction(type, handler) {
  actionRegistry.set(type, handler);
}

// Register built-in action handlers
registerAction('grantRole', handleGrantRole);
registerAction('removeRole', handleRemoveRole);
registerAction('sendDm', handleSendDm);
registerAction('announce', handleAnnounce);
registerAction('addReaction', handleAddReaction);

// Register Phase 2 action handlers
registerAction('xpBonus', handleXpBonus);
registerAction('nickPrefix', handleNickPrefix);
registerAction('nickSuffix', handleNickSuffix);
registerAction('webhook', handleWebhook);

/**
 * Resolve the ordered list of actions to execute for a level-up.
 * Handles level skips by collecting actions for every crossed level.
 *
 * @param {number} previousLevel
 * @param {number} newLevel
 * @param {Object} config - The resolved `config.xp` section.
 * @returns {Array<{level: number, action: Object}>} Ordered action list.
 */
export function resolveActions(previousLevel, newLevel, config) {
  if (newLevel <= previousLevel) return [];

  const levelActionsMap = new Map();
  for (const entry of config.levelActions ?? []) {
    levelActionsMap.set(entry.level, entry.actions ?? []);
  }

  const result = [];
  for (let level = previousLevel + 1; level <= newLevel; level++) {
    const actions = levelActionsMap.has(level)
      ? levelActionsMap.get(level)
      : (config.defaultActions ?? []);

    for (const action of actions) {
      result.push({ level, action });
    }
  }

  return result;
}

/**
 * Execute the level-up action pipeline for a user who just leveled up.
 * Actions run sequentially. Failures are logged and skipped — the pipeline never throws.
 *
 * @param {Object} params
 * @param {import('discord.js').GuildMember} params.member
 * @param {import('discord.js').Message} params.message
 * @param {import('discord.js').Guild} params.guild
 * @param {number} params.previousLevel
 * @param {number} params.newLevel
 * @param {number} params.xp
 * @param {Object} params.config - The resolved `config.xp` section.
 */
export async function executeLevelUpPipeline({
  member,
  message,
  guild,
  previousLevel,
  newLevel,
  xp,
  config,
}) {
  const actions = resolveActions(previousLevel, newLevel, config);
  if (actions.length === 0) return;

  info('Executing level-up pipeline', {
    guildId: guild.id,
    userId: member.user?.id,
    previousLevel,
    newLevel,
    actionCount: actions.length,
  });

  // Check rate limit and track remaining quota (2 changes per pipeline)
  // Note: We don't return early here - rate limit only skips role actions, not the whole pipeline
  const rateLimitOk = checkRoleRateLimit(guild.id, member.user?.id);
  let roleChangesRemaining = rateLimitOk ? 2 : 0;

  // Compute XP-managed roles once for stack/replace logic
  const xpManagedRoles = collectXpManagedRoles(config);

  // Build base pipeline context
  const basePipelineContext = {
    member,
    message,
    guild,
    previousLevel,
    newLevel,
    xp,
    config,
    xpManagedRoles,
  };

  // Cache template contexts per level to avoid duplicate DB queries
  const templateContextCache = new Map();

  for (const { level, action } of actions) {
    // Track previousLevel incrementally for correct intermediate level context
    const levelPreviousLevel = level - 1;

    // Rebuild template context for each intermediate level during level-skip
    // Cache per level to avoid duplicate DB queries
    let templateContext = templateContextCache.get(level);
    if (!templateContext) {
      try {
        templateContext = await buildTemplateContext({
          member,
          message,
          guild,
          level,
          previousLevel: levelPreviousLevel,
          xp,
          levelThresholds: config.levelThresholds ?? [],
          roleName: null,
          roleId: null,
        });
        templateContextCache.set(level, templateContext);
      } catch (err) {
        warn('Template context build failed — continuing with empty context', {
          level,
          guildId: guild.id,
          userId: member.user?.id,
          error: err.message,
        });
        templateContext = {};
        templateContextCache.set(level, templateContext);
      }
    }

    const pipelineContext = { ...basePipelineContext, templateContext, currentLevel: level };

    const handler = actionRegistry.get(action.type);
    if (!handler) {
      warn('Unknown action type — skipping', {
        actionType: action.type,
        level,
        guildId: guild.id,
      });
      continue;
    }

    // Skip role-related actions if rate limit quota is exhausted
    if (action.type === 'grantRole' || action.type === 'removeRole') {
      if (roleChangesRemaining <= 0) {
        warn('Role action skipped due to rate limit quota exhausted', {
          actionType: action.type,
          level,
          guildId: guild.id,
          userId: member.user?.id,
        });
        continue;
      }
      roleChangesRemaining--;
    }

    try {
      await handler(action, pipelineContext);
    } catch (err) {
      warn('Action failed in level-up pipeline — continuing', {
        actionType: action.type,
        level,
        guildId: guild.id,
        userId: member.user?.id,
        error: err.message,
      });
    }
  }
}
