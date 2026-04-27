import { createHash } from 'node:crypto';
import { getPool } from '../db.js';
import { info, error as logError, warn } from '../logger.js';
import { fetchChannelCached } from '../utils/discordCache.js';
import { safeEditMessage, safeSend } from '../utils/safeSend.js';
import { DISCORD_MAX_LENGTH } from '../utils/splitMessage.js';
import { getConfig } from './config.js';
import {
  buildRoleMenuMessage,
  buildRulesAgreementMessage,
  normalizeWelcomeOnboardingConfig,
} from './welcomeOnboarding.js';

export const WELCOME_PANEL_TYPES = new Set(['rules', 'role_menu']);

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function getWelcomePanelPayload(panelType, welcomeConfig) {
  if (panelType === 'rules') {
    const onboarding = normalizeWelcomeOnboardingConfig(welcomeConfig);
    if (!onboarding.rulesChannel) return null;
    return {
      panelType,
      channelId: onboarding.rulesChannel,
      message: buildRulesAgreementMessage(welcomeConfig),
      configHash: hashWelcomePanelConfig(panelType, welcomeConfig),
      configured: true,
    };
  }

  if (panelType === 'role_menu') {
    const onboarding = normalizeWelcomeOnboardingConfig(welcomeConfig);
    const message = buildRoleMenuMessage(welcomeConfig);
    if (!message || !onboarding.roleMenuChannel) return null;
    return {
      panelType,
      channelId: onboarding.roleMenuChannel,
      message,
      configHash: hashWelcomePanelConfig(panelType, welcomeConfig),
      configured: true,
    };
  }

  throw new Error(`Unknown welcome panel type: ${panelType}`);
}

export function hashWelcomePanelConfig(panelType, welcomeConfig = {}) {
  const onboarding = normalizeWelcomeOnboardingConfig(welcomeConfig);
  const relevant =
    panelType === 'rules'
      ? {
          panelType,
          channelId: onboarding.rulesChannel,
          rulesMessage: onboarding.rulesMessage,
        }
      : {
          panelType,
          channelId: onboarding.roleMenuChannel,
          roleMenu: onboarding.roleMenu,
        };

  return createHash('sha256').update(stableStringify(relevant)).digest('hex');
}

function getPublicationPool() {
  try {
    return getPool();
  } catch {
    return null;
  }
}

async function getStoredPublication(guildId, panelType) {
  const pool = getPublicationPool();
  if (!pool) return null;

  const { rows } = await pool.query(
    `SELECT guild_id, panel_type, channel_id, message_id, config_hash, status,
            last_published_at, last_error, created_by, updated_at
       FROM welcome_publications
      WHERE guild_id = $1 AND panel_type = $2`,
    [guildId, panelType],
  );
  return rows[0] ?? null;
}

async function upsertPublication(guildId, panelType, values) {
  const pool = getPublicationPool();
  if (!pool) return null;

  const { channelId, messageId, configHash, status, lastError = null, createdBy = null } = values;
  const { rows } = await pool.query(
    `INSERT INTO welcome_publications
       (guild_id, panel_type, channel_id, message_id, config_hash, status,
        last_published_at, last_error, created_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, NOW())
     ON CONFLICT (guild_id, panel_type)
     DO UPDATE SET
       channel_id = EXCLUDED.channel_id,
       message_id = EXCLUDED.message_id,
       config_hash = EXCLUDED.config_hash,
       status = EXCLUDED.status,
       last_published_at = EXCLUDED.last_published_at,
       last_error = EXCLUDED.last_error,
       created_by = COALESCE(EXCLUDED.created_by, welcome_publications.created_by),
       updated_at = NOW()
     RETURNING guild_id, panel_type, channel_id, message_id, config_hash, status,
               last_published_at, last_error, created_by, updated_at`,
    [guildId, panelType, channelId, messageId, configHash, status, lastError, createdBy],
  );
  return rows[0] ?? null;
}

function serializePublication(panelType, payload, stored) {
  if (!payload) {
    return {
      panelType,
      configured: false,
      status: 'unconfigured',
      channelId: stored?.channel_id ?? null,
      messageId: stored?.message_id ?? null,
      stale: false,
      lastPublishedAt: stored?.last_published_at ?? null,
      lastError: stored?.last_error ?? null,
    };
  }

  const stale =
    Boolean(stored?.message_id) &&
    (stored.channel_id !== payload.channelId || stored.config_hash !== payload.configHash);

  return {
    panelType,
    configured: true,
    status: stored?.status ?? 'missing',
    channelId: stored?.channel_id ?? payload.channelId,
    configuredChannelId: payload.channelId,
    messageId: stored?.message_id ?? null,
    stale,
    lastPublishedAt: stored?.last_published_at ?? null,
    lastError: stored?.last_error ?? null,
  };
}

function getPayloadContentLength(messagePayload) {
  if (typeof messagePayload === 'string') return messagePayload.length;
  if (typeof messagePayload?.content === 'string') return messagePayload.content.length;
  return 0;
}

export async function getWelcomePublicationStatus(guildId) {
  const config = getConfig(guildId);
  const panels = {};

  for (const panelType of WELCOME_PANEL_TYPES) {
    const payload = getWelcomePanelPayload(panelType, config?.welcome);
    const stored = await getStoredPublication(guildId, panelType).catch((err) => {
      warn('Failed to read welcome publication status', {
        guildId,
        panelType,
        error: err.message,
      });
      return null;
    });
    panels[panelType] = serializePublication(panelType, payload, stored);
  }

  return { guildId, panels };
}

async function fetchExistingMessage(channel, messageId) {
  if (!messageId || typeof channel?.messages?.fetch !== 'function') return null;
  return channel.messages.fetch(messageId).catch(() => null);
}

async function deleteStoredPublicationMessage(client, guildId, panelType, stored, nextChannelId) {
  if (!stored?.message_id || !stored?.channel_id || stored.channel_id === nextChannelId) return;

  try {
    const previousChannel = await fetchChannelCached(client, stored.channel_id, guildId);
    const previousMessage = await fetchExistingMessage(previousChannel, stored.message_id);
    if (typeof previousMessage?.delete === 'function') {
      await previousMessage.delete();
      info('Deleted stale welcome panel message', {
        guildId,
        panelType,
        channelId: stored.channel_id,
        messageId: stored.message_id,
      });
    }
  } catch (err) {
    warn('Failed to delete stale welcome panel message', {
      guildId,
      panelType,
      channelId: stored.channel_id,
      messageId: stored.message_id,
      error: err.message,
    });
  }
}

export async function publishWelcomePanel(client, guildId, panelType, actor = {}) {
  if (!WELCOME_PANEL_TYPES.has(panelType)) {
    throw new Error(`Unknown welcome panel type: ${panelType}`);
  }

  const config = getConfig(guildId);
  const payload = getWelcomePanelPayload(panelType, config?.welcome);
  if (!payload) {
    return {
      panelType,
      status: 'unconfigured',
      configured: false,
      channelId: null,
      messageId: null,
      action: 'skipped',
      lastError: null,
    };
  }

  if (getPayloadContentLength(payload.message) > DISCORD_MAX_LENGTH) {
    const lastError = `Welcome panel content exceeds Discord's ${DISCORD_MAX_LENGTH} character message limit`;
    await upsertPublication(guildId, panelType, {
      channelId: payload.channelId,
      messageId: null,
      configHash: payload.configHash,
      status: 'failed',
      lastError,
      createdBy: actor.userId ?? null,
    }).catch(() => null);
    return {
      panelType,
      status: 'failed',
      configured: true,
      channelId: payload.channelId,
      messageId: null,
      action: 'failed',
      lastError,
    };
  }

  const channel = await fetchChannelCached(client, payload.channelId, guildId);
  if (!channel?.isTextBased?.()) {
    const lastError = `Configured channel ${payload.channelId} was not found or is not text-based`;
    await upsertPublication(guildId, panelType, {
      channelId: payload.channelId,
      messageId: null,
      configHash: payload.configHash,
      status: 'failed',
      lastError,
      createdBy: actor.userId ?? null,
    }).catch(() => null);
    return {
      panelType,
      status: 'failed',
      configured: true,
      channelId: payload.channelId,
      messageId: null,
      action: 'failed',
      lastError,
    };
  }

  const stored = await getStoredPublication(guildId, panelType).catch(() => null);
  const existing =
    stored?.channel_id === payload.channelId
      ? await fetchExistingMessage(channel, stored?.message_id)
      : null;
  await deleteStoredPublicationMessage(client, guildId, panelType, stored, payload.channelId);

  try {
    const message = existing
      ? await safeEditMessage(existing, payload.message)
      : await safeSend(channel, payload.message);
    const sentMessage = Array.isArray(message) ? message[0] : message;
    const publishedMessageId = sentMessage?.id ?? stored?.message_id ?? null;
    let persistWarning = null;

    const saved = await upsertPublication(guildId, panelType, {
      channelId: payload.channelId,
      messageId: publishedMessageId,
      configHash: payload.configHash,
      status: 'posted',
      lastError: null,
      createdBy: actor.userId ?? null,
    }).catch((err) => {
      persistWarning = 'Published to Discord but failed to save publication state.';
      warn('Failed to persist welcome publication state', {
        guildId,
        panelType,
        channelId: payload.channelId,
        messageId: publishedMessageId,
        error: err.message,
      });
      return null;
    });

    info('Welcome panel published', {
      guildId,
      panelType,
      channelId: payload.channelId,
      messageId: publishedMessageId,
      action: existing ? 'updated' : 'created',
      actor: actor.userId ?? null,
      persisted: Boolean(saved),
    });

    return {
      panelType,
      status: 'posted',
      configured: true,
      channelId: payload.channelId,
      messageId: saved?.message_id ?? publishedMessageId,
      action: existing ? 'updated' : 'created',
      stale: false,
      lastError: persistWarning,
      persistWarning: Boolean(persistWarning),
    };
  } catch (err) {
    logError('Failed to publish welcome panel', {
      guildId,
      panelType,
      channelId: payload.channelId,
      error: err.message,
    });
    await upsertPublication(guildId, panelType, {
      channelId: payload.channelId,
      messageId: stored?.message_id ?? null,
      configHash: payload.configHash,
      status: 'failed',
      lastError: err.message,
      createdBy: actor.userId ?? null,
    }).catch(() => null);
    return {
      panelType,
      status: 'failed',
      configured: true,
      channelId: payload.channelId,
      messageId: stored?.message_id ?? null,
      action: 'failed',
      lastError: err.message,
    };
  }
}

export async function publishWelcomePanels(client, guildId, actor = {}) {
  const results = [];
  for (const panelType of WELCOME_PANEL_TYPES) {
    results.push(await publishWelcomePanel(client, guildId, panelType, actor));
  }
  return { guildId, results };
}
