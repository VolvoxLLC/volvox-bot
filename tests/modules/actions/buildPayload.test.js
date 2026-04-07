import { describe, expect, it } from 'vitest';

import { buildPayload } from '../../../src/modules/actions/buildPayload.js';

describe('buildPayload', () => {
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
});
