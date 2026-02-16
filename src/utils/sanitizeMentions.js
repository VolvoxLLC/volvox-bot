/**
 * Mention Sanitization Utility
 * Defense-in-depth layer to strip @everyone and @here from outgoing messages.
 * Even though allowedMentions is set at the Client level, this ensures
 * the raw text never contains these pings.
 *
 * @see https://github.com/BillChirico/bills-bot/issues/61
 */

/**
 * Zero-width space character used to break mention parsing.
 * Inserted after '@' so Discord doesn't recognize the mention.
 */
const ZWS = '\u200B';

/**
 * Pattern matching @everyone and @here mentions.
 * Uses a negative lookbehind for word characters to avoid false positives
 * in email addresses (e.g. user@everyone.com should NOT be mutated).
 *
 * Discord treats @everyone and @here as case-sensitive — only exact
 * lowercase forms trigger mass pings. @Everyone, @HERE, etc. are NOT
 * parsed as mentions by Discord, so we intentionally omit the /i flag.
 */
const MENTION_PATTERN = /(?<!\w)@(everyone|here)\b/g;

/**
 * Sanitize a message string by escaping @everyone and @here mentions.
 * Inserts a zero-width space after '@' to prevent Discord from parsing them.
 *
 * - Normal user mentions like <@123456> are NOT affected
 * - Returns non-string inputs unchanged (null, undefined, numbers, etc.)
 *
 * @param {*} text - The text to sanitize
 * @returns {*} The sanitized text, or the original value if not a string
 */
export function sanitizeMentions(text) {
  if (typeof text !== 'string') {
    return text;
  }

  return text.replace(MENTION_PATTERN, `@${ZWS}$1`);
}

/**
 * Sanitize a plain embed data object's string fields.
 * Sanitizes title, description, footer.text, author.name,
 * and all fields[].name / fields[].value.
 *
 * @param {object} data - A plain embed data object
 * @returns {object} A new object with sanitized string fields
 */
function sanitizeEmbedData(data) {
  const result = { ...data };

  result.title = sanitizeMentions(result.title);
  result.description = sanitizeMentions(result.description);

  if (result.footer && typeof result.footer === 'object') {
    result.footer = { ...result.footer, text: sanitizeMentions(result.footer.text) };
  }

  if (result.author && typeof result.author === 'object') {
    result.author = { ...result.author, name: sanitizeMentions(result.author.name) };
  }

  if (Array.isArray(result.fields)) {
    result.fields = result.fields.map((field) => ({
      ...field,
      name: sanitizeMentions(field.name),
      value: sanitizeMentions(field.value),
    }));
  }

  return result;
}

/**
 * Sanitize a single embed object's string fields.
 * Handles both plain embed objects and EmbedBuilder instances
 * (preserving the class prototype so methods like .toJSON() still work).
 *
 * @param {object} embed - A Discord embed object or EmbedBuilder
 * @returns {object} A new embed with sanitized string fields
 */
function sanitizeEmbed(embed) {
  if (!embed || typeof embed !== 'object') {
    return embed;
  }

  // EmbedBuilder instances store data in .data — sanitize that
  // while preserving the prototype chain (e.g. .toJSON()).
  if ('data' in embed && typeof embed.toJSON === 'function') {
    const clone = Object.create(Object.getPrototypeOf(embed));
    Object.assign(clone, embed);
    clone.data = sanitizeEmbedData(clone.data);
    return clone;
  }

  return sanitizeEmbedData(embed);
}

/**
 * Sanitize a single component object (button, select menu, etc.).
 * Handles ActionRow containers recursively.
 *
 * @param {object} component - A Discord message component
 * @returns {object} A new component with sanitized string fields
 */
function sanitizeComponent(component) {
  if (!component || typeof component !== 'object') {
    return component;
  }

  const result = { ...component };

  result.label = sanitizeMentions(result.label);
  result.placeholder = sanitizeMentions(result.placeholder);

  if (Array.isArray(result.options)) {
    result.options = result.options.map((opt) => ({
      ...opt,
      label: sanitizeMentions(opt.label),
      description: sanitizeMentions(opt.description),
    }));
  }

  // ActionRow: recurse into nested components
  if (Array.isArray(result.components)) {
    result.components = result.components.map(sanitizeComponent);
  }

  return result;
}

/**
 * Sanitize the content, embed, and component fields of a message options object.
 * If given a string, sanitizes it directly.
 * If given an object, sanitizes content, embeds, and components.
 * Returns other types unchanged.
 *
 * Defense-in-depth: sanitizes all user-visible text fields so raw
 * @everyone/@here never appears, even though allowedMentions also
 * prevents Discord from parsing them.
 *
 * @param {string|object|*} options - Message content or options object
 * @returns {string|object|*} Sanitized version
 */
export function sanitizeMessageOptions(options) {
  if (typeof options === 'string') {
    return sanitizeMentions(options);
  }

  if (options && typeof options === 'object') {
    const result = { ...options };

    if ('content' in result) {
      result.content = sanitizeMentions(result.content);
    }

    if (Array.isArray(result.embeds)) {
      result.embeds = result.embeds.map(sanitizeEmbed);
    }

    if (Array.isArray(result.components)) {
      result.components = result.components.map(sanitizeComponent);
    }

    return result;
  }

  return options;
}
