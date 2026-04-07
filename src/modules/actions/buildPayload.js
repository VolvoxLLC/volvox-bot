/**
 * Shared payload builder for sendDm and announce action handlers.
 * Constructs Discord message options from action config and template context.
 */

import { EmbedBuilder } from 'discord.js';
import { renderTemplate } from '../../utils/templateEngine.js';

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
    if (embedConfig.title) embed.setTitle(renderTemplate(embedConfig.title, templateContext));
    if (embedConfig.description)
      embed.setDescription(renderTemplate(embedConfig.description, templateContext));
    if (embedConfig.color) embed.setColor(embedConfig.color);
    if (embedConfig.thumbnail)
      embed.setThumbnail(renderTemplate(embedConfig.thumbnail, templateContext));
    if (Array.isArray(embedConfig.fields) && embedConfig.fields.length > 0) {
      embed.addFields(
        embedConfig.fields.map((field) => ({
          name: renderTemplate(field.name || '\u200b', templateContext).slice(0, 256) || '\u200b',
          value:
            renderTemplate(field.value || '\u200b', templateContext).slice(0, 1024) || '\u200b',
          inline: Boolean(field.inline),
        })),
      );
    }
    if (embedConfig.footer) {
      const footerConfig =
        typeof embedConfig.footer === 'string'
          ? { text: renderTemplate(embedConfig.footer, templateContext) }
          : {
              text: renderTemplate(embedConfig.footer.text ?? '', templateContext),
              iconURL: embedConfig.footer.iconURL
                ? renderTemplate(embedConfig.footer.iconURL, templateContext)
                : undefined,
            };
      embed.setFooter(footerConfig);
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
