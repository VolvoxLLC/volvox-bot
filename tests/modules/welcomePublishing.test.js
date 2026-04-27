import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/db.js', () => ({
  getPool: vi.fn(),
}));

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn(),
}));

vi.mock('../../src/utils/discordCache.js', () => ({
  fetchChannelCached: vi.fn(),
}));

vi.mock('../../src/utils/safeSend.js', () => ({
  safeEditMessage: vi.fn(),
  safeSend: vi.fn(),
}));

import { getPool } from '../../src/db.js';
import { getConfig } from '../../src/modules/config.js';
import {
  getWelcomePanelPayload,
  getWelcomePublicationStatus,
  hashWelcomePanelConfig,
  publishWelcomePanel,
  publishWelcomePanels,
} from '../../src/modules/welcomePublishing.js';
import { fetchChannelCached } from '../../src/utils/discordCache.js';
import { safeEditMessage, safeSend } from '../../src/utils/safeSend.js';

function createWelcomeConfig(overrides = {}) {
  return {
    rulesChannel: 'rules-channel',
    roleMenuChannel: 'roles-channel',
    rulesMessage: 'Accept these rules.',
    roleMenu: {
      enabled: true,
      message: 'Pick a role.',
      options: [{ label: 'Updates', roleId: 'role-1' }],
    },
    ...overrides,
  };
}

function createTextChannel(overrides = {}) {
  return {
    id: 'channel-1',
    isTextBased: () => true,
    messages: {
      fetch: vi.fn(),
    },
    ...overrides,
  };
}

function mockPool(query) {
  const pool = { query: vi.fn(query) };
  getPool.mockReturnValue(pool);
  return pool;
}

describe('welcomePublishing module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPool.mockReturnValue(null);
    getConfig.mockReturnValue({ welcome: createWelcomeConfig() });
  });

  it('builds configured panel payloads and stable config hashes', () => {
    const config = createWelcomeConfig();
    const rulesPayload = getWelcomePanelPayload('rules', config);
    const rolePayload = getWelcomePanelPayload('role_menu', config);

    expect(rulesPayload).toMatchObject({
      panelType: 'rules',
      channelId: 'rules-channel',
      configured: true,
    });
    expect(rolePayload).toMatchObject({
      panelType: 'role_menu',
      channelId: 'roles-channel',
      configured: true,
    });
    expect(hashWelcomePanelConfig('rules', config)).toBe(hashWelcomePanelConfig('rules', config));
    expect(hashWelcomePanelConfig('rules', config)).not.toBe(
      hashWelcomePanelConfig('rules', { ...config, rulesMessage: 'Changed.' }),
    );
  });

  it('returns null for unconfigured panels and rejects unknown panel types', () => {
    expect(getWelcomePanelPayload('rules', createWelcomeConfig({ rulesChannel: null }))).toBeNull();
    expect(
      getWelcomePanelPayload(
        'role_menu',
        createWelcomeConfig({
          roleMenuChannel: null,
        }),
      ),
    ).toBeNull();
    expect(() => getWelcomePanelPayload('bogus', {})).toThrow('Unknown welcome panel type');
  });

  it('serializes publication status with stale detection', async () => {
    getConfig.mockReturnValue({ welcome: createWelcomeConfig() });
    mockPool(async (_sql, params) => ({
      rows:
        params[1] === 'rules'
          ? [
              {
                panel_type: 'rules',
                channel_id: 'old-rules',
                message_id: 'rules-message',
                config_hash: 'old-hash',
                status: 'posted',
                last_published_at: '2026-01-01T00:00:00.000Z',
                last_error: null,
              },
            ]
          : [],
    }));

    const status = await getWelcomePublicationStatus('guild-1');

    expect(status.guildId).toBe('guild-1');
    expect(status.panels.rules).toMatchObject({
      configured: true,
      status: 'posted',
      stale: true,
      channelId: 'old-rules',
      configuredChannelId: 'rules-channel',
    });
    expect(status.panels.role_menu).toMatchObject({
      configured: true,
      status: 'missing',
      stale: false,
      channelId: 'roles-channel',
    });
  });

  it('publishes a new panel and persists its message id', async () => {
    const channel = createTextChannel({ id: 'rules-channel' });
    fetchChannelCached.mockResolvedValue(channel);
    safeSend.mockResolvedValue({ id: 'sent-message' });
    const pool = mockPool(async (sql, params) => {
      if (sql.includes('SELECT')) return { rows: [] };
      return {
        rows: [
          {
            panel_type: params[1],
            channel_id: params[2],
            message_id: params[3],
            config_hash: params[4],
            status: params[5],
            last_error: params[6],
          },
        ],
      };
    });

    const result = await publishWelcomePanel({}, 'guild-1', 'rules', { userId: 'user-1' });

    expect(fetchChannelCached).toHaveBeenCalledWith({}, 'rules-channel', 'guild-1');
    expect(safeSend).toHaveBeenCalledWith(
      channel,
      expect.objectContaining({ content: 'Accept these rules.' }),
    );
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO welcome_publications'),
      [
        'guild-1',
        'rules',
        'rules-channel',
        'sent-message',
        expect.any(String),
        'posted',
        null,
        'user-1',
      ],
    );
    expect(result).toMatchObject({
      status: 'posted',
      messageId: 'sent-message',
      action: 'created',
      persistWarning: false,
    });
  });

  it('edits an existing message when the tracked message is still present', async () => {
    const existingMessage = { id: 'existing-message', edit: vi.fn() };
    const channel = createTextChannel({
      id: 'rules-channel',
      messages: { fetch: vi.fn().mockResolvedValue(existingMessage) },
    });
    fetchChannelCached.mockResolvedValue(channel);
    safeEditMessage.mockResolvedValue(existingMessage);
    mockPool(async (sql, params) => {
      if (sql.includes('SELECT')) {
        return {
          rows: [
            {
              panel_type: params[1],
              channel_id: 'rules-channel',
              message_id: 'existing-message',
              config_hash: 'old-hash',
              status: 'posted',
            },
          ],
        };
      }
      return { rows: [{ channel_id: params[2], message_id: params[3], status: params[5] }] };
    });

    const result = await publishWelcomePanel({}, 'guild-1', 'rules');

    expect(channel.messages.fetch).toHaveBeenCalledWith('existing-message');
    expect(safeEditMessage).toHaveBeenCalledWith(
      existingMessage,
      expect.objectContaining({ content: 'Accept these rules.' }),
    );
    expect(safeSend).not.toHaveBeenCalled();
    expect(result.action).toBe('updated');
  });

  it('deletes a stale tracked message when a panel changes channels', async () => {
    const previousMessage = { id: 'old-message', delete: vi.fn().mockResolvedValue(undefined) };
    const previousChannel = createTextChannel({
      id: 'old-channel',
      messages: { fetch: vi.fn().mockResolvedValue(previousMessage) },
    });
    const nextChannel = createTextChannel({ id: 'rules-channel' });
    fetchChannelCached.mockResolvedValueOnce(nextChannel).mockResolvedValueOnce(previousChannel);
    safeSend.mockResolvedValue({ id: 'new-message' });
    mockPool(async (sql, params) => {
      if (sql.includes('SELECT')) {
        return {
          rows: [
            {
              panel_type: params[1],
              channel_id: 'old-channel',
              message_id: 'old-message',
              config_hash: 'old-hash',
              status: 'posted',
            },
          ],
        };
      }
      return { rows: [{ channel_id: params[2], message_id: params[3], status: params[5] }] };
    });

    await publishWelcomePanel({}, 'guild-1', 'rules');

    expect(fetchChannelCached).toHaveBeenNthCalledWith(2, {}, 'old-channel', 'guild-1');
    expect(previousMessage.delete).toHaveBeenCalled();
  });

  it('returns failed status for invalid channels and oversized panel content', async () => {
    fetchChannelCached.mockResolvedValue({ isTextBased: () => false });
    const failedPool = mockPool(async () => ({ rows: [] }));

    await expect(publishWelcomePanel({}, 'guild-1', 'bogus')).rejects.toThrow(
      'Unknown welcome panel type',
    );

    const invalidChannel = await publishWelcomePanel({}, 'guild-1', 'rules');
    expect(invalidChannel).toMatchObject({ status: 'failed', action: 'failed' });
    expect(failedPool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO welcome_publications'),
      expect.arrayContaining(['guild-1', 'rules', 'rules-channel', null]),
    );

    getConfig.mockReturnValue({
      welcome: createWelcomeConfig({ rulesMessage: 'x'.repeat(2001) }),
    });
    const oversized = await publishWelcomePanel({}, 'guild-1', 'rules');
    expect(oversized).toMatchObject({
      status: 'failed',
      lastError: expect.stringContaining('2000 character'),
    });
  });

  it('surfaces persistence warnings after Discord publish succeeds', async () => {
    const channel = createTextChannel({ id: 'rules-channel' });
    fetchChannelCached.mockResolvedValue(channel);
    safeSend.mockResolvedValue({ id: 'sent-message' });
    mockPool(async (sql) => {
      if (sql.includes('SELECT')) return { rows: [] };
      throw new Error('db down');
    });

    const result = await publishWelcomePanel({}, 'guild-1', 'rules');

    expect(result).toMatchObject({
      status: 'posted',
      messageId: 'sent-message',
      persistWarning: true,
      lastError: 'Published to Discord but failed to save publication state.',
    });
  });

  it('skips unconfigured panels and publishes all panel types', async () => {
    getConfig.mockReturnValue({ welcome: createWelcomeConfig({ rulesChannel: null }) });
    await expect(publishWelcomePanel({}, 'guild-1', 'rules')).resolves.toMatchObject({
      status: 'unconfigured',
      action: 'skipped',
      configured: false,
    });

    getConfig.mockReturnValue({ welcome: createWelcomeConfig() });
    fetchChannelCached.mockResolvedValue(createTextChannel());
    safeSend.mockResolvedValue({ id: 'sent-message' });

    const result = await publishWelcomePanels({}, 'guild-1');
    expect(result.guildId).toBe('guild-1');
    expect(result.results.map((panel) => panel.panelType)).toEqual(['rules', 'role_menu']);
  });
});
