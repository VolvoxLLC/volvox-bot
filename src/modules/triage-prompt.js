/**
 * Triage Prompt Builders
 * Constructs classifier and responder prompts from templates and message data.
 */

import { loadPrompt } from '../prompts/index.js';

// ── Prompt injection defense ──────────────────────────────────────────────────

/**
 * Escape XML-style delimiter characters in user-supplied content to prevent
 * prompt injection attacks. A crafted message containing `</messages-to-evaluate>`
 * could otherwise break out of its designated section and inject instructions.
 *
 * Replaces `<` with `&lt;` and `>` with `&gt;` so the LLM sees the literal
 * characters without interpreting them as structural delimiters.
 *
 * @param {*} text - Raw user-supplied message content (non-strings pass through)
 * @returns {*} Escaped text safe for insertion between XML-style tags, or the original value when the input is not a string
 */
export function escapePromptDelimiters(text) {
  if (typeof text !== 'string') return text;
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Conversation text formatting ─────────────────────────────────────────────

/**
 * Build conversation text with message IDs for prompts.
 * Splits output into <recent-history> (context) and <messages-to-evaluate> (buffer).
 * Includes timestamps and reply context when available.
 *
 * User-supplied content (message body and reply excerpts) is passed through
 * {@link escapePromptDelimiters} to neutralise prompt-injection attempts.
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
      ? `(replying to ${escapePromptDelimiters(m.replyTo.author)}: "${escapePromptDelimiters(m.replyTo.content.slice(0, 100))}")\n  `
      : '';
    return `${timePrefix}[${m.messageId}] ${escapePromptDelimiters(m.author)} (<@${m.userId}>): ${replyPrefix}${escapePromptDelimiters(m.content)}`;
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
 * Construct the classifier prompt by interpolating the triage-classify template with conversation data and community rules.
 * @param {Array} context - Historical messages to include in the recent-history section.
 * @param {Array} snapshot - Messages to evaluate that will populate the messages-to-evaluate section.
 * @param {string} [botUserId] - The bot's Discord user ID; when omitted, 'unknown' is used.
 * @returns {string} The completed classifier prompt text.
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
  const systemPrompt = config.ai?.systemPrompt || 'You are a helpful Discord bot.';
  const antiAbuse = loadPrompt('anti-abuse');
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
