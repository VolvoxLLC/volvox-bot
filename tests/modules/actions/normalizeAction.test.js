import { describe, expect, it } from 'vitest';

import { normalizeXpAction } from '../../../src/modules/actions/normalizeAction.js';

describe('normalizeXpAction', () => {
  it('maps message to template for message actions', () => {
    expect(normalizeXpAction({ type: 'sendDm', message: 'Level {{level}}' })).toEqual(
      expect.objectContaining({
        type: 'sendDm',
        message: 'Level {{level}}',
        template: 'Level {{level}}',
      }),
    );
  });

  it('maps prefix and suffix actions to template', () => {
    expect(normalizeXpAction({ type: 'nickPrefix', prefix: '[Lvl {{level}}] ' })).toEqual(
      expect.objectContaining({
        type: 'nickPrefix',
        prefix: '[Lvl {{level}}] ',
        template: '[Lvl {{level}}] ',
      }),
    );

    expect(normalizeXpAction({ type: 'nickSuffix', suffix: ' [Lvl {{level}}]' })).toEqual(
      expect.objectContaining({
        type: 'nickSuffix',
        suffix: ' [Lvl {{level}}]',
        template: ' [Lvl {{level}}]',
      }),
    );
  });

  it('normalizes embed-builder shaped config to runtime embed fields', () => {
    expect(
      normalizeXpAction({
        type: 'announce',
        format: 'embed',
        embed: {
          title: 'Level Up',
          thumbnailType: 'user_avatar',
          footerText: 'Footer',
          footerIconUrl: 'https://example.com/footer.png',
          imageUrl: 'https://example.com/image.png',
          showTimestamp: true,
          fields: [{ id: 'f1', name: 'Level', value: '{{level}}', inline: true }],
        },
      }),
    ).toEqual(
      expect.objectContaining({
        embed: expect.objectContaining({
          title: 'Level Up',
          thumbnail: '{{avatar}}',
          image: 'https://example.com/image.png',
          timestamp: true,
          fields: [{ name: 'Level', value: '{{level}}', inline: true }],
          footer: {
            text: 'Footer',
            iconURL: 'https://example.com/footer.png',
          },
        }),
      }),
    );
  });

  it('drops empty footer text when no footer icon is provided', () => {
    expect(
      normalizeXpAction({
        type: 'announce',
        format: 'embed',
        embed: {
          footerText: '',
        },
      }),
    ).toEqual(
      expect.objectContaining({
        embed: expect.objectContaining({
          footer: undefined,
        }),
      }),
    );
  });

  it('preserves icon-only footers so payload building can add a zero-width space', () => {
    expect(
      normalizeXpAction({
        type: 'announce',
        format: 'embed',
        embed: {
          footerText: '',
          footerIconUrl: 'https://example.com/footer.png',
        },
      }),
    ).toEqual(
      expect.objectContaining({
        embed: expect.objectContaining({
          footer: {
            text: '',
            iconURL: 'https://example.com/footer.png',
          },
        }),
      }),
    );
  });
});
