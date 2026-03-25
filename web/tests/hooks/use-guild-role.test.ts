import { describe, expect, it } from 'vitest';
import { getGuildDashboardRole, isGuildManageable } from '@/hooks/use-guild-role';
import type { MutualGuild } from '@/types/discord';

function createGuild(overrides: Partial<MutualGuild> = {}): MutualGuild {
  return {
    id: 'guild-1',
    name: 'Test Guild',
    icon: null,
    owner: false,
    permissions: '0',
    features: [],
    botPresent: true,
    ...overrides,
  };
}

describe('use-guild-role', () => {
  it('returns owner for guild owners', () => {
    expect(getGuildDashboardRole(createGuild({ owner: true }))).toBe('owner');
  });

  it('returns viewer when permissions cannot be parsed', () => {
    expect(getGuildDashboardRole(createGuild({ permissions: 'nope' }))).toBe('viewer');
  });

  it('returns admin for administrator permissions', () => {
    expect(getGuildDashboardRole(createGuild({ permissions: '8' }))).toBe('admin');
  });

  it('returns admin for manage guild permissions', () => {
    expect(getGuildDashboardRole(createGuild({ permissions: '32' }))).toBe('moderator');
  });

  it('prefers explicit access from the api when provided', () => {
    expect(getGuildDashboardRole(createGuild({ permissions: '0', access: 'moderator' }))).toBe(
      'moderator',
    );
  });

  it('returns moderator for kick members permissions', () => {
    expect(getGuildDashboardRole(createGuild({ permissions: '2' }))).toBe('moderator');
  });

  it('returns moderator for ban members permissions', () => {
    expect(getGuildDashboardRole(createGuild({ permissions: '4' }))).toBe('moderator');
  });

  it('returns moderator for moderate members permissions', () => {
    expect(getGuildDashboardRole(createGuild({ permissions: String(1n << 40n) }))).toBe(
      'moderator',
    );
  });

  it('prefers admin over moderator when both permission tiers are present', () => {
    expect(getGuildDashboardRole(createGuild({ permissions: String(0x8n | 0x2n) }))).toBe(
      'admin',
    );
  });

  it('returns viewer for non-manageable guilds', () => {
    const guild = createGuild({ permissions: '0' });

    expect(getGuildDashboardRole(guild)).toBe('viewer');
    expect(isGuildManageable(guild)).toBe(false);
  });

  it('marks owner, admin, and moderator guilds as manageable', () => {
    expect(isGuildManageable(createGuild({ owner: true }))).toBe(true);
    expect(isGuildManageable(createGuild({ permissions: '8' }))).toBe(true);
    expect(isGuildManageable(createGuild({ permissions: '2' }))).toBe(true);
  });

  it('prefers ownership over a downgraded access field', () => {
    expect(getGuildDashboardRole(createGuild({ owner: true, access: 'viewer' }))).toBe('owner');
  });
});
