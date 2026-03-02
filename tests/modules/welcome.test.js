import { describe, expect, it, vi } from 'vitest';

// Mock logger

// Mock discordCache to pass through to the underlying client.channels.fetch
vi.mock('../../src/utils/discordCache.js', () => ({
  fetchChannelCached: vi.fn().mockImplementation(async (client, channelId) => {
    if (!channelId) return null;
    const cached = client.channels?.cache?.get?.(channelId);
    if (cached) return cached;
    if (client.channels?.fetch) {
      return client.channels.fetch(channelId).catch(() => null);
    }
    return null;
  }),
  fetchGuildChannelsCached: vi.fn().mockResolvedValue([]),
  fetchGuildRolesCached: vi.fn().mockResolvedValue([]),
  fetchMemberCached: vi.fn().mockResolvedValue(null),
  invalidateGuildCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

import {
  __getCommunityActivityState,
  __resetCommunityActivityState,
  pickWelcomeVariant,
  recordCommunityActivity,
  renderWelcomeMessage,
  resolveWelcomeTemplate,
  sendWelcomeMessage,
} from '../../src/modules/welcome.js';

describe('renderWelcomeMessage', () => {
  it('should replace {user} with mention', () => {
    const result = renderWelcomeMessage(
      'Hello {user}!',
      { id: '123' },
      { name: 'Test', memberCount: 10 },
    );
    expect(result).toBe('Hello <@123>!');
  });

  it('should replace {username} with username', () => {
    const result = renderWelcomeMessage(
      'Hello {username}!',
      { id: '123', username: 'testuser' },
      { name: 'Test', memberCount: 10 },
    );
    expect(result).toBe('Hello testuser!');
  });

  it('should replace {server} with guild name', () => {
    const result = renderWelcomeMessage(
      'Welcome to {server}!',
      { id: '123' },
      { name: 'My Server', memberCount: 10 },
    );
    expect(result).toBe('Welcome to My Server!');
  });

  it('should replace {memberCount}', () => {
    const result = renderWelcomeMessage(
      'You are member #{memberCount}!',
      { id: '123' },
      { name: 'Test', memberCount: 42 },
    );
    expect(result).toBe('You are member #42!');
  });

  it('should handle multiple replacements', () => {
    const result = renderWelcomeMessage(
      'Welcome {user} ({username}) to {server}! Member #{memberCount}',
      { id: '123', username: 'bob' },
      { name: 'Cool Server', memberCount: 100 },
    );
    expect(result).toBe('Welcome <@123> (bob) to Cool Server! Member #100');
  });

  it('should handle missing username', () => {
    const result = renderWelcomeMessage(
      '{username}',
      { id: '123' },
      { name: 'Test', memberCount: 1 },
    );
    expect(result).toBe('Unknown');
  });

  it('should replace {guild} with guild name (alias)', () => {
    const result = renderWelcomeMessage(
      'Welcome to {guild}!',
      { id: '123' },
      { name: 'My Server', memberCount: 10 },
    );
    expect(result).toBe('Welcome to My Server!');
  });

  it('should replace {count} with member count (alias)', () => {
    const result = renderWelcomeMessage(
      'You are member #{count}!',
      { id: '123' },
      { name: 'Test', memberCount: 99 },
    );
    expect(result).toBe('You are member #99!');
  });

  it('should support all variables together', () => {
    const result = renderWelcomeMessage(
      '{user} ({username}) joined {guild} aka {server} as member #{count} / #{memberCount}',
      { id: '42', username: 'alice' },
      { name: 'Cool Guild', memberCount: 7 },
    );
    expect(result).toBe('<@42> (alice) joined Cool Guild aka Cool Guild as member #7 / #7');
  });
});

describe('pickWelcomeVariant', () => {
  it('should return a variant from the array', () => {
    const variants = ['Hello {user}!', 'Howdy {user}!', 'Hey {user}!'];
    const picked = pickWelcomeVariant(variants, 'fallback');
    expect(variants).toContain(picked);
  });

  it('should return the fallback when variants is empty', () => {
    expect(pickWelcomeVariant([], 'fallback')).toBe('fallback');
  });

  it('should return the fallback when variants is null', () => {
    expect(pickWelcomeVariant(null, 'fallback')).toBe('fallback');
  });

  it('should return the hard-coded default when both are missing', () => {
    expect(pickWelcomeVariant(null, undefined)).toBe('Welcome, {user}!');
  });

  it('should return the single variant when array has one entry', () => {
    expect(pickWelcomeVariant(['Only one!'], 'fallback')).toBe('Only one!');
  });
});

describe('resolveWelcomeTemplate', () => {
  const baseConfig = {
    message: 'Global message {user}',
    variants: ['Variant A {user}', 'Variant B {user}'],
    channels: [
      {
        channelId: 'ch-specific',
        message: 'Channel-specific {user}',
        variants: ['Ch variant A {user}'],
      },
    ],
  };

  it('should return per-channel message when channelId matches', () => {
    const template = resolveWelcomeTemplate('ch-specific', baseConfig);
    expect(template).toBe('Ch variant A {user}'); // only one variant
  });

  it('should pick from global variants when no channel match', () => {
    const template = resolveWelcomeTemplate('ch-other', baseConfig);
    expect(['Variant A {user}', 'Variant B {user}']).toContain(template);
  });

  it('should fall back to global message when no variants configured', () => {
    const cfg = { message: 'Only message {user}', channelId: 'ch1' };
    const template = resolveWelcomeTemplate('ch1', cfg);
    expect(template).toBe('Only message {user}');
  });

  it('should handle missing channels array gracefully', () => {
    const cfg = { message: 'Fallback {user}' };
    expect(resolveWelcomeTemplate('ch-any', cfg)).toBe('Fallback {user}');
  });

  it('should use per-channel message when no per-channel variants', () => {
    const cfg = {
      message: 'Global',
      channels: [{ channelId: 'ch1', message: 'Channel msg {user}' }],
    };
    expect(resolveWelcomeTemplate('ch1', cfg)).toBe('Channel msg {user}');
  });
});

describe('recordCommunityActivity', () => {
  it('should not crash on null message', () => {
    recordCommunityActivity(null, {});
  });

  it('should not record for bot messages', () => {
    const message = {
      guild: { id: 'g1' },
      channel: { id: 'c1', isTextBased: () => true },
      author: { bot: true },
    };
    recordCommunityActivity(message, {});
  });

  it('should not record for non-text channels', () => {
    const message = {
      guild: { id: 'g1' },
      channel: { id: 'c1', isTextBased: () => false },
      author: { bot: false },
    };
    recordCommunityActivity(message, {});
  });

  it('should not record for excluded channels', () => {
    const message = {
      guild: { id: 'g1' },
      channel: { id: 'excluded-ch', isTextBased: () => true },
      author: { bot: false },
    };
    const config = {
      welcome: {
        dynamic: { excludeChannels: ['excluded-ch'] },
      },
    };
    recordCommunityActivity(message, config);
  });

  it('should record activity for valid messages', () => {
    const message = {
      guild: { id: 'g1' },
      channel: { id: 'c1', isTextBased: () => true },
      author: { bot: false },
    };
    const config = { welcome: { dynamic: {} } };
    // Should not throw
    recordCommunityActivity(message, config);
  });

  it('should handle messages with no guild', () => {
    const message = {
      guild: null,
      channel: { id: 'c1', isTextBased: () => true },
      author: { bot: false },
    };
    recordCommunityActivity(message, {});
  });

  it('should handle empty dynamic config', () => {
    const message = {
      guild: { id: 'g1' },
      channel: { id: 'c1', isTextBased: () => true },
      author: { bot: false },
    };
    recordCommunityActivity(message, {});
  });

  it('should prune stale activity data after enough calls', () => {
    __resetCommunityActivityState();

    const config = {
      welcome: {
        dynamic: { activityWindowMinutes: 5 },
      },
    };

    const baseTime = 1_700_000_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(baseTime);

    // Record activity in a channel that will become stale
    const staleMsg = {
      guild: { id: 'prune-guild' },
      channel: { id: 'prune-ch', isTextBased: () => true },
      author: { bot: false },
    };
    recordCommunityActivity(staleMsg, config);

    expect(__getCommunityActivityState('prune-guild')).toEqual({
      'prune-ch': [baseTime],
    });

    // Fast-forward time past the activity window and trigger periodic eviction.
    // The eviction interval is 50, so we exceed it.
    nowSpy.mockReturnValue(baseTime + 10 * 60 * 1000);

    const freshMsg = {
      guild: { id: 'prune-guild' },
      channel: { id: 'fresh-ch', isTextBased: () => true },
      author: { bot: false },
    };

    for (let i = 0; i < 55; i++) {
      recordCommunityActivity(freshMsg, config);
    }

    const state = __getCommunityActivityState('prune-guild');

    // Prove stale channel was evicted and only fresh channel timestamps remain.
    expect(state['prune-ch']).toBeUndefined();
    expect(state['fresh-ch']).toHaveLength(55);
    expect(state['fresh-ch']).toEqual(Array(55).fill(baseTime + 10 * 60 * 1000));

    vi.restoreAllMocks();
    __resetCommunityActivityState();
  });
});

describe('sendWelcomeMessage', () => {
  it('should not send if welcome is disabled', async () => {
    const member = { user: { tag: 'user#1234' }, guild: { name: 'Test' } };
    const client = { channels: { fetch: vi.fn() } };
    const config = { welcome: { enabled: false } };
    await sendWelcomeMessage(member, client, config);
    expect(client.channels.fetch).not.toHaveBeenCalled();
  });

  it('should not send if no channelId configured', async () => {
    const member = { user: { tag: 'user#1234' }, guild: { name: 'Test' } };
    const client = { channels: { fetch: vi.fn() } };
    const config = { welcome: { enabled: true } };
    await sendWelcomeMessage(member, client, config);
    expect(client.channels.fetch).not.toHaveBeenCalled();
  });

  it('should not send if channel cannot be fetched', async () => {
    const member = {
      id: '123',
      user: { tag: 'user#1234', username: 'user' },
      guild: { name: 'Test', memberCount: 10 },
    };
    const client = { channels: { fetch: vi.fn().mockResolvedValue(null) } };
    const config = { welcome: { enabled: true, channelId: 'ch1' } };
    await sendWelcomeMessage(member, client, config);
  });

  it('should send static welcome message', async () => {
    const mockSend = vi.fn();
    const member = {
      id: '123',
      user: { tag: 'user#1234', username: 'testuser' },
      guild: { name: 'Test Server', memberCount: 50 },
    };
    const client = { channels: { fetch: vi.fn().mockResolvedValue({ send: mockSend }) } };
    const config = {
      welcome: {
        enabled: true,
        channelId: 'ch1',
        message: 'Welcome {user} to {server}!',
      },
    };
    await sendWelcomeMessage(member, client, config);
    expect(mockSend).toHaveBeenCalledWith({
      content: 'Welcome <@123> to Test Server!',
      allowedMentions: { parse: ['users'], repliedUser: true },
    });
  });

  it('should send dynamic welcome message when enabled', async () => {
    const mockSend = vi.fn();
    const member = {
      id: '123',
      user: { tag: 'user#1234', username: 'testuser' },
      guild: {
        name: 'Test Server',
        memberCount: 50,
        channels: {
          cache: {
            filter: vi.fn().mockReturnValue({ size: 0, values: () => [] }),
            has: vi.fn().mockReturnValue(false),
          },
        },
      },
    };
    const client = { channels: { fetch: vi.fn().mockResolvedValue({ send: mockSend }) } };
    const config = {
      welcome: {
        enabled: true,
        channelId: 'ch1',
        dynamic: {
          enabled: true,
          timezone: 'America/New_York',
        },
      },
    };
    await sendWelcomeMessage(member, client, config);
    expect(mockSend).toHaveBeenCalled();
    const sentMessage = mockSend.mock.calls[0][0].content;
    expect(sentMessage).toContain('<@123>');
  });

  it('should handle errors gracefully', async () => {
    const member = {
      id: '123',
      user: { tag: 'user#1234', username: 'testuser' },
      guild: { name: 'Test', memberCount: 10 },
    };
    const client = { channels: { fetch: vi.fn().mockRejectedValue(new Error('channel error')) } };
    const config = { welcome: { enabled: true, channelId: 'ch1' } };

    // Should not throw
    await sendWelcomeMessage(member, client, config);
  });

  it('should send dynamic message with milestone', async () => {
    const mockSend = vi.fn();
    const member = {
      id: '123',
      user: { tag: 'user#1234', username: 'testuser' },
      guild: {
        name: 'Test Server',
        memberCount: 100, // Notable milestone
        channels: {
          cache: {
            filter: vi.fn().mockReturnValue({ size: 0, values: () => [] }),
            has: vi.fn().mockReturnValue(false),
          },
        },
      },
    };
    const client = { channels: { fetch: vi.fn().mockResolvedValue({ send: mockSend }) } };
    const config = {
      welcome: {
        enabled: true,
        channelId: 'ch1',
        dynamic: {
          enabled: true,
          timezone: 'UTC',
        },
      },
    };
    await sendWelcomeMessage(member, client, config);
    const sentMessage = mockSend.mock.calls[0][0].content;
    expect(sentMessage).toContain('#100');
    expect(sentMessage).toContain('milestone');
  });

  it('should use default welcome message if not configured', async () => {
    const mockSend = vi.fn();
    const member = {
      id: '123',
      user: { tag: 'user#1234', username: 'testuser' },
      guild: { name: 'Test', memberCount: 10 },
    };
    const client = { channels: { fetch: vi.fn().mockResolvedValue({ send: mockSend }) } };
    const config = { welcome: { enabled: true, channelId: 'ch1' } };
    await sendWelcomeMessage(member, client, config);
    expect(mockSend).toHaveBeenCalledWith({
      content: 'Welcome, <@123>!',
      allowedMentions: { parse: ['users'], repliedUser: true },
    });
  });

  it('should send dynamic message with highlight channels', async () => {
    const mockSend = vi.fn();
    const member = {
      id: '123',
      user: { tag: 'user#1234', username: 'testuser' },
      guild: {
        name: 'Test Server',
        memberCount: 51,
        channels: {
          cache: {
            filter: vi.fn().mockReturnValue({ size: 0, values: () => [] }),
            has: vi.fn().mockReturnValue(true),
          },
        },
      },
    };
    const client = { channels: { fetch: vi.fn().mockResolvedValue({ send: mockSend }) } };
    const config = {
      welcome: {
        enabled: true,
        channelId: 'ch1',
        message: 'Hello <#111> and <#222>',
        dynamic: {
          enabled: true,
          timezone: 'UTC',
          highlightChannels: ['ch-intro', 'ch-general'],
        },
      },
    };
    await sendWelcomeMessage(member, client, config);
    expect(mockSend).toHaveBeenCalled();
  });

  it('should send dynamic message with active voice channels', async () => {
    const mockSend = vi.fn();
    const voiceChannel = {
      isVoiceBased: () => true,
      members: { size: 3 },
    };
    const member = {
      id: '123',
      user: { tag: 'user#1234', username: 'testuser' },
      guild: {
        name: 'Test Server',
        memberCount: 51,
        channels: {
          cache: {
            filter: vi.fn().mockReturnValue({
              size: 1,
              values: () => [voiceChannel][Symbol.iterator](),
            }),
            has: vi.fn().mockReturnValue(false),
          },
        },
      },
    };
    const client = { channels: { fetch: vi.fn().mockResolvedValue({ send: mockSend }) } };
    const config = {
      welcome: {
        enabled: true,
        channelId: 'ch1',
        dynamic: { enabled: true, timezone: 'UTC' },
      },
    };

    // Record some light activity to get "light" level with voice
    for (let i = 0; i < 2; i++) {
      recordCommunityActivity(
        {
          guild: { id: member.guild.id || 'test-guild' },
          channel: { id: `voice-test-ch-${i}`, isTextBased: () => true },
          author: { bot: false },
        },
        config,
      );
    }

    await sendWelcomeMessage(member, client, config);
    expect(mockSend).toHaveBeenCalled();
  });

  it('should send dynamic message with 3 suggested channels (3-channel CTA)', async () => {
    const mockSend = vi.fn();
    const member = {
      id: '123',
      user: { tag: 'user#1234', username: 'testuser' },
      guild: {
        name: 'Test Server',
        memberCount: 51,
        channels: {
          cache: {
            filter: vi.fn().mockReturnValue({ size: 0, values: () => [][Symbol.iterator]() }),
            has: vi.fn().mockReturnValue(true),
          },
        },
      },
    };
    const client = { channels: { fetch: vi.fn().mockResolvedValue({ send: mockSend }) } };
    const config = {
      welcome: {
        enabled: true,
        channelId: 'ch1',
        message: 'Hello <#111> and <#222> and <#333>',
        dynamic: {
          enabled: true,
          timezone: 'UTC',
          highlightChannels: ['ch-intro', 'ch-general', 'ch-projects'],
        },
      },
    };
    await sendWelcomeMessage(member, client, config);
    expect(mockSend).toHaveBeenCalled();
  });

  it('should use morning greeting template when hour is 6am', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T06:00:00.000Z')); // 6am UTC

    const mockSend = vi.fn();
    const member = {
      id: '123',
      user: { tag: 'user#1234', username: 'testuser' },
      guild: {
        name: 'Test',
        memberCount: 100,
        channels: {
          cache: {
            filter: vi.fn().mockReturnValue({ size: 0, values: () => [] }),
            has: vi.fn().mockReturnValue(false),
          },
        },
      },
    };
    const client = { channels: { fetch: vi.fn().mockResolvedValue({ send: mockSend }) } };
    const config = {
      welcome: {
        enabled: true,
        channelId: 'ch1',
        dynamic: { enabled: true, timezone: 'UTC' },
      },
    };
    await sendWelcomeMessage(member, client, config);
    expect(mockSend).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('should use evening greeting template when hour is 7pm', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T19:00:00.000Z')); // 7pm UTC

    const mockSend = vi.fn();
    const member = {
      id: '456',
      user: { tag: 'user#5678', username: 'eveninguser' },
      guild: {
        name: 'EventGuild',
        memberCount: 50,
        channels: {
          cache: {
            filter: vi.fn().mockReturnValue({ size: 0, values: () => [] }),
            has: vi.fn().mockReturnValue(false),
          },
        },
      },
    };
    const client = { channels: { fetch: vi.fn().mockResolvedValue({ send: mockSend }) } };
    const config = {
      welcome: {
        enabled: true,
        channelId: 'ch1',
        dynamic: { enabled: true, timezone: 'UTC' },
      },
    };
    await sendWelcomeMessage(member, client, config);
    expect(mockSend).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('should use night greeting template when hour is midnight', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T00:00:00.000Z')); // midnight UTC

    const mockSend = vi.fn();
    const member = {
      id: '789',
      user: { tag: 'user#9012', username: 'nightowl' },
      guild: {
        name: 'NightGuild',
        memberCount: 30,
        channels: {
          cache: {
            filter: vi.fn().mockReturnValue({ size: 0, values: () => [] }),
            has: vi.fn().mockReturnValue(false),
          },
        },
      },
    };
    const client = { channels: { fetch: vi.fn().mockResolvedValue({ send: mockSend }) } };
    const config = {
      welcome: {
        enabled: true,
        channelId: 'ch1',
        dynamic: { enabled: true, timezone: 'UTC' },
      },
    };
    await sendWelcomeMessage(member, client, config);
    expect(mockSend).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('should handle dynamic message with milestone interval', async () => {
    const mockSend = vi.fn();
    const member = {
      id: '123',
      user: { tag: 'user#1234', username: 'testuser' },
      guild: {
        name: 'Test',
        memberCount: 75, // 75 % 25 === 0 → milestone
        channels: {
          cache: {
            filter: vi.fn().mockReturnValue({ size: 0, values: () => [] }),
            has: vi.fn().mockReturnValue(false),
          },
        },
      },
    };
    const client = { channels: { fetch: vi.fn().mockResolvedValue({ send: mockSend }) } };
    const config = {
      welcome: {
        enabled: true,
        channelId: 'ch1',
        dynamic: { enabled: true, timezone: 'UTC', milestoneInterval: 25 },
      },
    };
    await sendWelcomeMessage(member, client, config);
    const msg = mockSend.mock.calls[0][0].content;
    expect(msg).toContain('milestone');
  });
});

describe('sendWelcomeMessage – variants and per-channel', () => {
  it('should pick a variant from global variants array', async () => {
    const mockSend = vi.fn();
    const member = {
      id: '999',
      user: { tag: 'varuser#0001', username: 'varuser' },
      guild: { name: 'Variant Guild', memberCount: 5 },
    };
    const client = { channels: { fetch: vi.fn().mockResolvedValue({ send: mockSend }) } };
    const config = {
      welcome: {
        enabled: true,
        channelId: 'ch1',
        variants: ['Hey {user}!', 'Hello {user}!', 'Hi {user}!'],
      },
    };

    await sendWelcomeMessage(member, client, config);
    expect(mockSend).toHaveBeenCalledOnce();
    const sent = mockSend.mock.calls[0][0].content;
    const expected = ['Hey <@999>!', 'Hello <@999>!', 'Hi <@999>!'];
    expect(expected).toContain(sent);
  });

  it('should send to additional per-channel configs', async () => {
    const mockSendPrimary = vi.fn();
    const mockSendSecondary = vi.fn();

    const channelMap = {
      'ch-primary': { send: mockSendPrimary, isTextBased: () => true },
      'ch-extra': { send: mockSendSecondary, isTextBased: () => true },
    };

    const member = {
      id: '777',
      user: { tag: 'extrauser#0002', username: 'extrauser' },
      guild: { name: 'Multi Guild', memberCount: 20 },
    };

    const client = {
      channels: {
        cache: { get: (id) => channelMap[id] || null },
        fetch: vi.fn().mockImplementation((id) => Promise.resolve(channelMap[id] || null)),
      },
    };

    const config = {
      welcome: {
        enabled: true,
        channelId: 'ch-primary',
        message: 'Primary: welcome {user}!',
        channels: [
          {
            channelId: 'ch-extra',
            message: 'Extra: welcome {user} to {guild}!',
          },
        ],
      },
    };

    await sendWelcomeMessage(member, client, config);

    expect(mockSendPrimary).toHaveBeenCalledOnce();
    expect(mockSendPrimary.mock.calls[0][0].content).toBe('Primary: welcome <@777>!');

    expect(mockSendSecondary).toHaveBeenCalledOnce();
    expect(mockSendSecondary.mock.calls[0][0].content).toBe(
      'Extra: welcome <@777> to Multi Guild!',
    );
  });

  it('should use per-channel variant for extra channel', async () => {
    const mockSendExtra = vi.fn();
    const channelMap = {
      'ch-primary': { send: vi.fn(), isTextBased: () => true },
      'ch-extra': { send: mockSendExtra, isTextBased: () => true },
    };
    const member = {
      id: '555',
      user: { tag: 'vuser#0003', username: 'vuser' },
      guild: { name: 'V Guild', memberCount: 3 },
    };
    const client = {
      channels: {
        cache: { get: (id) => channelMap[id] || null },
        fetch: vi.fn().mockImplementation((id) => Promise.resolve(channelMap[id] || null)),
      },
    };
    const config = {
      welcome: {
        enabled: true,
        channelId: 'ch-primary',
        message: 'Primary',
        channels: [
          {
            channelId: 'ch-extra',
            variants: ['Variant X {user}', 'Variant Y {user}'],
          },
        ],
      },
    };

    await sendWelcomeMessage(member, client, config);
    const sent = mockSendExtra.mock.calls[0][0].content;
    expect(['Variant X <@555>', 'Variant Y <@555>']).toContain(sent);
  });

  it('should not send to per-channel when channelId same as primary', async () => {
    const mockSend = vi.fn();
    const member = {
      id: '111',
      user: { tag: 'sameuser#0004', username: 'sameuser' },
      guild: { name: 'Same Guild', memberCount: 1 },
    };
    const client = { channels: { fetch: vi.fn().mockResolvedValue({ send: mockSend }) } };
    const config = {
      welcome: {
        enabled: true,
        channelId: 'ch1',
        message: 'Welcome {user}',
        channels: [{ channelId: 'ch1', message: 'Duplicate channel' }],
      },
    };

    await sendWelcomeMessage(member, client, config);
    // Only one call — duplicates are filtered
    expect(mockSend).toHaveBeenCalledOnce();
  });

  it('should render {guild} and {count} variables correctly', async () => {
    const mockSend = vi.fn();
    const member = {
      id: '321',
      user: { tag: 'aliasuser#0005', username: 'aliasuser' },
      guild: { name: 'Alias Guild', memberCount: 88 },
    };
    const client = { channels: { fetch: vi.fn().mockResolvedValue({ send: mockSend }) } };
    const config = {
      welcome: {
        enabled: true,
        channelId: 'ch1',
        message: '{user} joined {guild} as member #{count}',
      },
    };

    await sendWelcomeMessage(member, client, config);
    expect(mockSend.mock.calls[0][0].content).toBe('<@321> joined Alias Guild as member #88');
  });
});
