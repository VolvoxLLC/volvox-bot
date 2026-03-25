/**
 * Template Interpolation Engine
 * Replaces {{variable}} tokens in strings with values from a context object.
 * Used by level-up actions for DMs, announcements, embeds, and webhooks.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/367
 */

/** Matches `{{variableName}}` tokens. Only word characters allowed inside braces. */
const TEMPLATE_REGEX = /\{\{(\w+)\}\}/g;

/**
 * Replace `{{variable}}` tokens in a template string with values from context.
 * - Known variables with a value: replaced with the value.
 * - Known variables with null/undefined: replaced with empty string.
 * - Unknown tokens (key not in context): left as-is.
 *
 * @param {string} template - Template string with `{{variable}}` placeholders.
 * @param {Record<string, string | null | undefined>} context - Variable name → value map.
 * @returns {string} Rendered string.
 */
export function renderTemplate(template, context) {
  if (!template) return '';
  return template.replace(TEMPLATE_REGEX, (match, varName) => {
    if (!(varName in context)) return match;
    return context[varName] ?? '';
  });
}

/**
 * Check whether a string is within a character limit.
 *
 * @param {string} text - The text to validate.
 * @param {number} limit - Maximum allowed character count.
 * @returns {{ valid: boolean, length: number, limit: number }}
 */
export function validateLength(text, limit) {
  const length = text.length;
  return { valid: length <= limit, length, limit };
}
