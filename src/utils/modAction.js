/**
 * Moderation Action Helper
 * Encapsulates the shared boilerplate across moderation commands:
 * deferReply, config, target resolution, hierarchy check, DM, action,
 * case creation, mod log, success reply, and error handling.
 */

import { debug, info, error as logError, warn } from '../logger.js';
import { getConfig } from '../modules/config.js';
import { getPool } from '../db.js';
import { logAuditEvent } from '../modules/auditLogger.js';
import {
  checkHierarchy,
  createCase,
  isProtectedTarget,
  sendDmNotification,
  sendModLogEmbed,
  shouldSendDm,
} from '../modules/moderation.js';
import { safeEditReply } from './safeSend.js';

/**
 * Extract and validate command options, filtering private keys.
 * @returns {{ options: Object, reason: string, extraCaseData: Object } | { earlyReturn: string }}
 */
function resolveOptions(interaction, extractOptions) {
  const options = extractOptions
    ? extractOptions(interaction)
    : { reason: interaction.options.getString('reason') };

  if (options.earlyReturn) return { earlyReturn: options.earlyReturn };

  const { reason, ...rawExtraCaseData } = options;
  const extraCaseData = Object.fromEntries(
    Object.entries(rawExtraCaseData).filter(([k]) => !k.startsWith('_')),
  );

  return { options, reason, extraCaseData };
}

/**
 * Resolve and validate the moderation target.
 * @returns {{ target, targetId, targetTag } | { earlyReturn: string }}
 */
async function resolveTarget(interaction, config, getTarget) {
  const targetResult = getTarget(interaction, config);

  if (targetResult.earlyReturn) return { earlyReturn: targetResult.earlyReturn };

  const resolved = targetResult.then ? await targetResult : targetResult;
  if (resolved.earlyReturn) return { earlyReturn: resolved.earlyReturn };

  return resolved;
}

/**
 * Run pre-action checks: self-moderation, protected target, hierarchy.
 * @returns {string|null} Error message string if blocked, null if checks pass.
 */
function runPreActionChecks(interaction, target, targetTag, action, opts) {
  const { skipProtection, skipHierarchy } = opts;

  if (target && target.id === interaction.user.id) {
    return '\u274C You cannot moderate yourself.';
  }

  if (!skipProtection && target && isProtectedTarget(target, interaction.guild)) {
    warn('Moderation blocked: target is a protected role', {
      action,
      targetId: target.id,
      targetTag,
      moderatorId: interaction.user.id,
      guildId: interaction.guildId,
    });
    return '\u274C Cannot moderate a protected user.';
  }

  if (!skipHierarchy && target) {
    const hierarchyError = checkHierarchy(interaction.member, target, interaction.guild.members.me);
    if (hierarchyError) return hierarchyError;
  }

  return null;
}

/**
 * Send DM notification if configured.
 */
async function maybeSendDm(config, target, action, dmAction, reason, guildName, skipDm) {
  if (skipDm || !target) return;
  if (shouldSendDm(config, dmAction || action)) {
    await sendDmNotification(target, dmAction || action, reason, guildName);
  }
}

/**
 * Execute a member-targeted moderation action with shared boilerplate.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {Object} opts
 * @param {string} opts.action - Action name for case/logging (e.g. 'ban', 'kick')
 * @param {Function} opts.getTarget - (interaction, config) => { target, user, targetId, targetTag }
 *   Must return the target info. `target` is the GuildMember (or null for unban).
 *   Return `{ earlyReturn: string }` to short-circuit with a user-facing reply.
 * @param {Function} [opts.actionFn] - async (target, reason, interaction, options) => void
 *   The unique Discord action. Receives the resolved `options` from `extractOptions`
 *   as the 4th parameter. Omit for warn (no Discord action).
 * @param {Function} [opts.extractOptions] - (interaction) => { reason, ...extra }
 *   Extract command options. Must include `reason`. Extras are spread into case data.
 *   Return `{ earlyReturn: string }` to short-circuit with a user-facing reply.
 *   Fields prefixed with `_` (e.g. `_durationMs`, `_channel`) are private to the
 *   command — they are passed to `actionFn` but excluded from case data by the
 *   `...extraCaseData` spread (callers must destructure them out).
 * @param {boolean} [opts.skipHierarchy=false] - Skip role hierarchy check
 * @param {boolean} [opts.skipProtection=false] - Skip protected-role check (e.g. unban)
 * @param {boolean} [opts.skipDm=false] - Skip DM notification
 * @param {string} [opts.dmAction] - Override action name for DM (e.g. tempban uses 'ban')
 * @param {Function} [opts.afterCase] - async (caseData, interaction, config) => void
 *   Hook after case creation (e.g. checkEscalation, scheduleAction)
 * @param {Function} [opts.formatReply] - (targetTag, caseData) => string
 *   Custom success reply. Defaults to "{targetTag} has been {action}ed."
 */
export async function executeModAction(interaction, opts) {
  const {
    action,
    getTarget,
    actionFn,
    extractOptions,
    skipHierarchy = false,
    skipProtection = false,
    skipDm = false,
    dmAction,
    afterCase,
    formatReply,
  } = opts;

  try {
    await interaction.deferReply({ ephemeral: true });

    const config = getConfig(interaction.guildId);

    // Extract options (reason + any extras like duration, deleteMessageDays)
    const optionsResult = resolveOptions(interaction, extractOptions);
    if (optionsResult.earlyReturn) {
      return await safeEditReply(interaction, optionsResult.earlyReturn);
    }
    const { options, reason, extraCaseData } = optionsResult;

    // Resolve target
    const targetResult = await resolveTarget(interaction, config, getTarget);
    if (targetResult.earlyReturn) {
      return await safeEditReply(interaction, targetResult.earlyReturn);
    }
    const { target, targetId, targetTag: rawTargetTag } = targetResult;

    // Build a descriptive tag that includes display name and username
    const resolvedTargetUser = target?.user || (await interaction.client.users.fetch(targetId).catch(() => null));
    const targetTag = resolvedTargetUser
      ? (resolvedTargetUser.globalName && resolvedTargetUser.globalName !== resolvedTargetUser.username
        ? `${resolvedTargetUser.globalName} (@${resolvedTargetUser.username})`
        : resolvedTargetUser.tag)
      : rawTargetTag;

    // Pre-action checks (self-mod, protected, hierarchy)
    const checkError = runPreActionChecks(interaction, target, targetTag, action, {
      skipProtection,
      skipHierarchy,
    });
    if (checkError) {
      return await safeEditReply(interaction, checkError);
    }

    // DM notification
    await maybeSendDm(config, target, action, dmAction, reason, interaction.guild.name, skipDm);

    // Execute the unique action
    if (actionFn) {
      await actionFn(target, reason, interaction, options);
    }

    // Create case
    const caseData = await createCase(interaction.guild.id, {
      action,
      targetId,
      targetTag,
      moderatorId: interaction.user.id,
      moderatorTag: interaction.user.tag,
      reason,
      ...extraCaseData,
    });

    // Send mod log
    await sendModLogEmbed(interaction.client, config, caseData);

    // Audit log
    await logAuditEvent(getPool(), {
      guildId: interaction.guild.id,
      userId: interaction.user.id,
      userTag: interaction.user.tag,
      action: `mod.${action}`,
      targetType: 'member',
      targetId,
      targetTag,
      details: {
        caseNumber: caseData.case_number,
        reason,
        ...extraCaseData,
      },
    });

    // Post-case hook
    if (afterCase) {
      await afterCase(caseData, interaction, config);
    }

    // Log and reply
    info(`User ${action}`, { target: targetTag, moderator: interaction.user.tag });

    const reply = formatReply
      ? formatReply(targetTag, caseData)
      : `\u2705 **${targetTag}** has been ${action}ed. (Case #${caseData.case_number})`;
    await safeEditReply(interaction, reply);
  } catch (err) {
    logError('Command error', { error: err.message, command: action });
    await safeEditReply(
      interaction,
      '\u274C An error occurred. Please try again or contact an administrator.',
    ).catch((catchErr) => {
      debug('Failed to send error reply', { error: catchErr.message, command: action });
    });
  }
}
