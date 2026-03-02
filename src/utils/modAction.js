/**
 * Moderation Action Helper
 * Encapsulates the shared boilerplate across moderation commands:
 * deferReply, config, target resolution, hierarchy check, DM, action,
 * case creation, mod log, success reply, and error handling.
 */

import { debug, info, error as logError, warn } from '../logger.js';
import { getConfig } from '../modules/config.js';
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
    const options = extractOptions
      ? extractOptions(interaction)
      : { reason: interaction.options.getString('reason') };

    // Allow extractOptions to short-circuit (e.g. invalid duration)
    if (options.earlyReturn) {
      return await safeEditReply(interaction, options.earlyReturn);
    }

    const { reason, ...rawExtraCaseData } = options;
    const extraCaseData = Object.fromEntries(
      Object.entries(rawExtraCaseData).filter(([k]) => !k.startsWith('_')),
    );

    // Resolve target
    const targetResult = getTarget(interaction, config);

    // Allow getTarget to short-circuit (e.g. user not in server)
    if (targetResult.earlyReturn) {
      return await safeEditReply(interaction, targetResult.earlyReturn);
    }

    // Await if getTarget returns a promise
    const resolved = targetResult.then ? await targetResult : targetResult;
    if (resolved.earlyReturn) {
      return await safeEditReply(interaction, resolved.earlyReturn);
    }

    const { target, targetId, targetTag } = resolved;

    // Self-moderation is always blocked, even when skipProtection is true
    if (target && target.id === interaction.user.id) {
      return await safeEditReply(interaction, '\u274C You cannot moderate yourself.');
    }

    // Protected-role check (skipped when skipProtection is true)
    if (!skipProtection && target) {
      if (isProtectedTarget(target, interaction.guild, config)) {
        warn('Moderation blocked: target is a protected role', {
          action,
          targetId: target.id,
          targetTag,
          moderatorId: interaction.user.id,
          guildId: interaction.guildId,
        });
        return await safeEditReply(interaction, '\u274C Cannot moderate a protected user.');
      }
    }

    // Hierarchy check
    if (!skipHierarchy && target) {
      const hierarchyError = checkHierarchy(
        interaction.member,
        target,
        interaction.guild.members.me,
      );
      if (hierarchyError) {
        return await safeEditReply(interaction, hierarchyError);
      }
    }

    // DM notification
    if (!skipDm && target) {
      if (shouldSendDm(config, dmAction || action)) {
        await sendDmNotification(target, dmAction || action, reason, interaction.guild.name);
      }
    }

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
