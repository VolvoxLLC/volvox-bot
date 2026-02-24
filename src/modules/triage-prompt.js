/**
 * Triage Prompt Builders
 * Constructs classifier and responder prompts from templates and message data.
 */

import { loadPrompt } from '../prompts/index.js';

// ── Conversation text formatting ─────────────────────────────────────────────

/**
 * Build conversation text with message IDs for prompts.
 * Splits output into <recent-history> (context) and <messages-to-evaluate> (buffer).
 * Includes timestamps and reply context when available.
 *
 * @param {Array} context - Historical messages fetched from Discord API
 * @param {Array} buffer - Buffered messages to evaluate
 * @returns {string} Formatted conversation text with section markers
 */
export function buildConversationText(context, buffer) {
  const formatMsg = (m) => {
    const time = m.timestamp ? new Date(m.timestamp).toISOString().slice(11, 19) : '';
    const timePrefix = time ? `[${time}] ` : '';
    const replyPrefix = m.replyTo
      ? `(replying to ${m.replyTo.author}: "${m.replyTo.content.slice(0, 100)}")\n  `
      : '';
    return `${timePrefix}[${m.messageId}] ${m.author} (<@${m.userId}>): ${replyPrefix}${m.content}`;
  };

  let text = '';
  if (context.length > 0) {
    text += '<recent-history>\n';
    text += context.map(formatMsg).join('\n');
    text += '\n</recent-history>\n\n';
  }
  text += '<messages-to-evaluate>\n';
  text += buffer.map(formatMsg).join('\n');
  text += '\n</messages-to-evaluate>';
  return text;
}

// ── Prompt builders ─────────────────────────────────────────────────────────

/**
 * Build the classifier prompt from the template.
 * @param {Array} context - Historical context messages
 * @param {Array} snapshot - Buffer snapshot (messages to evaluate)
 * @param {string} [botUserId] - The bot's own Discord user ID
 * @returns {string} Interpolated classify prompt
 */
export function buildClassifyPrompt(context, snapshot, botUserId) {
  const conversationText = buildConversationText(context, snapshot);
  const communityRules = loadPrompt('community-rules');
  return loadPrompt('triage-classify', {
    conversationText,
    communityRules,
    botUserId: botUserId || 'unknown',
  });
}

/**
 * Build the responder prompt from the template.
 * @param {Array} context - Historical context messages
 * @param {Array} snapshot - Buffer snapshot (messages to evaluate)
 * @param {Object} classification - Parsed classifier output
 * @param {Object} config - Bot configuration
 * @param {string} [memoryContext] - Memory context for target users
 * @returns {string} Interpolated respond prompt
 */
export function buildRespondPrompt(context, snapshot, classification, config, memoryContext) {
  const conversationText = buildConversationText(context, snapshot);
  const communityRules = loadPrompt('community-rules');
  const antiAbuse = loadPrompt('anti-abuse');
  const systemPrompt = config.ai?.systemPrompt || loadPrompt('default-personality', { antiAbuse });
  const searchGuardrails = loadPrompt('search-guardrails');

  return loadPrompt('triage-respond', {
    systemPrompt,
    communityRules,
    conversationText,
    classification: classification.classification,
    reasoning: classification.reasoning,
    targetMessageIds: JSON.stringify(classification.targetMessageIds),
    memoryContext: memoryContext || '',
    antiAbuse,
    searchGuardrails,
  });
}
