import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// We need to set DATA_DIR before importing the service
let testDir: string;
let auditDir: string;

describe('audit-service', () => {
  let auditLog: typeof import('../../services/audit-service.js').auditLog;
  let verifyAuditLog: typeof import('../../services/audit-service.js').verifyAuditLog;
  let readRecentAuditEntries: typeof import('../../services/audit-service.js').readRecentAuditEntries;
  let getCurrentAuditLogPath: typeof import('../../services/audit-service.js').getCurrentAuditLogPath;
  let _resetAuditState: typeof import('../../services/audit-service.js')._resetAuditState;

  beforeEach(async () => {
    const suffix = Math.random().toString(36).substring(7);
    testDir = path.join(os.tmpdir(), `veritas-audit-test-${suffix}`);
    auditDir = path.join(testDir, 'audit');
    await fs.mkdir(auditDir, { recursive: true });

    // Set DATA_DIR before importing
    process.env.DATA_DIR = testDir;

    // Reset module cache to pick up new DATA_DIR
    vi.resetModules();
    const mod = await import('../../services/audit-service.js');
    auditLog = mod.auditLog;
    verifyAuditLog = mod.verifyAuditLog;
    readRecentAuditEntries = mod.readRecentAuditEntries;
    getCurrentAuditLogPath = mod.getCurrentAuditLogPath;
    _resetAuditState = mod._resetAuditState;

    // Reset internal state
    _resetAuditState();
  });

  afterEach(async () => {
    delete process.env.DATA_DIR;
    if (testDir) {
      await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function sha256(data: string): string {
    return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
  }

  async function readLogLines(filePath: string): Promise<string[]> {
    const content = await fs.readFile(filePath, 'utf8');
    return content.trimEnd().split('\n').filter(Boolean);
  }

  // ---------------------------------------------------------------------------
  // Tests
  // ---------------------------------------------------------------------------

  describe('log entry creation', () => {
    it('should write a valid JSON line to the audit log', async () => {
      await auditLog({
        action: 'auth.login',
        actor: 'admin',
        resource: 'session',
        details: { ip: '127.0.0.1' },
      });

      const logPath = getCurrentAuditLogPath();
      const lines = await readLogLines(logPath);
      expect(lines).toHaveLength(1);

      const entry = JSON.parse(lines[0]);
      expect(entry.action).toBe('auth.login');
      expect(entry.actor).toBe('admin');
      expect(entry.resource).toBe('session');
      expect(entry.details).toEqual({ ip: '127.0.0.1' });
      expect(entry.timestamp).toBeTruthy();
      // First entry should have empty integrity
      expect(entry.integrity).toBe('');
    });

    it('should include ISO 8601 timestamp', async () => {
      await auditLog({ action: 'test', actor: 'system' });

      const logPath = getCurrentAuditLogPath();
      const lines = await readLogLines(logPath);
      const entry = JSON.parse(lines[0]);

      // Verify it's a valid ISO 8601 date
      const date = new Date(entry.timestamp);
      expect(date.toISOString()).toBe(entry.timestamp);
    });

    it('should handle optional fields', async () => {
      await auditLog({ action: 'test', actor: 'system' });

      const logPath = getCurrentAuditLogPath();
      const lines = await readLogLines(logPath);
      const entry = JSON.parse(lines[0]);

      expect(entry.action).toBe('test');
      expect(entry.actor).toBe('system');
      // resource and details are optional — omitted when undefined
      expect(entry.timestamp).toBeTruthy();
      expect(entry.integrity).toBe('');
    });
  });

  describe('hash chain', () => {
    it('should have empty integrity for the first entry', async () => {
      await auditLog({ action: 'first', actor: 'system' });

      const logPath = getCurrentAuditLogPath();
      const lines = await readLogLines(logPath);
      const entry = JSON.parse(lines[0]);
      expect(entry.integrity).toBe('');
    });

    it('should chain hashes: entry N references SHA-256 of entry N-1', async () => {
      await auditLog({ action: 'first', actor: 'system' });
      await auditLog({ action: 'second', actor: 'system' });
      await auditLog({ action: 'third', actor: 'system' });

      const logPath = getCurrentAuditLogPath();
      const lines = await readLogLines(logPath);
      expect(lines).toHaveLength(3);

      const entry0 = JSON.parse(lines[0]);
      const entry1 = JSON.parse(lines[1]);
      const entry2 = JSON.parse(lines[2]);

      // First entry: empty integrity
      expect(entry0.integrity).toBe('');

      // Second entry: SHA-256 of first line
      expect(entry1.integrity).toBe(sha256(lines[0]));

      // Third entry: SHA-256 of second line
      expect(entry2.integrity).toBe(sha256(lines[1]));
    });
  });

  describe('verification', () => {
    it('should verify a valid log', async () => {
      await auditLog({ action: 'a', actor: 'system' });
      await auditLog({ action: 'b', actor: 'system' });
      await auditLog({ action: 'c', actor: 'system' });

      const logPath = getCurrentAuditLogPath();
      const result = await verifyAuditLog(logPath);
      expect(result.valid).toBe(true);
      expect(result.entries).toBe(3);
      expect(result.firstBroken).toBeUndefined();
    });

    it('should detect tampering in the middle of the chain', async () => {
      await auditLog({ action: 'a', actor: 'system' });
      await auditLog({ action: 'b', actor: 'system' });
      await auditLog({ action: 'c', actor: 'system' });

      const logPath = getCurrentAuditLogPath();

      // Tamper with the second entry
      const lines = await readLogLines(logPath);
      const entry1 = JSON.parse(lines[1]);
      entry1.action = 'TAMPERED';
      lines[1] = JSON.stringify(entry1);
      await fs.writeFile(logPath, lines.join('\n') + '\n', 'utf8');

      const result = await verifyAuditLog(logPath);
      expect(result.valid).toBe(false);
      expect(result.entries).toBe(3);
      // The tampered line itself has the correct integrity for its predecessor,
      // but the NEXT entry's integrity won't match the tampered line's hash.
      expect(result.firstBroken).toBe(2);
    });

    it('should detect tampering of the first entry', async () => {
      await auditLog({ action: 'a', actor: 'system' });
      await auditLog({ action: 'b', actor: 'system' });

      const logPath = getCurrentAuditLogPath();

      // Tamper with integrity of first entry (should be empty string)
      const lines = await readLogLines(logPath);
      const entry0 = JSON.parse(lines[0]);
      entry0.integrity = 'fake-hash';
      lines[0] = JSON.stringify(entry0);
      await fs.writeFile(logPath, lines.join('\n') + '\n', 'utf8');

      const result = await verifyAuditLog(logPath);
      expect(result.valid).toBe(false);
      expect(result.firstBroken).toBe(0);
    });

    it('should return valid for empty/nonexistent file', async () => {
      const result = await verifyAuditLog('/nonexistent/file.log');
      expect(result.valid).toBe(true);
      expect(result.entries).toBe(0);
    });

    it('should detect malformed JSON lines', async () => {
      await auditLog({ action: 'a', actor: 'system' });

      const logPath = getCurrentAuditLogPath();
      // Append a broken line
      await fs.appendFile(logPath, 'NOT VALID JSON\n', 'utf8');

      const result = await verifyAuditLog(logPath);
      expect(result.valid).toBe(false);
      expect(result.entries).toBe(2);
      expect(result.firstBroken).toBe(1);
    });
  });

  describe('monthly file rotation', () => {
    it('should use a file path containing the current year-month', () => {
      const logPath = getCurrentAuditLogPath();
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      expect(logPath).toContain(`audit-${yyyy}-${mm}.log`);
    });

    it('should place audit files in the audit subdirectory', () => {
      const logPath = getCurrentAuditLogPath();
      expect(logPath).toContain(path.join(testDir, '.veritas-kanban', 'audit'));
    });
  });

  describe('concurrent writes', () => {
    it('should not corrupt the log under concurrent writes', async () => {
      // Fire off many writes concurrently
      const count = 50;
      const promises: Promise<void>[] = [];
      for (let i = 0; i < count; i++) {
        promises.push(
          auditLog({ action: `concurrent.${i}`, actor: 'system', resource: `item-${i}` })
        );
      }
      await Promise.all(promises);

      const logPath = getCurrentAuditLogPath();
      const lines = await readLogLines(logPath);
      expect(lines).toHaveLength(count);

      // Verify the entire hash chain is intact
      const result = await verifyAuditLog(logPath);
      expect(result.valid).toBe(true);
      expect(result.entries).toBe(count);
    });
  });

  describe('readRecentAuditEntries', () => {
    it('should return entries in reverse chronological order', async () => {
      await auditLog({ action: 'first', actor: 'system' });
      await auditLog({ action: 'second', actor: 'system' });
      await auditLog({ action: 'third', actor: 'system' });

      const entries = await readRecentAuditEntries(10);
      expect(entries).toHaveLength(3);
      expect(entries[0].action).toBe('third');
      expect(entries[1].action).toBe('second');
      expect(entries[2].action).toBe('first');
    });

    it('should respect the limit parameter', async () => {
      for (let i = 0; i < 10; i++) {
        await auditLog({ action: `entry-${i}`, actor: 'system' });
      }

      const entries = await readRecentAuditEntries(3);
      expect(entries).toHaveLength(3);
      // Should be the last 3 entries, newest first
      expect(entries[0].action).toBe('entry-9');
      expect(entries[1].action).toBe('entry-8');
      expect(entries[2].action).toBe('entry-7');
    });

    it('should return empty array when no log exists', async () => {
      const entries = await readRecentAuditEntries();
      expect(entries).toEqual([]);
    });
  });

  describe('hash chain persistence across reloads', () => {
    it('should resume hash chain after state reset (simulating restart)', async () => {
      // Write initial entries
      await auditLog({ action: 'before-restart-1', actor: 'system' });
      await auditLog({ action: 'before-restart-2', actor: 'system' });

      // Simulate a process restart by resetting internal state
      _resetAuditState();

      // Write more entries — should seed from disk
      await auditLog({ action: 'after-restart', actor: 'system' });

      const logPath = getCurrentAuditLogPath();
      const result = await verifyAuditLog(logPath);
      expect(result.valid).toBe(true);
      expect(result.entries).toBe(3);
    });
  });
});
