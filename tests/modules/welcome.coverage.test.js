/**
 * Coverage tests for src/modules/welcome.js
 * Tests: DM failures, missing channel, disabled state, returning member, dynamic message branches
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

import { error as logError } from '../../src/logger.js';
import {
  __getCommunityActivityState,
  __resetCommunityActivityState,
  recordCommunityActivity,
  sendWelcomeMessage,
} from '../../src/modules/welcome.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Create a Map with a .filter() like discord.js Collection */
function makeChannelCache(channelIds = [], voiceChannels = []) {
  const entries = [
    ...channelIds.map((id) => [id, { id, isVoiceBased: () => false, members: { size: 0 } }]),
    ...voiceChannels.map((vc) => [vc.id, { ...vc, isVoiceBased: () => true }]),
  ];
  const map = new Map(entries);
  map.filter = (fn) => {
    const result = new Map();
    for (const [k, v] of map) {
      if (fn(v, k, map)) result.set(k, v);
    }
    result.values = Map.prototype.values.bind(result);
    result.filter = map.filter.bind(result);
    return result;
  };
  return map;
}

function makeMember({
  id = 'user1',
  username = 'testuser',
  guildId = 'guild1',
  guildName = 'Test Server',
  memberCount = 42,
  channelIds = ['ch1'],
  voiceChannels = [],
} = {}) {
  return {
    id,
    user: { tag: `${username}#0001`, username },
    guild: {
      id: guildId,
      name: guildName,
      memberCount,
      channels: { cache: makeChannelCache(channelIds, voiceChannels) },
    },
  };
}

function makeClient(channelSend = vi.fn().mockResolvedValue({ id: 'msg1' }), fetchError = null) {
  const channel = { id: 'ch1', send: channelSend };
  return {
    channels: {
      fetch: fetchError
        ? vi.fn().mockRejectedValue(fetchError)
        : vi.fn().mockResolvedValue(channel),
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('welcome module coverage', () => {
  beforeEach(() => {
    __resetCommunityActivityState();
    vi.clearAllMocks();
  });

  afterEach(() => {
    __resetCommunityActivityState();
  });

  describe('sendWelcomeMessage - disabled state', () => {
    it('returns early when welcome not enabled', async () => {
      const client = makeClient();
      const member = makeMember();
      const config = { welcome: { enabled: false, channelId: 'ch1' } };

      await sendWelcomeMessage(member, client, config);
      expect(client.channels.fetch).not.toHaveBeenCalled();
    });

    it('returns early when channelId is missing', async () => {
      const client = makeClient();
      const member = makeMember();
      const config = { welcome: { enabled: true } };

      await sendWelcomeMessage(member, client, config);
      expect(client.channels.fetch).not.toHaveBeenCalled();
    });

    it('returns early when channel fetch returns null', async () => {
      const client = { channels: { fetch: vi.fn().mockResolvedValue(null) } };
      const member = makeMember();
      const config = { welcome: { enabled: true, channelId: 'ch1' } };

      await sendWelcomeMessage(member, client, config);
      expect(client.channels.fetch).toHaveBeenCalledWith('ch1');
    });
  });

  describe('sendWelcomeMessage - static message', () => {
    it('sends default message when no template configured', async () => {
      const mockSend = vi.fn().mockResolvedValue({ id: 'msg1' });
      const client = makeClient(mockSend);
      const member = makeMember();
      const config = { welcome: { enabled: true, channelId: 'ch1' } };

      await sendWelcomeMessage(member, client, config);
      expect(mockSend).toHaveBeenCalled();
      const args = mockSend.mock.calls[0][0];
      expect(args.content).toContain('Welcome');
    });

    it('sends configured template message', async () => {
      const mockSend = vi.fn().mockResolvedValue({ id: 'msg1' });
      const client = makeClient(mockSend);
      const member = makeMember();
      const config = {
        welcome: {
          enabled: true,
          channelId: 'ch1',
          message: 'Hey {user}, welcome to {server}!',
        },
      };

      await sendWelcomeMessage(member, client, config);
      expect(mockSend).toHaveBeenCalled();
      const args = mockSend.mock.calls[0][0];
      expect(args.content).toContain('<@user1>');
    });

    it('logs error when channel fetch throws', async () => {
      const client = makeClient(vi.fn(), new Error('Unknown Channel'));
      const member = makeMember();
      const config = { welcome: { enabled: true, channelId: 'ch1' } };

      await sendWelcomeMessage(member, client, config);
      expect(logError).toHaveBeenCalledWith(
        'Welcome error',
        expect.objectContaining({ error: 'Unknown Channel' }),
      );
    });
  });

  describe('sendWelcomeMessage - dynamic message', () => {
    it('sends dynamic message when dynamic.enabled is true', async () => {
      const mockSend = vi.fn().mockResolvedValue({ id: 'msg1' });
      const client = makeClient(mockSend);
      const member = makeMember({ channelIds: ['ch1', 'ch2'] });
      const config = {
        welcome: {
          enabled: true,
          channelId: 'ch1',
          dynamic: {
            enabled: true,
            timezone: 'America/New_York',
            highlightChannels: ['ch2'],
          },
        },
      };

      await sendWelcomeMessage(member, client, config);
      expect(mockSend).toHaveBeenCalled();
      const args = mockSend.mock.calls[0][0];
      expect(args.content.length).toBeGreaterThan(0);
    });

    it('includes milestone for notable member counts', async () => {
      const mockSend = vi.fn().mockResolvedValue({ id: 'msg1' });
      const client = makeClient(mockSend);
      const member = makeMember({ memberCount: 100 }); // notable milestone
      const config = {
        welcome: {
          enabled: true,
          channelId: 'ch1',
          dynamic: { enabled: true },
        },
      };

      await sendWelcomeMessage(member, client, config);
      expect(mockSend).toHaveBeenCalled();
      const msg = mockSend.mock.calls[0][0].content;
      expect(msg).toContain('milestone');
    });

    it('includes member count line when not a milestone', async () => {
      const mockSend = vi.fn().mockResolvedValue({ id: 'msg1' });
      const client = makeClient(mockSend);
      const member = makeMember({ memberCount: 7 }); // not a milestone
      const config = {
        welcome: {
          enabled: true,
          channelId: 'ch1',
          dynamic: { enabled: true },
        },
      };

      await sendWelcomeMessage(member, client, config);
      expect(mockSend).toHaveBeenCalled();
      const msg = mockSend.mock.calls[0][0].content;
      expect(msg).toContain('#7');
    });
  });

  describe('recordCommunityActivity', () => {
    it('ignores bot messages', () => {
      const message = {
        guild: { id: 'g1' },
        channel: { id: 'ch1', isTextBased: () => true },
        author: { bot: true },
      };
      recordCommunityActivity(message, {});
      expect(__getCommunityActivityState('g1')).toEqual({});
    });

    it('ignores messages without guild', () => {
      const message = {
        guild: null,
        channel: { id: 'ch1', isTextBased: () => true },
        author: { bot: false },
      };
      recordCommunityActivity(message, {});
      expect(__getCommunityActivityState('g1')).toEqual({});
    });

    it('ignores non-text channels', () => {
      const message = {
        guild: { id: 'g1' },
        channel: { id: 'ch1', isTextBased: () => false },
        author: { bot: false },
      };
      recordCommunityActivity(message, {});
      expect(__getCommunityActivityState('g1')).toEqual({});
    });

    it('ignores excluded channels', () => {
      const message = {
        guild: { id: 'g1' },
        channel: { id: 'excluded-ch', isTextBased: () => true },
        author: { bot: false },
      };
      const config = {
        welcome: { dynamic: { excludeChannels: ['excluded-ch'] } },
      };
      recordCommunityActivity(message, config);
      expect(__getCommunityActivityState('g1')).toEqual({});
    });

    it('records activity for valid messages', () => {
      const message = {
        guild: { id: 'g1' },
        channel: { id: 'ch1', isTextBased: () => true },
        author: { bot: false },
      };
      recordCommunityActivity(message, {});
      const state = __getCommunityActivityState('g1');
      expect(state.ch1).toHaveLength(1);
    });

    it('prunes stale activity after EVICTION_INTERVAL calls', () => {
      for (let i = 0; i < 51; i++) {
        const message = {
          guild: { id: 'g1' },
          channel: { id: `ch${i % 5}`, isTextBased: () => true },
          author: { bot: false },
        };
        recordCommunityActivity(message, {});
      }

      const state = __getCommunityActivityState('g1');
      expect(Object.keys(state)).toHaveLength(5);
      expect(
        state.ch0.length +
          state.ch1.length +
          state.ch2.length +
          state.ch3.length +
          state.ch4.length,
      ).toBe(51);
    });

    it('rebuilds excluded channels cache when list changes', () => {
      const message = {
        guild: { id: 'g1' },
        channel: { id: 'ch1', isTextBased: () => true },
        author: { bot: false },
      };
      // First call with no exclusions
      recordCommunityActivity(message, {});

      // Second call with exclusions (cache key changes) should skip ch1
      recordCommunityActivity(message, {
        welcome: { dynamic: { excludeChannels: ['ch1'] } },
      });

      const state = __getCommunityActivityState('g1');
      expect(state.ch1).toHaveLength(1);
    });
  });

  describe('dynamic welcome - activity levels', () => {
    it('generates hype level message with active channels', async () => {
      // Pre-populate 60+ messages for 'hype' level
      for (let i = 0; i < 65; i++) {
        recordCommunityActivity(
          {
            guild: { id: 'g-hype' },
            channel: { id: 'ch-hype', isTextBased: () => true },
            author: { bot: false },
          },
          { welcome: { dynamic: { activityWindowMinutes: 60 } } },
        );
      }

      const mockSend = vi.fn().mockResolvedValue({ id: 'msg1' });
      const client = makeClient(mockSend);
      const member = makeMember({ guildId: 'g-hype', channelIds: ['ch-hype'] });
      const config = {
        welcome: {
          enabled: true,
          channelId: 'ch-hype',
          dynamic: { enabled: true, activityWindowMinutes: 60 },
        },
      };

      await sendWelcomeMessage(member, client, config);
      expect(mockSend).toHaveBeenCalled();
      const msg = mockSend.mock.calls[0][0].content;
      expect(msg).toContain('buzzing');
    });

    it('generates quiet level message when no activity', async () => {
      const mockSend = vi.fn().mockResolvedValue({ id: 'msg1' });
      const client = makeClient(mockSend);
      // No activity recorded, no voice channels
      const member = makeMember({ guildId: 'g-quiet-x', channelIds: [] });
      member.guild.channels.cache = makeChannelCache([], []);
      const config = {
        welcome: {
          enabled: true,
          channelId: 'ch-quiet',
          dynamic: { enabled: true },
        },
      };
      // fetch will return a channel even though it's not in guild cache
      // that's fine - the welcome channel is separate

      await sendWelcomeMessage(member, client, config);
      expect(mockSend).toHaveBeenCalled();
      const msg = mockSend.mock.calls[0][0].content;
      expect(msg).toContain('quiet');
    });

    it('generates steady level message (8-24 messages)', async () => {
      for (let i = 0; i < 10; i++) {
        recordCommunityActivity(
          {
            guild: { id: 'g-steady' },
            channel: { id: 'ch-steady', isTextBased: () => true },
            author: { bot: false },
          },
          { welcome: { dynamic: { activityWindowMinutes: 60 } } },
        );
      }

      const mockSend = vi.fn().mockResolvedValue({ id: 'msg1' });
      const client = makeClient(mockSend);
      const member = makeMember({ guildId: 'g-steady', channelIds: ['ch-steady'] });
      const config = {
        welcome: {
          enabled: true,
          channelId: 'ch-steady',
          dynamic: { enabled: true, activityWindowMinutes: 60 },
        },
      };

      await sendWelcomeMessage(member, client, config);
      expect(mockSend).toHaveBeenCalled();
      const msg = mockSend.mock.calls[0][0].content;
      expect(msg.length).toBeGreaterThan(0);
    });

    it('generates busy level message (25-59 messages)', async () => {
      for (let i = 0; i < 30; i++) {
        recordCommunityActivity(
          {
            guild: { id: 'g-busy' },
            channel: { id: 'ch-busy', isTextBased: () => true },
            author: { bot: false },
          },
          { welcome: { dynamic: { activityWindowMinutes: 60 } } },
        );
      }

      const mockSend = vi.fn().mockResolvedValue({ id: 'msg1' });
      const client = makeClient(mockSend);
      const member = makeMember({ guildId: 'g-busy', channelIds: ['ch-busy'] });
      const config = {
        welcome: {
          enabled: true,
          channelId: 'ch-busy',
          dynamic: { enabled: true, activityWindowMinutes: 60 },
        },
      };

      await sendWelcomeMessage(member, client, config);
      expect(mockSend).toHaveBeenCalled();
    });
  });

  describe('dynamic welcome - channel CTA variations', () => {
    it('generates CTA with no channels', async () => {
      const mockSend = vi.fn().mockResolvedValue({ id: 'msg1' });
      const client = makeClient(mockSend);
      const member = makeMember({ channelIds: [] });
      member.guild.channels.cache = makeChannelCache([], []);
      const config = {
        welcome: {
          enabled: true,
          channelId: 'ch1',
          dynamic: { enabled: true },
        },
      };

      await sendWelcomeMessage(member, client, config);
      expect(mockSend).toHaveBeenCalled();
      const msg = mockSend.mock.calls[0][0].content;
      expect(msg).toContain('Say hey');
    });

    it('generates CTA with one channel', async () => {
      const mockSend = vi.fn().mockResolvedValue({ id: 'msg1' });
      const client = makeClient(mockSend);
      const member = makeMember({ channelIds: ['ch1'] });
      const config = {
        welcome: {
          enabled: true,
          channelId: 'ch1',
          dynamic: { enabled: true, highlightChannels: ['ch1'] },
        },
      };

      await sendWelcomeMessage(member, client, config);
      expect(mockSend).toHaveBeenCalled();
      const msg = mockSend.mock.calls[0][0].content;
      expect(msg).toContain('<#ch1>');
    });

    it('generates CTA with two channels', async () => {
      const mockSend = vi.fn().mockResolvedValue({ id: 'msg1' });
      const client = makeClient(mockSend);
      const member = makeMember({ channelIds: ['ch1', 'ch2'] });
      const config = {
        welcome: {
          enabled: true,
          channelId: 'ch1',
          dynamic: { enabled: true, highlightChannels: ['ch1', 'ch2'] },
        },
      };

      await sendWelcomeMessage(member, client, config);
      expect(mockSend).toHaveBeenCalled();
      const msg = mockSend.mock.calls[0][0].content;
      expect(msg).toContain('<#ch1>');
    });

    it('generates CTA with three channels', async () => {
      const mockSend = vi.fn().mockResolvedValue({ id: 'msg1' });
      const client = makeClient(mockSend);
      const member = makeMember({ channelIds: ['ch1', 'ch2', 'ch3'] });
      const config = {
        welcome: {
          enabled: true,
          channelId: 'ch1',
          dynamic: { enabled: true, highlightChannels: ['ch1', 'ch2', 'ch3'] },
        },
      };

      await sendWelcomeMessage(member, client, config);
      expect(mockSend).toHaveBeenCalled();
      const msg = mockSend.mock.calls[0][0].content;
      expect(msg).toContain('Start in');
    });
  });

  describe('dynamic welcome - voice channel activity', () => {
    it('includes voice info for light activity with voice channels and no text suggestions', async () => {
      // 1 message = 'light' activity
      recordCommunityActivity(
        {
          guild: { id: 'g-voice' },
          channel: { id: 'ch-voice', isTextBased: () => true },
          author: { bot: false },
        },
        { welcome: { dynamic: { activityWindowMinutes: 60 } } },
      );

      const mockSend = vi.fn().mockResolvedValue({ id: 'msg1' });
      const client = makeClient(mockSend);
      // Guild has voice channels with members but no text channel suggestions
      const member = makeMember({
        guildId: 'g-voice',
        channelIds: [],
        voiceChannels: [{ id: 'vc1', members: { size: 3 } }],
      });
      const config = {
        welcome: {
          enabled: true,
          channelId: 'ch-voice',
          dynamic: { enabled: true, activityWindowMinutes: 60 },
        },
      };

      await sendWelcomeMessage(member, client, config);
      expect(mockSend).toHaveBeenCalled();
      const msg = mockSend.mock.calls[0][0].content;
      // Should mention voice activity
      expect(msg).toMatch(/voice|hang/i);
    });

    it('generates light + voice + channel text message', async () => {
      // 1 message = 'light' activity
      recordCommunityActivity(
        {
          guild: { id: 'g-voice2' },
          channel: { id: 'ch-main', isTextBased: () => true },
          author: { bot: false },
        },
        { welcome: { dynamic: { activityWindowMinutes: 60 } } },
      );

      const mockSend = vi.fn().mockResolvedValue({ id: 'msg1' });
      const client = makeClient(mockSend);
      // Guild has a text channel suggestion AND voice channels with members
      const member = makeMember({
        guildId: 'g-voice2',
        channelIds: ['ch-main'],
        voiceChannels: [{ id: 'vc2', members: { size: 2 } }],
      });
      const config = {
        welcome: {
          enabled: true,
          channelId: 'ch-main',
          dynamic: {
            enabled: true,
            activityWindowMinutes: 60,
            highlightChannels: ['ch-main'],
          },
        },
      };

      await sendWelcomeMessage(member, client, config);
      expect(mockSend).toHaveBeenCalled();
      const msg = mockSend.mock.calls[0][0].content;
      expect(msg.length).toBeGreaterThan(0);
    });
  });
});
