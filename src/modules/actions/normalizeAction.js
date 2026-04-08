/**
 * XP action normalization helpers.
 * Bridges legacy config payloads and the richer dashboard action editor shape.
 */

function normalizeEmbedFields(fields) {
  if (!Array.isArray(fields)) {
    return [];
  }

  return fields
    .map((field) => ({
      name: typeof field?.name === 'string' ? field.name : '',
      value: typeof field?.value === 'string' ? field.value : '',
      inline: Boolean(field?.inline),
    }))
    .filter((field) => field.name || field.value);
}

function normalizeThumbnail(embed) {
  if (typeof embed.thumbnail === 'string') {
    return embed.thumbnail;
  }

  if (embed.thumbnailType === 'user_avatar') {
    return '{{avatar}}';
  }

  if (embed.thumbnailType === 'server_icon') {
    return '{{serverIcon}}';
  }

  if (embed.thumbnailType === 'custom' && typeof embed.thumbnailUrl === 'string') {
    return embed.thumbnailUrl;
  }

  return undefined;
}

function normalizeFooterValue(text, iconURL) {
  const footerText = typeof text === 'string' ? text : '';
  const footerIconURL = typeof iconURL === 'string' ? iconURL : undefined;

  if (footerText.trim().length === 0 && !footerIconURL) {
    return undefined;
  }

  return {
    text: footerText,
    iconURL: footerIconURL,
  };
}

function normalizeFooter(embed) {
  if (typeof embed.footer === 'string') {
    return normalizeFooterValue(embed.footer);
  }

  if (embed.footer && typeof embed.footer === 'object' && !Array.isArray(embed.footer)) {
    return normalizeFooterValue(embed.footer.text, embed.footer.iconURL);
  }

  if (typeof embed.footerText === 'string' || typeof embed.footerIconUrl === 'string') {
    return normalizeFooterValue(embed.footerText, embed.footerIconUrl);
  }

  return undefined;
}

function normalizeImage(embed) {
  if (typeof embed.image === 'string') {
    return embed.image;
  }

  if (typeof embed.imageUrl === 'string') {
    return embed.imageUrl;
  }

  return undefined;
}

function normalizeTimestamp(embed) {
  return embed.timestamp === true || embed.showTimestamp === true;
}

function normalizeEmbed(embed) {
  if (!embed || typeof embed !== 'object' || Array.isArray(embed)) {
    return undefined;
  }

  return {
    title: typeof embed.title === 'string' ? embed.title : '',
    description: typeof embed.description === 'string' ? embed.description : '',
    color: embed.color,
    thumbnail: normalizeThumbnail(embed),
    fields: normalizeEmbedFields(embed.fields),
    footer: normalizeFooter(embed),
    image: normalizeImage(embed),
    timestamp: normalizeTimestamp(embed),
  };
}

/**
 * Normalize a single XP action into the runtime shape expected by handlers.
 *
 * @param {Object} action
 * @returns {Object}
 */
export function normalizeXpAction(action) {
  if (!action || typeof action !== 'object') {
    return action;
  }

  const normalized = { ...action };

  if (typeof normalized.message === 'string' && !normalized.template) {
    normalized.template = normalized.message;
  }

  if (
    normalized.type === 'nickPrefix' &&
    typeof normalized.prefix === 'string' &&
    !normalized.template
  ) {
    normalized.template = normalized.prefix;
  }

  if (
    normalized.type === 'nickSuffix' &&
    typeof normalized.suffix === 'string' &&
    !normalized.template
  ) {
    normalized.template = normalized.suffix;
  }

  if (normalized.embed) {
    normalized.embed = normalizeEmbed(normalized.embed);
  }

  return normalized;
}
