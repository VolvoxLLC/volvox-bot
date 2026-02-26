import { afterEach, describe, expect, it, vi } from 'vitest';

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

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// extractUrls
// ---------------------------------------------------------------------------

describe('extractUrls', () => {
  it('extracts hostname from http URL', () => {
    const results = extractUrls('check out https://example.com/path');
    expect(results).toContainEqual(expect.objectContaining({ hostname: 'example.com' }));
  });

  it('extracts hostname from https URL', () => {
    const results = extractUrls('visit https://evil.xyz/free-nitro');
    expect(results.some((r) => r.hostname === 'evil.xyz')).toBe(true);
  });

  it('strips www prefix', () => {
    const results = extractUrls('go to https://www.example.com');
    expect(results.some((r) => r.hostname === 'example.com')).toBe(true);
  });

  it('extracts multiple URLs from one message', () => {
    const results = extractUrls('see https://foo.com and https://bar.org');
    const hostnames = results.map((r) => r.hostname);
    expect(hostnames).toContain('foo.com');
    expect(hostnames).toContain('bar.org');
  });

  it('deduplicates repeated URLs', () => {
    const results = extractUrls('https://evil.com https://evil.com');
    expect(results.filter((r) => r.hostname === 'evil.com')).toHaveLength(1);
  });

  it('returns empty array for no URLs', () => {
    expect(extractUrls('hello world no links here')).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(extractUrls('')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// matchPhishingPattern
// ---------------------------------------------------------------------------

describe('matchPhishingPattern', () => {
  it('detects discord-nitro.xyz domain', () => {
    expect(matchPhishingPattern('claim at https://discord-nitro.xyz')).toBeTruthy();
  });

  it('detects free-nitro.xyz domain', () => {
    expect(matchPhishingPattern('https://free-nitro.xyz/claim')).toBeTruthy();
  });

  it('detects .xyz domain with nitro in path', () => {
    expect(matchPhishingPattern('https://random.xyz/nitro-free')).toBeTruthy();
  });

  it('detects .xyz domain with discord in URL', () => {
    expect(matchPhishingPattern('https://discord.xyz/claim')).toBeTruthy();
  });

  it('detects discord-nitro subdomain regardless of TLD', () => {
    expect(matchPhishingPattern('https://discord-nitro.com/free')).toBeTruthy();
  });

  it('detects discordnitro subdomain', () => {
    expect(matchPhishingPattern('https://discordnitro.tk/verify')).toBeTruthy();
  });

  it('detects steamgift subdomain', () => {
    expect(matchPhishingPattern('https://steamgift.com/win')).toBeTruthy();
  });

  it('does NOT flag legitimate .xyz domains', () => {
    // An xyz domain with none of the scam keywords
    expect(matchPhishingPattern('https://portfolio.xyz/about')).toBeNull();
  });

  it('does NOT flag normal Discord URLs', () => {
    expect(matchPhishingPattern('https://discord.com/channels/123/456')).toBeNull();
  });

  it('returns null for clean messages', () => {
    expect(matchPhishingPattern('hello world')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// checkLinks — disabled
// ---------------------------------------------------------------------------

describe('checkLinks — disabled', () => {
  it('returns { blocked: false } when linkFilter.enabled is false', async () => {
    const config = makeConfig({ enabled: false, blockedDomains: ['evil.com'] });
    const msg = makeMessage({ content: 'check evil.com' });

    const result = await checkLinks(msg, config);
    expect(result).toEqual({ blocked: false });
    expect(msg.delete).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// checkLinks — blocklist
// ---------------------------------------------------------------------------

describe('checkLinks — blocklist matching', () => {
  it('blocks a message containing a blocklisted domain', async () => {
    const config = makeConfig({ blockedDomains: ['evil.com'] });
    const msg = makeMessage({ content: 'check out https://evil.com/free-stuff' });

    const result = await checkLinks(msg, config);
    expect(result.blocked).toBe(true);
    expect(result.domain).toBe('evil.com');
    expect(msg.delete).toHaveBeenCalledTimes(1);
  });

  it('blocks subdomains of blocklisted domains', async () => {
    const config = makeConfig({ blockedDomains: ['evil.com'] });
    const msg = makeMessage({ content: 'https://sub.evil.com/path' });

    const result = await checkLinks(msg, config);
    expect(result.blocked).toBe(true);
  });

  it('does NOT block legitimate domains', async () => {
    const config = makeConfig({ blockedDomains: ['evil.com'] });
    const msg = makeMessage({ content: 'visit https://legitimate.org for help' });

    const result = await checkLinks(msg, config);
    expect(result.blocked).toBe(false);
    expect(msg.delete).not.toHaveBeenCalled();
  });

  it('does NOT block when blockedDomains list is empty', async () => {
    const config = makeConfig({ blockedDomains: [] });
    const _msg = makeMessage({ content: 'https://anything.xyz/free-bitcoin' });

    // phishing pattern will catch this one — let's use a clean domain
    const msg2 = makeMessage({ content: 'https://normalsite.org/page' });
    const result = await checkLinks(msg2, config);
    expect(result.blocked).toBe(false);
  });

  it('alerts the mod channel with an embed on block', async () => {
    const mockSend = vi.fn();
    const config = makeConfig({ blockedDomains: ['bad.io'], alertChannelId: 'alert-chan' });
    const msg = makeMessage({ content: 'see https://bad.io/go', alertChannelSend: mockSend });

    await checkLinks(msg, config);
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.any(Array) }));
  });

  it('does not crash if alert channel fetch fails', async () => {
    const config = makeConfig({ blockedDomains: ['bad.io'], alertChannelId: 'missing-chan' });
    const msg = makeMessage({ content: 'https://bad.io' });
    msg.client.channels.fetch = vi.fn().mockRejectedValue(new Error('not found'));

    const result = await checkLinks(msg, config);
    expect(result.blocked).toBe(true); // still blocked, just no alert
  });

  it('does not crash if message delete fails', async () => {
    const config = makeConfig({ blockedDomains: ['bad.io'] });
    const msg = makeMessage({ content: 'https://bad.io' });
    msg.delete = vi.fn().mockRejectedValue(new Error('permissions'));

    const result = await checkLinks(msg, config);
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
    const config = makeConfig({ blockedDomains: [] });
    const msg = makeMessage({ content: 'get free nitro at https://discord-nitro.xyz/claim' });

    const result = await checkLinks(msg, config);
    expect(result.blocked).toBe(true);
    expect(msg.delete).toHaveBeenCalledTimes(1);
  });

  it('blocks free-nitro.xyz pattern', async () => {
    const config = makeConfig({ blockedDomains: [] });
    const msg = makeMessage({ content: 'https://free-nitro.xyz click here' });

    const result = await checkLinks(msg, config);
    expect(result.blocked).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// checkLinks — exemptions
// ---------------------------------------------------------------------------

describe('checkLinks — exemptions', () => {
  it('exempts administrators', async () => {
    const config = makeConfig({ blockedDomains: ['evil.com'] });
    const msg = makeMessage({ content: 'https://evil.com', isAdmin: true });

    const result = await checkLinks(msg, config);
    expect(result.blocked).toBe(false);
    expect(msg.delete).not.toHaveBeenCalled();
  });

  it('exempts users with mod role by ID', async () => {
    const config = makeConfig({ blockedDomains: ['evil.com'], modRoles: ['mod-id'] });
    const msg = makeMessage({ content: 'https://evil.com', roleIds: ['mod-id'] });

    const result = await checkLinks(msg, config);
    expect(result.blocked).toBe(false);
  });

  it('exempts users with mod role by name', async () => {
    const config = makeConfig({ blockedDomains: ['evil.com'], modRoles: ['Moderator'] });
    const msg = makeMessage({ content: 'https://evil.com', roleNames: ['Moderator'] });

    const result = await checkLinks(msg, config);
    expect(result.blocked).toBe(false);
  });

  it('does NOT exempt regular users', async () => {
    const config = makeConfig({ blockedDomains: ['evil.com'], modRoles: ['mod-id'] });
    const msg = makeMessage({ content: 'https://evil.com', roleIds: ['user-id'] });

    const result = await checkLinks(msg, config);
    expect(result.blocked).toBe(true);
  });

  it('exempts admins even from phishing patterns', async () => {
    const config = makeConfig({ blockedDomains: [] });
    const msg = makeMessage({
      content: 'https://discord-nitro.xyz/claim',
      isAdmin: true,
    });

    const result = await checkLinks(msg, config);
    expect(result.blocked).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkLinks — edge cases
// ---------------------------------------------------------------------------

describe('checkLinks — edge cases', () => {
  it('returns { blocked: false } for empty message content', async () => {
    const config = makeConfig({ blockedDomains: ['evil.com'] });
    const msg = makeMessage({ content: '' });

    const result = await checkLinks(msg, config);
    expect(result).toEqual({ blocked: false });
  });

  it('returns { blocked: false } for message with no URLs', async () => {
    const config = makeConfig({ blockedDomains: ['evil.com'] });
    const msg = makeMessage({ content: 'just a normal message, nothing to see here' });

    const result = await checkLinks(msg, config);
    expect(result).toEqual({ blocked: false });
  });
});
