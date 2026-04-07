/**
 * XP action normalization helpers.
 * Bridges legacy config payloads and the richer dashboard action editor shape.
 */

function normalizeEmbed(embed) {
  if (!embed || typeof embed !== 'object' || Array.isArray(embed)) {
    return undefined;
  }

  const normalized = {
    title: typeof embed.title === 'string' ? embed.title : '',
    description: typeof embed.description === 'string' ? embed.description : '',
    color: embed.color,
    thumbnail: undefined,
    fields: Array.isArray(embed.fields)
      ? embed.fields
          .map((field) => ({
            name: typeof field?.name === 'string' ? field.name : '',
            value: typeof field?.value === 'string' ? field.value : '',
            inline: Boolean(field?.inline),
          }))
          .filter((field) => field.name || field.value)
      : [],
    footer: undefined,
    image: typeof embed.image === 'string' ? embed.image : undefined,
    timestamp: embed.timestamp === true,
  };

  if (typeof embed.thumbnail === 'string') {
    normalized.thumbnail = embed.thumbnail;
  } else if (embed.thumbnailType === 'user_avatar') {
    normalized.thumbnail = '{{avatar}}';
  } else if (embed.thumbnailType === 'server_icon') {
    normalized.thumbnail = '{{serverIcon}}';
  } else if (embed.thumbnailType === 'custom' && typeof embed.thumbnailUrl === 'string') {
    normalized.thumbnail = embed.thumbnailUrl;
  }

  if (typeof embed.footer === 'string') {
    normalized.footer = { text: embed.footer };
  } else if (embed.footer && typeof embed.footer === 'object' && !Array.isArray(embed.footer)) {
    normalized.footer = {
      text: typeof embed.footer.text === 'string' ? embed.footer.text : '',
      iconURL: typeof embed.footer.iconURL === 'string' ? embed.footer.iconURL : undefined,
    };
  } else if (typeof embed.footerText === 'string' || typeof embed.footerIconUrl === 'string') {
    normalized.footer = {
      text: typeof embed.footerText === 'string' ? embed.footerText : '',
      iconURL: typeof embed.footerIconUrl === 'string' ? embed.footerIconUrl : undefined,
    };
  }

  if (typeof embed.imageUrl === 'string' && !normalized.image) {
    normalized.image = embed.imageUrl;
  }

  if (embed.showTimestamp === true) {
    normalized.timestamp = true;
  }

  return normalized;
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
