import { beforeEach, describe, expect, it, vi } from 'vitest';

const { warnMock } = vi.hoisted(() => ({
  warnMock: vi.fn(),
}));

vi.mock('../../../src/logger.js', () => ({
  warn: warnMock,
}));

import { buildPayload } from '../../../src/modules/actions/buildPayload.js';

describe('buildPayload', () => {
  beforeEach(() => {
    warnMock.mockReset();
  });

  it('renders rich embed payloads with fields, footer icon, image, and timestamp', () => {
    const payload = buildPayload(
      {
        type: 'announce',
        format: 'both',
        template: 'Hello {{username}}',
        embed: {
          title: 'Level {{level}}',
          description: 'Congrats {{username}}',
          color: '#5865F2',
          thumbnail: '{{avatar}}',
          fields: [{ name: 'XP', value: '{{xp}}', inline: true }],
          footer: { text: 'Footer {{level}}', iconURL: 'https://example.com/footer.png' },
          image: 'https://example.com/embed.png',
          timestamp: true,
        },
      },
      {
        username: 'Ada',
        level: '10',
        xp: '4,250',
        avatar: 'https://cdn.discordapp.com/avatar.png',
      },
    );

    expect(payload.content).toBe('Hello Ada');
    expect(payload.embeds).toHaveLength(1);

    const embed = payload.embeds[0].toJSON();
    expect(embed.title).toBe('Level 10');
    expect(embed.description).toBe('Congrats Ada');
    expect(embed.thumbnail?.url).toBe('https://cdn.discordapp.com/avatar.png');
    expect(embed.fields).toEqual([{ name: 'XP', value: '4,250', inline: true }]);
    expect(embed.footer).toEqual({
      text: 'Footer 10',
      icon_url: 'https://example.com/footer.png',
    });
    expect(embed.image?.url).toBe('https://example.com/embed.png');
    expect(embed.timestamp).toBeDefined();
  });

  it('truncates embeds to the Discord 25 field limit and warns', () => {
    const payload = buildPayload(
      {
        type: 'announce',
        format: 'embed',
        embed: {
          fields: Array.from({ length: 26 }, (_, index) => ({
            name: `Field ${index + 1}`,
            value: `Value ${index + 1}`,
          })),
        },
      },
      {},
    );

    expect(payload.embeds[0].toJSON().fields).toHaveLength(25);
    expect(warnMock).toHaveBeenCalledWith(
      'Level-up action embed fields exceed Discord limit, truncating',
      expect.objectContaining({
        fieldCount: 26,
        maxFields: 25,
      }),
    );
  });

  it('uses a zero-width footer text when only an icon remains after rendering', () => {
    const payload = buildPayload(
      {
        type: 'announce',
        format: 'embed',
        embed: {
          footer: {
            text: '',
            iconURL: 'https://example.com/footer.png',
          },
        },
      },
      {},
    );

    expect(payload.embeds[0].toJSON().footer).toEqual({
      text: '\u200b',
      icon_url: 'https://example.com/footer.png',
    });
  });

  it('truncates footer text to the Discord 2048 character limit', () => {
    const payload = buildPayload(
      {
        type: 'announce',
        format: 'embed',
        embed: {
          footer: 'x'.repeat(2050),
        },
      },
      {},
    );

    expect(payload.embeds[0].toJSON().footer?.text).toHaveLength(2048);
  });

  it('truncates embed title and description to Discord limits', () => {
    const payload = buildPayload(
      {
        type: 'announce',
        format: 'embed',
        embed: {
          title: '{{longTitle}}',
          description: '{{longDescription}}',
        },
      },
      {
        longTitle: 't'.repeat(300),
        longDescription: 'd'.repeat(5000),
      },
    );

    const embed = payload.embeds[0].toJSON();
    expect(embed.title).toHaveLength(256);
    expect(embed.description).toHaveLength(4096);
  });

  it('skips empty footers when no text or icon remain after rendering', () => {
    const payload = buildPayload(
      {
        type: 'announce',
        format: 'embed',
        embed: {
          footer: '',
        },
      },
      {},
    );

    expect(payload.embeds[0].toJSON().footer).toBeUndefined();
  });

  it('skips thumbnail and image URLs that render empty', () => {
    const payload = buildPayload(
      {
        type: 'announce',
        format: 'embed',
        embed: {
          thumbnail: '{{avatar}}',
          image: '{{serverIcon}}',
        },
      },
      {
        avatar: '',
        serverIcon: '',
      },
    );

    const embed = payload.embeds[0].toJSON();
    expect(embed.thumbnail).toBeUndefined();
    expect(embed.image).toBeUndefined();
  });

  it('skips footer icon URLs that render empty', () => {
    const payload = buildPayload(
      {
        type: 'announce',
        format: 'embed',
        embed: {
          footer: {
            text: 'Footer text',
            iconURL: ' {{serverIcon}} ',
          },
        },
      },
      {
        serverIcon: '',
      },
    );

    expect(payload.embeds[0].toJSON().footer).toEqual({
      text: 'Footer text',
    });
  });

  it('keeps total embed text within the Discord aggregate limit', () => {
    const payload = buildPayload(
      {
        type: 'announce',
        format: 'embed',
        embed: {
          title: 't'.repeat(256),
          description: 'd'.repeat(4096),
          fields: [
            {
              name: 'n'.repeat(256),
              value: 'v'.repeat(1024),
            },
            {
              name: 'extra-name',
              value: 'extra-value',
            },
          ],
          footer: 'f'.repeat(2048),
        },
      },
      {},
    );

    const embed = payload.embeds[0].toJSON();
    const totalTextLength =
      (embed.title?.length ?? 0) +
      (embed.description?.length ?? 0) +
      (embed.footer?.text.length ?? 0) +
      (embed.fields ?? []).reduce((sum, field) => sum + field.name.length + field.value.length, 0);

    expect(totalTextLength).toBeLessThanOrEqual(6000);
    expect(totalTextLength).toBe(6000);
  });
});
