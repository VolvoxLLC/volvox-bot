import { afterEach, describe, expect, it, vi } from 'vitest';

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

import { checkLinks, extractUrls, matchPhishingPattern } from '../../src/modules/linkFilter.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMessage({
  content = '',
  userId = 'user1',
  channelId = 'chan1',
  isAdmin = false,
  roleIds = [],
  roleNames = [],
  alertChannelSend = null,
} = {}) {
  const roles = [
    ...roleIds.map((id) => ({ id, name: `role-${id}` })),
    ...roleNames.map((name) => ({ id: `id-${name}`, name })),
  ];

  const mockSend = alertChannelSend ?? vi.fn();

  const member = {
    permissions: {
      has: vi.fn().mockReturnValue(isAdmin),
    },
    roles: {
      cache: {
        some: vi.fn((fn) => roles.some(fn)),
      },
    },
  };

  return {
    content,
    author: { id: userId, tag: `User#${userId}` },
    channel: { id: channelId },
    guild: { id: 'guild1' },
    member,
    client: {
      channels: {
        fetch: vi.fn().mockResolvedValue({ send: mockSend }),
      },
    },
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

function makeConfig({
  enabled = true,
  blockedDomains = [],
  alertChannelId = 'alert-chan',
  modRoles = [],
} = {}) {
  return {
    moderation: {
      enabled: true,
      alertChannelId,
      linkFilter: {
        enabled,
        blockedDomains,
      },
    },
    permissions: { modRoles },
  };
}

function expectExtractedHostnames(content, expectedHostnames) {
  const hostnames = extractUrls(content).map((result) => result.hostname);
  expect(hostnames).toEqual(expect.arrayContaining(expectedHostnames));
}

function expectPhishingMatch(content) {
  expect(matchPhishingPattern(content)).not.toBeNull();
}

async function checkMessageContent(content, configOverrides, messageOverrides = {}) {
  const config = makeConfig(configOverrides);
  const msg = makeMessage({ content, ...messageOverrides });
  const result = await checkLinks(msg, config);

  return { result, msg, config };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// extractUrls
// ---------------------------------------------------------------------------

describe('extractUrls', () => {
  it.each([
    ['http URL', 'check out https://example.com/path', ['example.com']],
    ['https URL', 'visit https://evil.xyz/free-nitro', ['evil.xyz']],
    ['www prefix', 'go to https://www.example.com', ['example.com']],
    ['Discord angle-bracket syntax <url>', 'check out <https://example.com/path>', ['example.com']],
    ['trailing period from URL token', 'see https://example.com.', ['example.com']],
    ['trailing-dot hostnames before validation', 'see https://example.com./path', ['example.com']],
    ['trailing comma from URL token', 'visit https://example.com, and more', ['example.com']],
    ['URL in parentheses', '(https://example.com)', ['example.com']],
    ['bare domain without http prefix', 'visit evil.xyz for free stuff', ['evil.xyz']],
    ['bare domain with www prefix', 'go to www.example.com today', ['example.com']],
    [
      'URLs from markdown links',
      'read [the docs](https://evil.com/path) before clicking',
      ['evil.com'],
    ],
    [
      'explicit URLs adjacent to non-whitespace characters',
      'check:https://evil.xyz/free >https://format.example/path',
      ['evil.xyz', 'format.example'],
    ],
  ])('extracts hostname from %s', (_caseName, content, expectedHostnames) => {
    expectExtractedHostnames(content, expectedHostnames);
  });

  it('extracts multiple URLs from one message', () => {
    expectExtractedHostnames('see https://foo.com and https://bar.org', ['foo.com', 'bar.org']);
  });

  it('deduplicates repeated URLs', () => {
    const results = extractUrls('https://evil.com https://evil.com');
    expect(results.filter((r) => r.hostname === 'evil.com')).toHaveLength(1);
  });

  it.each([
    ['no URLs', 'hello world no links here'],
    ['empty string', ''],
  ])('returns empty array for %s', (_caseName, content) => {
    expect(extractUrls(content)).toEqual([]);
  });

  it('does not extract localhost or bare single-label hostnames', () => {
    expect(extractUrls('visit localhost or some-host')).toHaveLength(0);
  });

  it('does not extract plain IP addresses', () => {
    const localIp = '192' + '.168' + '.1.1';
    const results = extractUrls(`connect to ${localIp} for info`);
    expect(results.some((r) => r.hostname === localIp)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// matchPhishingPattern
// ---------------------------------------------------------------------------

describe('matchPhishingPattern', () => {
  it.each([
    ['discord-nitro.xyz domain', 'claim at https://discord-nitro.xyz'],
    ['free-nitro.xyz domain', 'https://free-nitro.xyz/claim'],
    ['.xyz domain with nitro in path', 'https://random.xyz/nitro-free'],
    ['.xyz domain with phishing keywords in query string', 'https://site.xyz/?gift=nitro'],
    [
      '.xyz phishing URLs inside markdown links',
      'claim [free nitro](https://site.xyz/claim?gift=nitro)',
    ],
    ['.xyz domain with discord in URL', 'https://discord.xyz/claim'],
    ['discord-nitro subdomain regardless of TLD', 'https://discord-nitro.com/free'],
    ['discordnitro subdomain', 'https://discordnitro.tk/verify'],
    ['steamgift subdomain', 'https://steamgift.com/win'],
    ['phishing URL in angle brackets', '<https://discord-nitro.xyz/claim>'],
    ['phishing URL with trailing punctuation', 'claim your gift: https://free-nitro.xyz.'],
    ['bare phishing domain without http scheme', 'visit discord-nitro.xyz for free'],
  ])('detects %s', (_caseName, content) => {
    expectPhishingMatch(content);
  });

  it('detects .xyz phishing URLs adjacent to formatting characters', () => {
    expectPhishingMatch('check:https://site.xyz/?gift=nitro');
    expectPhishingMatch('>https://site.xyz/free');
  });

  it.each([
    ['legitimate .xyz domains', 'https://portfolio.xyz/about'],
    ['normal Discord URLs', 'https://discord.com/channels/123/456'],
    ['clean messages', 'hello world'],
    ['.xyz domain with only safe path content', 'https://design.xyz/portfolio/work'],
  ])('does NOT flag %s', (_caseName, content) => {
    expect(matchPhishingPattern(content)).toBeNull();
  });

  it('returns the full URL string of the matched phishing token', () => {
    const result = matchPhishingPattern('claim https://discord-nitro.xyz/win');
    expect(typeof result).toBe('string');
    expect(result).toContain('discord-nitro.xyz');
  });
});

// ---------------------------------------------------------------------------
// checkLinks — disabled
// ---------------------------------------------------------------------------

describe('checkLinks — disabled', () => {
  it('returns { blocked: false } when linkFilter.enabled is false', async () => {
    const { result, msg } = await checkMessageContent('check evil.com', {
      enabled: false,
      blockedDomains: ['evil.com'],
    });
    expect(result).toEqual({ blocked: false });
    expect(msg.delete).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// checkLinks — blocklist
// ---------------------------------------------------------------------------

describe('checkLinks — blocklist matching', () => {
  it('blocks a message containing a blocklisted domain', async () => {
    const { result, msg } = await checkMessageContent('check out https://evil.com/free-stuff', {
      blockedDomains: ['evil.com'],
    });
    expect(result.blocked).toBe(true);
    expect(result.domain).toBe('evil.com');
    expect(msg.delete).toHaveBeenCalledTimes(1);
  });

  it('blocks subdomains of blocklisted domains', async () => {
    const { result } = await checkMessageContent('https://sub.evil.com/path', {
      blockedDomains: ['evil.com'],
    });
    expect(result.blocked).toBe(true);
  });

  it('does NOT block legitimate domains', async () => {
    const { result, msg } = await checkMessageContent('visit https://legitimate.org for help', {
      blockedDomains: ['evil.com'],
    });
    expect(result.blocked).toBe(false);
    expect(msg.delete).not.toHaveBeenCalled();
  });

  it('does NOT block when blockedDomains list is empty', async () => {
    // phishing pattern will catch suspicious domains — use a clean domain.
    const { result } = await checkMessageContent('https://normalsite.org/page', {
      blockedDomains: [],
    });
    expect(result.blocked).toBe(false);
  });

  it('alerts the mod channel with an embed on block', async () => {
    const mockSend = vi.fn();
    await checkMessageContent(
      'see https://bad.io/go',
      { blockedDomains: ['bad.io'], alertChannelId: 'alert-chan' },
      { alertChannelSend: mockSend },
    );
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.any(Array) }));
  });

  it('does not crash if alert channel fetch fails', async () => {
    const { result } = await checkMessageContent(
      'https://bad.io',
      { blockedDomains: ['bad.io'], alertChannelId: 'missing-chan' },
      {
        client: {
          channels: { fetch: vi.fn().mockRejectedValue(new Error('not found')) },
        },
      },
    );
    expect(result.blocked).toBe(true); // still blocked, just no alert
  });

  it('does not crash if message delete fails', async () => {
    const { result } = await checkMessageContent(
      'https://bad.io',
      { blockedDomains: ['bad.io'] },
      { delete: vi.fn().mockRejectedValue(new Error('permissions')) },
    );
    expect(result.blocked).toBe(true);
  });

  it('blocks when blockedDomains entry is mixed-case or has www. prefix', async () => {
    // Config entries like "Evil.Com" or "www.Evil.Com" should still match
    const config = makeConfig({ blockedDomains: ['Evil.Com', 'www.BAD.IO'] });
    const msgEvil = makeMessage({ content: 'visit https://evil.com/page' });
    const msgBad = makeMessage({ content: 'https://bad.io/link' });

    const resultEvil = await checkLinks(msgEvil, config);
    expect(resultEvil.blocked).toBe(true);

    const resultBad = await checkLinks(msgBad, config);
    expect(resultBad.blocked).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// checkLinks — phishing patterns
// ---------------------------------------------------------------------------

describe('checkLinks — phishing patterns', () => {
  it('blocks discord-nitro.xyz phishing link even without blocklist entry', async () => {
    const { result, msg } = await checkMessageContent(
      'get free nitro at https://discord-nitro.xyz/claim',
      { blockedDomains: [] },
    );
    expect(result.blocked).toBe(true);
    expect(msg.delete).toHaveBeenCalledTimes(1);
  });

  it('blocks free-nitro.xyz pattern', async () => {
    const { result } = await checkMessageContent('https://free-nitro.xyz click here', {
      blockedDomains: [],
    });
    expect(result.blocked).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// checkLinks — exemptions
// ---------------------------------------------------------------------------

describe('checkLinks — exemptions', () => {
  it('exempts administrators', async () => {
    const { result, msg } = await checkMessageContent(
      'https://evil.com',
      { blockedDomains: ['evil.com'] },
      { isAdmin: true },
    );
    expect(result.blocked).toBe(false);
    expect(msg.delete).not.toHaveBeenCalled();
  });

  it('exempts users with mod role by ID', async () => {
    const { result } = await checkMessageContent(
      'https://evil.com',
      { blockedDomains: ['evil.com'], modRoles: ['mod-id'] },
      { roleIds: ['mod-id'] },
    );
    expect(result.blocked).toBe(false);
  });

  it('exempts users with mod role by name', async () => {
    const { result } = await checkMessageContent(
      'https://evil.com',
      { blockedDomains: ['evil.com'], modRoles: ['Moderator'] },
      { roleNames: ['Moderator'] },
    );
    expect(result.blocked).toBe(false);
  });

  it('does NOT exempt regular users', async () => {
    const { result } = await checkMessageContent(
      'https://evil.com',
      { blockedDomains: ['evil.com'], modRoles: ['mod-id'] },
      { roleIds: ['user-id'] },
    );
    expect(result.blocked).toBe(true);
  });

  it('exempts admins even from phishing patterns', async () => {
    const { result } = await checkMessageContent(
      'https://discord-nitro.xyz/claim',
      { blockedDomains: [] },
      { isAdmin: true },
    );
    expect(result.blocked).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkLinks — edge cases
// ---------------------------------------------------------------------------

describe('checkLinks — edge cases', () => {
  it('returns { blocked: false } for empty message content', async () => {
    const { result } = await checkMessageContent('', { blockedDomains: ['evil.com'] });
    expect(result).toEqual({ blocked: false });
  });

  it('returns { blocked: false } for message with no URLs', async () => {
    const { result } = await checkMessageContent('just a normal message, nothing to see here', {
      blockedDomains: ['evil.com'],
    });
    expect(result).toEqual({ blocked: false });
  });
});
