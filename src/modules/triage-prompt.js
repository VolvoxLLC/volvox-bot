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
 * Replaces `&` with `&amp;`, `<` with `&lt;`, and `>` with `&gt;` so the LLM sees
 * literal characters without interpreting them as structural delimiters or entities.
 *
 * @param {*} text - Raw user-supplied message content (non-strings pass through)
 * @returns {*} Escaped text safe for insertion between XML-style tags, or the original value when the input is not a string
 */
export function escapePromptDelimiters(text) {
  if (typeof text !== 'string') return text;
  // Escape & first so subsequent replacements don't double-encode (prevents &lt; bypass)
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Conversation text formatting ─────────────────────────────────────────────

/**
 * Build a structured conversation text for prompts including optional channel metadata.
 *
 * Produces sections: an optional <channel-context> (Channel and optional Topic) taken from the first entry that contains channel metadata, a <recent-history> block for `context` messages (when present), and a <messages-to-evaluate> block for `buffer` messages. Each message line contains an optional timestamp, messageId, author, user mention, optional reply excerpt, and the message content. User-supplied content is escaped to neutralize XML-style delimiters and reduce prompt-injection risk.
 *
 * @param {Array} context - Historical messages to include in <recent-history>.
 * @param {Array} buffer - Messages to include in <messages-to-evaluate>.
 * @returns {string} The formatted conversation text containing the assembled sections.
 */
export function buildConversationText(context, buffer) {
  const formatMsg = (m) => {
    const time = m.timestamp ? new Date(m.timestamp).toISOString().slice(11, 19) : '';
    const timePrefix = time ? `[${time}] ` : '';
    const replyPrefix = m.replyTo
      ? `(replying to ${escapePromptDelimiters(m.replyTo.author)}: "${escapePromptDelimiters((m.replyTo.content ?? '').slice(0, 100))}")\n  `
      : '';
    return `${timePrefix}[${m.messageId}] ${escapePromptDelimiters(m.author)} (<@${m.userId}>): ${replyPrefix}${escapePromptDelimiters(m.content)}`;
  };

  let text = '';

  // Extract channel metadata from the first available entry
  const allEntries = [...buffer, ...context];
  const channelEntry = allEntries.find((m) => m.channelName);
  if (channelEntry) {
    text += '<channel-context>\n';
    text += `Channel: #${escapePromptDelimiters(channelEntry.channelName)}\n`;
    if (channelEntry.channelTopic) {
      text += `Topic: ${escapePromptDelimiters(channelEntry.channelTopic ?? '')}\n`;
    }
    text += '</channel-context>\n\n';
  }

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
 * Construct the responder prompt by combining conversation text, community rules, the system prompt, classification results, optional memory context, and search guardrails.
 * @param {Array} context - Historical context messages used to build conversation text.
 * @param {Array} snapshot - Buffer snapshot containing messages to evaluate.
 * @param {Object} classification - Classifier output containing decision details.
 * @param {string} classification.classification - The classification label.
 * @param {string} classification.reasoning - Explanatory reasoning for the classification.
 * @param {Array<string>} classification.targetMessageIds - IDs of messages targeted by the classification.
 * @param {Object} config - Bot configuration; `config.ai.systemPrompt` (if present) overrides the default system prompt.
 * @param {string} [memoryContext] - Optional serialized memory context to include for target users.
 * @returns {string} The fully interpolated responder prompt ready for the model. */
export function buildRespondPrompt(context, snapshot, classification, config, memoryContext) {
  const conversationText = buildConversationText(context, snapshot);
  const communityRules = loadPrompt('community-rules');
  const systemPrompt = config.ai?.systemPrompt || 'You are a helpful Discord bot.';
  const searchGuardrails = loadPrompt('search-guardrails');

  return loadPrompt('triage-respond', {
    systemPrompt,
    communityRules,
    conversationText,
    classification: classification.classification,
    reasoning: classification.reasoning,
    targetMessageIds: JSON.stringify(classification.targetMessageIds),
    memoryContext: memoryContext || '',
    searchGuardrails,
  });
}
