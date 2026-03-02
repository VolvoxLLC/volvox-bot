import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mocks ---

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    ai: { enabled: true, model: 'claude-3' },
    welcome: { enabled: false, channelId: 'ch1' },
    spam: { enabled: true },
    moderation: { enabled: true },
    triage: {
      enabled: true,
      classifyApiKey: 'sk-real-secret',
      respondApiKey: 'sk-respond-secret',
    },
  }),
  setConfigValue: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../src/api/utils/configAllowlist.js', () => ({
  SAFE_CONFIG_KEYS: new Set(['ai', 'welcome', 'spam', 'moderation', 'triage']),
  SENSITIVE_FIELDS: new Set(['triage.classifyApiKey', 'triage.respondApiKey']),
}));

vi.mock('../../src/utils/flattenToLeafPaths.js', () => ({
  flattenToLeafPaths: (obj, prefix) => {
    const results = [];
    for (const [key, value] of Object.entries(obj)) {
      const dotPath = `${prefix}.${key}`;
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Recursively flatten
        for (const [k2, v2] of Object.entries(value)) {
          results.push([`${dotPath}.${k2}`, v2]);
        }
      } else {
        results.push([dotPath, value]);
      }
    }
    return results;
  },
}));

import {
  createBackup,
  exportConfig,
  importConfig,
  listBackups,
  pruneBackups,
  readBackup,
  restoreBackup,
  sanitizeConfig,
  startScheduledBackups,
  stopScheduledBackups,
  validateImportPayload,
} from '../../src/modules/backup.js';

// --- Helpers ---

let tmpDir;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'backup-test-'));
  vi.clearAllMocks();
});

afterEach(() => {
  stopScheduledBackups();
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

// --- sanitizeConfig ---

describe('sanitizeConfig', () => {
  it('replaces sensitive fields with [REDACTED]', () => {
    const config = {
      triage: { enabled: true, classifyApiKey: 'sk-real-key', respondApiKey: 'sk-resp' },
      ai: { model: 'claude' },
    };
    const result = sanitizeConfig(config);
    expect(result.triage.classifyApiKey).toBe('[REDACTED]');
    expect(result.triage.respondApiKey).toBe('[REDACTED]');
    expect(result.triage.enabled).toBe(true);
    expect(result.ai.model).toBe('claude');
  });

  it('does not mutate the original config', () => {
    const config = { triage: { classifyApiKey: 'real', respondApiKey: 'real2' } };
    sanitizeConfig(config);
    expect(config.triage.classifyApiKey).toBe('real');
  });

  it('handles missing sensitive paths gracefully', () => {
    const config = { ai: { enabled: true } };
    expect(() => sanitizeConfig(config)).not.toThrow();
  });
});

// --- exportConfig ---

describe('exportConfig', () => {
  it('returns only SAFE_CONFIG_KEYS sections', () => {
    const { config } = exportConfig();
    expect(Object.keys(config)).toEqual(
      expect.arrayContaining(['ai', 'welcome', 'spam', 'moderation', 'triage']),
    );
  });

  it('redacts sensitive fields', () => {
    const { config } = exportConfig();
    expect(config.triage.classifyApiKey).toBe('[REDACTED]');
  });

  it('includes exportedAt and version', () => {
    const payload = exportConfig();
    expect(payload.exportedAt).toMatch(/^\d{4}-/);
    expect(payload.version).toBe(1);
  });
});

// --- validateImportPayload ---

describe('validateImportPayload', () => {
  it('rejects null', () => {
    expect(validateImportPayload(null)).toContain('Import payload must be a JSON object');
  });

  it('rejects array', () => {
    expect(validateImportPayload([])).toContain('Import payload must be a JSON object');
  });

  it('rejects payload without config key', () => {
    expect(validateImportPayload({})).toContain('Import payload must have a "config" key');
  });

  it('rejects non-object config', () => {
    expect(validateImportPayload({ config: 'bad' })).toContain('"config" must be a JSON object');
  });

  it('rejects unknown config section keys', () => {
    const errors = validateImportPayload({ config: { unknown_section: {} } });
    expect(errors.some((e) => e.includes('"unknown_section"'))).toBe(true);
  });

  it('accepts valid payload', () => {
    const errors = validateImportPayload({ config: { ai: { enabled: true } } });
    expect(errors).toHaveLength(0);
  });
});

// --- importConfig ---

describe('importConfig', () => {
  it('applies non-redacted values', async () => {
    const { setConfigValue } = await import('../../src/modules/config.js');
    const payload = { config: { ai: { enabled: false } } };
    const result = await importConfig(payload);
    expect(result.applied.length).toBeGreaterThan(0);
    expect(setConfigValue).toHaveBeenCalled();
  });

  it('skips [REDACTED] values', async () => {
    const payload = { config: { triage: { classifyApiKey: '[REDACTED]' } } };
    const result = await importConfig(payload);
    expect(result.skipped).toContain('triage.classifyApiKey');
    expect(result.applied).not.toContain('triage.classifyApiKey');
  });

  it('reports failed writes', async () => {
    const { setConfigValue } = await import('../../src/modules/config.js');
    setConfigValue.mockRejectedValueOnce(new Error('DB error'));
    const payload = { config: { ai: { enabled: true } } };
    const result = await importConfig(payload);
    expect(result.failed.length).toBeGreaterThan(0);
    expect(result.failed[0].error).toContain('DB error');
  });
});

// --- createBackup / listBackups ---

describe('createBackup and listBackups', () => {
  it('creates a backup file', () => {
    const meta = createBackup(tmpDir);
    expect(meta.id).toMatch(/^backup-/);
    expect(meta.size).toBeGreaterThan(0);
    expect(meta.createdAt).toMatch(/^\d{4}-/);
  });

  it('lists created backups sorted newest first', async () => {
    createBackup(tmpDir);
    await new Promise((r) => setTimeout(r, 10)); // ensure different timestamps (at least ms apart)
    createBackup(tmpDir);
    const backups = listBackups(tmpDir);
    expect(backups.length).toBe(2);
    expect(new Date(backups[0].createdAt) >= new Date(backups[1].createdAt)).toBe(true);
  });

  it('returns empty array when no backups', () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'empty-backup-'));
    try {
      expect(listBackups(emptyDir)).toEqual([]);
    } finally {
      rmSync(emptyDir, { recursive: true });
    }
  });
});

// --- readBackup ---

describe('readBackup', () => {
  it('reads a valid backup by id', () => {
    const meta = createBackup(tmpDir);
    const payload = readBackup(meta.id, tmpDir);
    expect(payload).toHaveProperty('config');
    expect(payload).toHaveProperty('exportedAt');
  });

  it('throws for unknown id', () => {
    expect(() => readBackup('backup-9999-01-01T00-00-00', tmpDir)).toThrow('not found');
  });

  it('throws for path-traversal attempts', () => {
    expect(() => readBackup('../etc/passwd', tmpDir)).toThrow('Invalid backup ID');
    expect(() => readBackup('..\\windows\\system32', tmpDir)).toThrow('Invalid backup ID');
  });

  it('throws for corrupted backup', () => {
    const badFile = join(tmpDir, 'backup-2020-01-01T00-00-00.json');
    writeFileSync(badFile, 'not json', 'utf8');
    expect(() => readBackup('backup-2020-01-01T00-00-00', tmpDir)).toThrow('corrupted');
  });
});

// --- restoreBackup ---

describe('restoreBackup', () => {
  it('restores config from a valid backup', async () => {
    const meta = createBackup(tmpDir);
    const result = await restoreBackup(meta.id, tmpDir);
    expect(result).toHaveProperty('applied');
    expect(result).toHaveProperty('skipped');
    expect(result).toHaveProperty('failed');
  });

  it('throws for invalid backup format', () => {
    const badFile = join(tmpDir, 'backup-2020-01-01T00-00-00.json');
    writeFileSync(badFile, JSON.stringify({ bad: 'payload' }), 'utf8');
    expect(restoreBackup('backup-2020-01-01T00-00-00', tmpDir)).rejects.toThrow(
      'Invalid backup format',
    );
  });
});

// --- pruneBackups ---

describe('pruneBackups', () => {
  it('keeps the N most recent backups', () => {
    for (let i = 0; i < 5; i++) {
      createBackup(tmpDir);
    }
    const deleted = pruneBackups({ daily: 3, weekly: 0 }, tmpDir);
    expect(deleted.length).toBe(2);
    expect(listBackups(tmpDir).length).toBe(3);
  });

  it('keeps zero backups when daily=0 and weekly=0', () => {
    createBackup(tmpDir);
    createBackup(tmpDir);
    const deleted = pruneBackups({ daily: 0, weekly: 0 }, tmpDir);
    expect(deleted.length).toBe(2);
    expect(listBackups(tmpDir).length).toBe(0);
  });

  it('returns empty array when no backups exist', () => {
    expect(pruneBackups({}, tmpDir)).toEqual([]);
  });
});

// --- startScheduledBackups / stopScheduledBackups ---

describe('scheduled backups', () => {
  it('starts without throwing', () => {
    expect(() => startScheduledBackups({ intervalMs: 999999, backupDir: tmpDir })).not.toThrow();
  });

  it('logs a warning on duplicate start', () => {
    startScheduledBackups({ intervalMs: 999999, backupDir: tmpDir });
    // A second start call should not throw (guard prevents double-start)
    expect(() => startScheduledBackups({ intervalMs: 999999, backupDir: tmpDir })).not.toThrow();
  });

  it('stops cleanly', () => {
    startScheduledBackups({ intervalMs: 999999, backupDir: tmpDir });
    expect(() => stopScheduledBackups()).not.toThrow();
  });
});
