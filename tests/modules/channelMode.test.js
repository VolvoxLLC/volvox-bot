import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks (must be before imports) ──────────────────────────────────────────

vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn(() => ({})),
}));
vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

import { getChannelMode } from '../../src/modules/ai.js';
import { getConfig } from '../../src/modules/config.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal ai config object */
function aiConfig(overrides = {}) {
  return { ai: { ...overrides } };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('getChannelMode()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Default fallback ──────────────────────────────────────────────────────

  it('returns "mention" when no config exists', () => {
    getConfig.mockReturnValue({});
    expect(getChannelMode('123', null, 'guild1')).toBe('mention');
  });

  it('returns "mention" when ai config is missing', () => {
    getConfig.mockReturnValue({ moderation: { enabled: true } });
    expect(getChannelMode('123', null, 'guild1')).toBe('mention');
  });

  it('returns "mention" when channelModes is empty object', () => {
    getConfig.mockReturnValue(aiConfig({ channelModes: {} }));
    expect(getChannelMode('999', null, 'guild1')).toBe('mention');
  });

  it('returns "mention" when getConfig throws', () => {
    getConfig.mockImplementation(() => {
      throw new Error('config not loaded');
    });
    expect(getChannelMode('123', null, 'guild1')).toBe('mention');
  });

  // ── defaultChannelMode ────────────────────────────────────────────────────

  it('respects defaultChannelMode = "vibe"', () => {
    getConfig.mockReturnValue(aiConfig({ defaultChannelMode: 'vibe' }));
    expect(getChannelMode('123', null, 'guild1')).toBe('vibe');
  });

  it('respects defaultChannelMode = "off"', () => {
    getConfig.mockReturnValue(aiConfig({ defaultChannelMode: 'off' }));
    expect(getChannelMode('123', null, 'guild1')).toBe('off');
  });

  it('falls back to "mention" when defaultChannelMode is absent', () => {
    getConfig.mockReturnValue(aiConfig({ channelModes: {} }));
    expect(getChannelMode('any', null, 'guild1')).toBe('mention');
  });

  // ── channelModes map ──────────────────────────────────────────────────────

  it('returns per-channel mode when channel is in channelModes', () => {
    getConfig.mockReturnValue(
      aiConfig({ channelModes: { '123': 'off', '456': 'vibe' } }),
    );
    expect(getChannelMode('123', null, 'guild1')).toBe('off');
    expect(getChannelMode('456', null, 'guild1')).toBe('vibe');
  });

  it('falls through to defaultChannelMode for channels not in channelModes', () => {
    getConfig.mockReturnValue(
      aiConfig({ channelModes: { '123': 'off' }, defaultChannelMode: 'vibe' }),
    );
    expect(getChannelMode('999', null, 'guild1')).toBe('vibe');
  });

  // ── Thread parent inheritance ─────────────────────────────────────────────

  it('thread inherits parent channel mode when thread itself is not in channelModes', () => {
    getConfig.mockReturnValue(
      aiConfig({ channelModes: { 'parent-ch': 'vibe' } }),
    );
    expect(getChannelMode('thread-id', 'parent-ch', 'guild1')).toBe('vibe');
  });

  it('thread direct entry takes precedence over parent', () => {
    getConfig.mockReturnValue(
      aiConfig({ channelModes: { 'thread-id': 'off', 'parent-ch': 'vibe' } }),
    );
    expect(getChannelMode('thread-id', 'parent-ch', 'guild1')).toBe('off');
  });

  it('thread with no entry and parent with no entry falls back to default', () => {
    getConfig.mockReturnValue(
      aiConfig({ channelModes: {}, defaultChannelMode: 'mention' }),
    );
    expect(getChannelMode('thread-id', 'parent-ch', 'guild1')).toBe('mention');
  });

  it('thread with null parentId only checks direct channel', () => {
    getConfig.mockReturnValue(
      aiConfig({ channelModes: { 'thread-id': 'vibe' } }),
    );
    expect(getChannelMode('thread-id', null, 'guild1')).toBe('vibe');
  });

  // ── blockedChannelIds overrides ───────────────────────────────────────────

  it('blockedChannelIds returns "off" even when channelModes says "vibe"', () => {
    getConfig.mockReturnValue(
      aiConfig({
        blockedChannelIds: ['blocked-ch'],
        channelModes: { 'blocked-ch': 'vibe' },
      }),
    );
    expect(getChannelMode('blocked-ch', null, 'guild1')).toBe('off');
  });

  it('blocking parent returns "off" for thread even when parent is "vibe" in modes', () => {
    getConfig.mockReturnValue(
      aiConfig({
        blockedChannelIds: ['parent-ch'],
        channelModes: { 'parent-ch': 'vibe' },
      }),
    );
    expect(getChannelMode('thread-id', 'parent-ch', 'guild1')).toBe('off');
  });

  it('empty blockedChannelIds array does not block anything', () => {
    getConfig.mockReturnValue(
      aiConfig({ blockedChannelIds: [], channelModes: { '123': 'vibe' } }),
    );
    expect(getChannelMode('123', null, 'guild1')).toBe('vibe');
  });

  it('non-blocked channel is unaffected by other blocked channels', () => {
    getConfig.mockReturnValue(
      aiConfig({
        blockedChannelIds: ['other-ch'],
        channelModes: { '123': 'vibe' },
      }),
    );
    expect(getChannelMode('123', null, 'guild1')).toBe('vibe');
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  it('handles channelModes being null gracefully', () => {
    getConfig.mockReturnValue(aiConfig({ channelModes: null }));
    expect(getChannelMode('123', null, 'guild1')).toBe('mention');
  });

  it('handles channelModes being a non-object (string) gracefully', () => {
    getConfig.mockReturnValue(aiConfig({ channelModes: 'bad-value' }));
    // typeof 'bad-value' === 'string', not 'object' → falls through to default
    expect(getChannelMode('123', null, 'guild1')).toBe('mention');
  });

  it('passes guildId through to getConfig', () => {
    getConfig.mockReturnValue({});
    getChannelMode('ch', null, 'my-guild');
    expect(getConfig).toHaveBeenCalledWith('my-guild');
  });
});
