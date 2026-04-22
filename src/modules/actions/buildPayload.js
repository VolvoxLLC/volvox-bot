/**
 * Shared payload builder for sendDm and announce action handlers.
 * Constructs Discord message options from action config and template context.
 */

import { EmbedBuilder } from 'discord.js';
import { warn } from '../../logger.js';
import { renderTemplate } from '../../utils/templateEngine.js';

const MAX_EMBED_FIELDS = 25;
const MAX_EMBED_TEXT_LENGTH = 6000;
const MAX_EMBED_TITLE_LENGTH = 256;
const MAX_EMBED_DESCRIPTION_LENGTH = 4096;
const MAX_FOOTER_TEXT_LENGTH = 2048;
const MAX_FIELD_NAME_LENGTH = 256;
const MAX_FIELD_VALUE_LENGTH = 1024;

function createTextBudget(limit = MAX_EMBED_TEXT_LENGTH) {
  let remaining = limit;

  return {
    get remaining() {
      return remaining;
    },
    take(text, maxLength) {
      if (remaining <= 0) {
        return '';
      }

      const truncated = text.slice(0, Math.min(maxLength, remaining));
      remaining -= truncated.length;
      return truncated;
    },
  };
}

function renderBudgetedText(template, templateContext, budget, maxLength) {
  return budget.take(renderTemplate(template, templateContext), maxLength);
}

function renderFooter(footer, templateContext, budget) {
  if (!footer) {
    return undefined;
  }

  const footerConfig =
    typeof footer === 'string'
      ? {
          text: renderBudgetedText(footer, templateContext, budget, MAX_FOOTER_TEXT_LENGTH),
        }
      : {
          text: renderBudgetedText(
            footer.text ?? '',
            templateContext,
            budget,
            MAX_FOOTER_TEXT_LENGTH,
          ),
          iconURL: footer.iconURL ? renderOptionalUrl(footer.iconURL, templateContext) : undefined,
        };

  const hasText = footerConfig.text.trim().length > 0;
  const hasIconUrl =
    typeof footerConfig.iconURL === 'string' && footerConfig.iconURL.trim().length > 0;

  if (!hasText && !hasIconUrl) {
    return undefined;
  }

  return {
    text: hasText ? footerConfig.text : '\u200b',
    ...(hasIconUrl ? { iconURL: footerConfig.iconURL } : {}),
  };
}

function renderOptionalUrl(template, templateContext) {
  const rendered = renderTemplate(template, templateContext).trim();
  return rendered.length > 0 ? rendered : null;
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
    const textBudget = createTextBudget();

    if (embedConfig.title) {
      const title = renderBudgetedText(
        embedConfig.title,
        templateContext,
        textBudget,
        MAX_EMBED_TITLE_LENGTH,
      );

      if (title) {
        embed.setTitle(title);
      }
    }
    if (embedConfig.description) {
      const description = renderBudgetedText(
        embedConfig.description,
        templateContext,
        textBudget,
        MAX_EMBED_DESCRIPTION_LENGTH,
      );

      if (description) {
        embed.setDescription(description);
      }
    }
    if (embedConfig.color) embed.setColor(embedConfig.color);
    if (embedConfig.thumbnail) {
      const thumbnailUrl = renderOptionalUrl(embedConfig.thumbnail, templateContext);
      if (thumbnailUrl) {
        embed.setThumbnail(thumbnailUrl);
      }
    }
    if (Array.isArray(embedConfig.fields) && embedConfig.fields.length > 0) {
      if (embedConfig.fields.length > MAX_EMBED_FIELDS) {
        warn('Level-up action embed fields exceed Discord limit, truncating', {
          fieldCount: embedConfig.fields.length,
          maxFields: MAX_EMBED_FIELDS,
        });
      }

      const fields = embedConfig.fields.slice(0, MAX_EMBED_FIELDS).map((field) => ({
        name:
          renderBudgetedText(
            field.name || '\u200b',
            templateContext,
            textBudget,
            MAX_FIELD_NAME_LENGTH,
          ) || '\u200b',
        value:
          renderBudgetedText(
            field.value || '\u200b',
            templateContext,
            textBudget,
            MAX_FIELD_VALUE_LENGTH,
          ) || '\u200b',
        inline: Boolean(field.inline),
      }));

      embed.addFields(fields);
    }
    if (embedConfig.footer) {
      const footerConfig = renderFooter(embedConfig.footer, templateContext, textBudget);
      if (footerConfig) {
        embed.setFooter(footerConfig);
      }
    }
    if (embedConfig.image) {
      const imageUrl = renderOptionalUrl(embedConfig.image, templateContext);
      if (imageUrl) {
        embed.setImage(imageUrl);
      }
    }
    if (embedConfig.timestamp) {
      embed.setTimestamp();
    }
    payload.embeds = [embed];
  }

  return payload;
}
