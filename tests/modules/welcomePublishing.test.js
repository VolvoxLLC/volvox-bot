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

const GUILD_ID = 'guild-1';
const OLD_CHANNEL = 'old-channel';
const OLD_MESSAGE = 'old-message';
const RULES_CHANNEL = 'rules-channel';
const SENT_MESSAGE = 'sent-message';
const DEFAULT_SENT_MESSAGE = { id: SENT_MESSAGE };
const STORED_AT = '2026-01-01T00:00:00.000Z';
const STATE_WARNING = 'Published to Discord but failed to save publication state.';

function createWelcomeConfig(overrides = {}) {
  return {
    enabled: true,
    rulesChannel: RULES_CHANNEL,
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

function createStoredPublication(overrides = {}) {
  return {
    panel_type: 'rules',
    channel_id: RULES_CHANNEL,
    message_id: 'existing-message',
    config_hash: 'old-hash',
    status: 'posted',
    last_published_at: STORED_AT,
    last_error: null,
    ...overrides,
  };
}

function createSavedPublication(params) {
  return {
    panel_type: params[1],
    channel_id: params[2],
    message_id: params[3],
    config_hash: params[4],
    status: params[5],
    last_error: params[6],
  };
}

function mockPool(query) {
  const pool = { query: vi.fn(query) };
  getPool.mockReturnValue(pool);
  return pool;
}

function mockPublicationPool({ selectRows = [], writeError = null, writeRows = null } = {}) {
  return mockPool(async (sql, params) => {
    if (sql.includes('SELECT')) {
      return { rows: typeof selectRows === 'function' ? selectRows(params) : selectRows };
    }
    if (writeError) throw writeError;
    const rows = typeof writeRows === 'function' ? writeRows(params) : writeRows;
    return { rows: rows ?? [createSavedPublication(params)] };
  });
}

function resetDefaultMocks() {
  vi.resetAllMocks();
  getPool.mockReturnValue(null);
  getConfig.mockReturnValue({ welcome: createWelcomeConfig() });
}

function publishRules(actor) {
  return publishWelcomePanel({}, GUILD_ID, 'rules', actor);
}

function resolveRulesChannel(channel = createTextChannel({ id: RULES_CHANNEL })) {
  fetchChannelCached.mockResolvedValue(channel);
  return channel;
}

function mockSuccessfulSend(message = DEFAULT_SENT_MESSAGE) {
  safeSend.mockResolvedValue(message);
}

function expectPublicationUpsert(pool, params) {
  expect(pool.query).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO welcome_publications'),
    expect.arrayContaining(params),
  );
}

function arrangeChangedChannel({
  deleteLookupFails = false,
  persistFails = false,
  sendFails = false,
} = {}) {
  const previousMessage = { id: OLD_MESSAGE, delete: vi.fn().mockResolvedValue(undefined) };
  const previousChannel = createTextChannel({
    id: OLD_CHANNEL,
    messages: { fetch: vi.fn().mockResolvedValue(previousMessage) },
  });
  const nextChannel = createTextChannel({ id: RULES_CHANNEL });

  fetchChannelCached.mockResolvedValueOnce(nextChannel);
  if (deleteLookupFails) {
    fetchChannelCached.mockRejectedValueOnce(new Error('delete lookup failed'));
  } else {
    fetchChannelCached.mockResolvedValueOnce(previousChannel);
  }
  if (sendFails) {
    safeSend.mockRejectedValue(new Error('discord rejected'));
  } else {
    safeSend.mockResolvedValue({ id: 'new-message' });
  }
  mockPublicationPool({
    selectRows: [createStoredPublication({ channel_id: OLD_CHANNEL, message_id: OLD_MESSAGE })],
    writeError: persistFails ? new Error('insert failed') : null,
  });

  return { previousMessage };
}

describe('welcomePublishing module', () => {
  beforeEach(resetDefaultMocks);

  it('builds configured panel payloads and stable config hashes', () => {
    const config = createWelcomeConfig();

    expect(getWelcomePanelPayload('rules', config)).toMatchObject({
      panelType: 'rules',
      channelId: RULES_CHANNEL,
      configured: true,
    });
    expect(getWelcomePanelPayload('role_menu', config)).toMatchObject({
      panelType: 'role_menu',
      channelId: 'roles-channel',
      configured: true,
    });
    expect(hashWelcomePanelConfig('rules', config)).toBe(hashWelcomePanelConfig('rules', config));
    expect(hashWelcomePanelConfig('rules', config)).not.toBe(
      hashWelcomePanelConfig('rules', { ...config, rulesMessage: 'Changed.' }),
    );
  });

  it('returns null for disabled or unconfigured panels and rejects unknown panel types', () => {
    for (const [panelType, config] of [
      ['rules', createWelcomeConfig({ enabled: false })],
      ['rules', createWelcomeConfig({ rulesChannel: null })],
      ['role_menu', createWelcomeConfig({ roleMenuChannel: null })],
    ]) {
      expect(getWelcomePanelPayload(panelType, config)).toBeNull();
    }
    expect(() => getWelcomePanelPayload('bogus', {})).toThrow('Unknown welcome panel type');
  });

  it('uses the welcome message channel as the legacy role menu channel fallback', () => {
    const payload = getWelcomePanelPayload(
      'role_menu',
      createWelcomeConfig({ channelId: 'legacy-welcome-channel', roleMenuChannel: null }),
    );

    expect(payload).toMatchObject({
      panelType: 'role_menu',
      channelId: 'legacy-welcome-channel',
      configured: true,
    });
    expect(
      hashWelcomePanelConfig(
        'role_menu',
        createWelcomeConfig({ channelId: 'channel-a', roleMenuChannel: null }),
      ),
    ).not.toBe(
      hashWelcomePanelConfig(
        'role_menu',
        createWelcomeConfig({ channelId: 'channel-b', roleMenuChannel: null }),
      ),
    );
  });

  it('marks stored messages stale when welcome publishing is disabled', async () => {
    getConfig.mockReturnValue({ welcome: createWelcomeConfig({ enabled: false }) });
    mockPublicationPool({
      selectRows: [
        createStoredPublication({ channel_id: 'old-rules', message_id: 'rules-message' }),
      ],
    });

    const status = await getWelcomePublicationStatus(GUILD_ID);

    expect(status.panels.rules).toMatchObject({
      configured: false,
      status: 'unconfigured',
      messageId: 'rules-message',
      stale: true,
    });
  });

  it('serializes publication status with stale detection', async () => {
    mockPublicationPool({
      selectRows: (params) =>
        params[1] === 'rules'
          ? [createStoredPublication({ channel_id: 'old-rules', message_id: 'rules-message' })]
          : [],
    });

    const status = await getWelcomePublicationStatus(GUILD_ID);

    expect(status.guildId).toBe(GUILD_ID);
    expect(status.panels.rules).toMatchObject({
      configured: true,
      status: 'posted',
      stale: true,
      channelId: 'old-rules',
      configuredChannelId: RULES_CHANNEL,
    });
    expect(status.panels.role_menu).toMatchObject({
      configured: true,
      status: 'missing',
      stale: false,
      channelId: 'roles-channel',
    });
  });

  it('handles missing database pools and status query failures', async () => {
    getPool.mockImplementationOnce(() => {
      throw new Error('pool unavailable');
    });
    const noPoolStatus = await getWelcomePublicationStatus(GUILD_ID);
    expect(noPoolStatus.panels.rules.status).toBe('missing');

    mockPool(async () => {
      throw new Error('select failed');
    });
    const failedStatus = await getWelcomePublicationStatus(GUILD_ID);
    expect(failedStatus.panels.rules).toMatchObject({ configured: true, status: 'missing' });
  });

  it('publishes a new panel and persists its message id', async () => {
    const channel = resolveRulesChannel();
    mockSuccessfulSend();
    const pool = mockPublicationPool();

    const result = await publishRules({ userId: 'user-1' });

    expect(fetchChannelCached).toHaveBeenCalledWith({}, RULES_CHANNEL, GUILD_ID);
    expect(safeSend).toHaveBeenCalledWith(
      channel,
      expect.objectContaining({ content: 'Accept these rules.' }),
    );
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO welcome_publications'),
      [
        GUILD_ID,
        'rules',
        RULES_CHANNEL,
        SENT_MESSAGE,
        expect.any(String),
        'posted',
        null,
        'user-1',
      ],
    );
    expect(result).toMatchObject({
      status: 'posted',
      messageId: SENT_MESSAGE,
      action: 'created',
      persistWarning: false,
    });
  });

  it('uses the first sent message when safeSend returns split results', async () => {
    resolveRulesChannel();
    mockSuccessfulSend([{ id: 'first-message' }, { id: 'second-message' }]);
    mockPublicationPool();

    await expect(publishRules()).resolves.toMatchObject({ messageId: 'first-message' });
  });

  it('edits an existing message when the tracked message is still present', async () => {
    const existingMessage = { id: 'existing-message', edit: vi.fn() };
    const channel = resolveRulesChannel(
      createTextChannel({
        id: RULES_CHANNEL,
        messages: { fetch: vi.fn().mockResolvedValue(existingMessage) },
      }),
    );
    safeEditMessage.mockResolvedValue(existingMessage);
    mockPublicationPool({ selectRows: [createStoredPublication()] });

    const result = await publishRules();

    expect(channel.messages.fetch).toHaveBeenCalledWith('existing-message');
    expect(safeEditMessage).toHaveBeenCalledWith(
      existingMessage,
      expect.objectContaining({ content: 'Accept these rules.' }),
    );
    expect(safeSend).not.toHaveBeenCalled();
    expect(result.action).toBe('updated');
  });

  it('deletes a stale tracked message after a panel changes channels and persists', async () => {
    const { previousMessage } = arrangeChangedChannel();

    await publishRules();

    expect(fetchChannelCached).toHaveBeenNthCalledWith(2, {}, OLD_CHANNEL, GUILD_ID);
    expect(safeSend.mock.invocationCallOrder[0]).toBeLessThan(
      previousMessage.delete.mock.invocationCallOrder[0],
    );
    expect(previousMessage.delete).toHaveBeenCalled();
  });

  it('does not delete stale tracked messages unless the replacement publish persists', async () => {
    for (const setup of [{ sendFails: true }, { persistFails: true }]) {
      resetDefaultMocks();
      const { previousMessage } = arrangeChangedChannel(setup);

      await publishRules();

      expect(previousMessage.delete).not.toHaveBeenCalled();
    }
  });

  it('continues publishing when stale message deletion fails', async () => {
    arrangeChangedChannel({ deleteLookupFails: true });

    await expect(publishRules()).resolves.toMatchObject({
      status: 'posted',
      messageId: 'new-message',
    });
  });

  it('returns failed status for invalid channels and oversized panel content', async () => {
    fetchChannelCached.mockResolvedValue({ isTextBased: () => false });
    const failedPool = mockPublicationPool({ selectRows: [] });

    await expect(publishWelcomePanel({}, GUILD_ID, 'bogus')).rejects.toThrow(
      'Unknown welcome panel type',
    );
    await expect(publishRules()).resolves.toMatchObject({ status: 'failed', action: 'failed' });
    expectPublicationUpsert(failedPool, [GUILD_ID, 'rules', RULES_CHANNEL, null]);

    const insertSql = failedPool.query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO welcome_publications'),
    )?.[0];
    expect(insertSql).toContain("CASE WHEN $6 = 'posted' THEN NOW() ELSE NULL END");
    expect(insertSql).toContain("WHEN EXCLUDED.status = 'posted' THEN EXCLUDED.last_published_at");

    getConfig.mockReturnValue({ welcome: createWelcomeConfig({ rulesMessage: 'x'.repeat(2001) }) });
    await expect(publishRules()).resolves.toMatchObject({
      status: 'failed',
      lastError: expect.stringContaining('2000 character'),
    });
  });

  it('preserves tracked publication ids when early validation failures are recorded', async () => {
    for (const validationCase of [
      () => fetchChannelCached.mockResolvedValue({ isTextBased: () => false }),
      () =>
        getConfig.mockReturnValue({
          welcome: createWelcomeConfig({ rulesMessage: 'x'.repeat(2001) }),
        }),
    ]) {
      resetDefaultMocks();
      validationCase();
      const pool = mockPublicationPool({
        selectRows: [createStoredPublication({ channel_id: OLD_CHANNEL, message_id: OLD_MESSAGE })],
      });

      const result = await publishRules();

      expect(result).toMatchObject({
        status: 'failed',
        channelId: OLD_CHANNEL,
        messageId: OLD_MESSAGE,
      });
      expectPublicationUpsert(pool, [GUILD_ID, 'rules', OLD_CHANNEL, OLD_MESSAGE]);
    }
  });

  it('still returns failed statuses when failure-state persistence fails', async () => {
    fetchChannelCached.mockResolvedValue({ isTextBased: () => false });
    mockPublicationPool({ writeError: new Error('insert failed') });
    await expect(publishRules()).resolves.toMatchObject({ status: 'failed', action: 'failed' });

    getConfig.mockReturnValue({ welcome: createWelcomeConfig({ rulesMessage: 'x'.repeat(2001) }) });
    await expect(publishRules()).resolves.toMatchObject({ status: 'failed', action: 'failed' });

    getConfig.mockReturnValue({ welcome: createWelcomeConfig() });
    resolveRulesChannel();
    safeSend.mockRejectedValue(new Error('discord rejected'));
    mockPublicationPool({ writeError: new Error('insert failed') });
    await expect(publishRules()).resolves.toMatchObject({
      status: 'failed',
      messageId: null,
      lastError: 'discord rejected',
    });
  });

  it('posts a panel when there is no tracked message id to fetch', async () => {
    resolveRulesChannel();
    mockSuccessfulSend();
    mockPublicationPool({
      selectRows: [createStoredPublication({ message_id: null, status: 'missing' })],
    });

    await expect(publishRules()).resolves.toMatchObject({
      status: 'posted',
      action: 'created',
      messageId: SENT_MESSAGE,
    });
  });

  it('surfaces persistence warnings after Discord publish succeeds', async () => {
    resolveRulesChannel();
    mockSuccessfulSend();
    mockPublicationPool({ writeError: new Error('db down') });

    await expect(publishRules()).resolves.toMatchObject({
      status: 'posted',
      messageId: SENT_MESSAGE,
      persistWarning: true,
      lastError: STATE_WARNING,
    });
  });

  it('skips Discord publishing when stored publication state cannot be read', async () => {
    getPool.mockImplementation(() => {
      throw new Error('pool unavailable');
    });

    await expect(publishRules()).resolves.toMatchObject({
      status: 'failed',
      action: 'failed',
      messageId: null,
      lastError:
        'Unable to read stored welcome publication state; publish was skipped to avoid duplicate Discord messages.',
    });
    expect(fetchChannelCached).not.toHaveBeenCalled();
    expect(safeSend).not.toHaveBeenCalled();
  });

  it('records failed status when Discord publish throws', async () => {
    resolveRulesChannel(
      createTextChannel({
        id: RULES_CHANNEL,
        messages: { fetch: vi.fn().mockRejectedValue(new Error('missing message')) },
      }),
    );
    safeSend.mockRejectedValue(new Error('discord rejected'));
    mockPublicationPool({ selectRows: [createStoredPublication()] });

    await expect(publishRules()).resolves.toMatchObject({
      status: 'failed',
      messageId: 'existing-message',
      lastError: 'discord rejected',
    });
  });

  it('skips unconfigured panels and publishes all panel types', async () => {
    getConfig.mockReturnValue({ welcome: createWelcomeConfig({ rulesChannel: null }) });
    await expect(publishRules()).resolves.toMatchObject({
      status: 'unconfigured',
      action: 'skipped',
      configured: false,
    });

    getConfig.mockReturnValue({ welcome: createWelcomeConfig() });
    resolveRulesChannel();
    mockSuccessfulSend();

    const result = await publishWelcomePanels({}, GUILD_ID);
    expect(result.guildId).toBe(GUILD_ID);
    expect(result.results.map((panel) => panel.panelType)).toEqual(['rules', 'role_menu']);
  });
});
