/**
 * Shared payload builder for sendDm and announce action handlers.
 * Constructs Discord message options from action config and template context.
 */

import { EmbedBuilder } from 'discord.js';
import { warn } from '../../logger.js';
import { renderTemplate } from '../../utils/templateEngine.js';

const MAX_EMBED_FIELDS = 25;
const MAX_EMBED_TITLE_LENGTH = 256;
const MAX_EMBED_DESCRIPTION_LENGTH = 4096;
const MAX_FOOTER_TEXT_LENGTH = 2048;

function renderFooter(footer, templateContext) {
  if (!footer) {
    return undefined;
  }

  const footerConfig =
    typeof footer === 'string'
      ? {
          text: renderTemplate(footer, templateContext).slice(0, MAX_FOOTER_TEXT_LENGTH),
        }
      : {
          text: renderTemplate(footer.text ?? '', templateContext).slice(0, MAX_FOOTER_TEXT_LENGTH),
          iconURL: footer.iconURL ? renderTemplate(footer.iconURL, templateContext) : undefined,
        };

  const hasText = footerConfig.text.trim().length > 0;
  const hasIconUrl = typeof footerConfig.iconURL === 'string' && footerConfig.iconURL.length > 0;

  if (!hasText && !hasIconUrl) {
    return undefined;
  }

  return {
    ...footerConfig,
    text: hasText ? footerConfig.text : '\u200b',
  };
}

/**
 * Build a Discord message payload from action config and template context.
 *
 * @param {Object} action - { format: 'text'|'embed'|'both', template, embed }
 * @param {Object} templateContext
 * @returns {Object} Discord message options
 */
export function buildPayload(action, templateContext) {
  const payload = {};

  const format = action.format ?? 'text';

  if (format === 'text' || format === 'both') {
    payload.content = renderTemplate(action.template ?? '', templateContext);
  }

  if (format === 'embed' || format === 'both') {
    const embedConfig = action.embed ?? {};
    const embed = new EmbedBuilder();
    if (embedConfig.title)
      embed.setTitle(
        renderTemplate(embedConfig.title, templateContext).slice(0, MAX_EMBED_TITLE_LENGTH),
      );
    if (embedConfig.description)
      embed.setDescription(
        renderTemplate(embedConfig.description, templateContext).slice(
          0,
          MAX_EMBED_DESCRIPTION_LENGTH,
        ),
      );
    if (embedConfig.color) embed.setColor(embedConfig.color);
    if (embedConfig.thumbnail)
      embed.setThumbnail(renderTemplate(embedConfig.thumbnail, templateContext));
    if (Array.isArray(embedConfig.fields) && embedConfig.fields.length > 0) {
      if (embedConfig.fields.length > MAX_EMBED_FIELDS) {
        warn('Level-up action embed fields exceed Discord limit, truncating', {
          fieldCount: embedConfig.fields.length,
          maxFields: MAX_EMBED_FIELDS,
        });
      }

      embed.addFields(
        embedConfig.fields.slice(0, MAX_EMBED_FIELDS).map((field) => ({
          name: renderTemplate(field.name || '\u200b', templateContext).slice(0, 256) || '\u200b',
          value:
            renderTemplate(field.value || '\u200b', templateContext).slice(0, 1024) || '\u200b',
          inline: Boolean(field.inline),
        })),
      );
    }
    if (embedConfig.footer) {
      const footerConfig = renderFooter(embedConfig.footer, templateContext);
      if (footerConfig) {
        embed.setFooter(footerConfig);
      }
    }
    if (embedConfig.image) {
      embed.setImage(renderTemplate(embedConfig.image, templateContext));
    }
    if (embedConfig.timestamp) {
      embed.setTimestamp();
    }
    payload.embeds = [embed];
  }

  return payload;
}
