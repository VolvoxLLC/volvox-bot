import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { acquireLock, withFileLock } from '../../services/file-lock.js';

describe('file-lock', () => {
  let testDir: string;
  let testFile: string;

  beforeEach(async () => {
    const suffix = Math.random().toString(36).substring(7);
    testDir = path.join(os.tmpdir(), `veritas-lock-test-${suffix}`);
    await fs.mkdir(testDir, { recursive: true });
    testFile = path.join(testDir, 'test-data.json');
    await fs.writeFile(testFile, '{}', 'utf-8');
  });

  afterEach(async () => {
    if (testDir) {
      await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  describe('acquireLock', () => {
    it('should acquire and release a lock', async () => {
      const unlock = await acquireLock(testFile);

      // Lock file should exist
      const lockFile = testFile + '.lock';
      const stat = await fs.stat(lockFile);
      expect(stat.isFile()).toBe(true);

      // Lock file should contain PID and timestamp
      const content = JSON.parse(await fs.readFile(lockFile, 'utf-8'));
      expect(content.pid).toBe(process.pid);
      expect(typeof content.timestamp).toBe('number');

      // Release
      await unlock();

      // Lock file should be gone
      await expect(fs.stat(lockFile)).rejects.toThrow();
    });

    it('should queue concurrent locks (second waits for first)', async () => {
      const order: string[] = [];

      const unlock1 = await acquireLock(testFile);
      order.push('lock1-acquired');

      // Start acquiring second lock — it should block
      const lock2Promise = acquireLock(testFile).then((unlock) => {
        order.push('lock2-acquired');
        return unlock;
      });

      // Give lock2 a tick to attempt acquisition
      await new Promise((r) => setTimeout(r, 100));
      expect(order).toEqual(['lock1-acquired']);

      // Release first lock
      await unlock1();
      order.push('lock1-released');

      // Second lock should now acquire
      const unlock2 = await lock2Promise;
      expect(order).toEqual(['lock1-acquired', 'lock1-released', 'lock2-acquired']);

      await unlock2();
    });

    it('should throw on timeout when lock is held too long', async () => {
      const unlock = await acquireLock(testFile);

      // Try to acquire with very short timeout
      await expect(acquireLock(testFile, 200)).rejects.toThrow(
        /Failed to acquire file lock within 200ms/
      );

      await unlock();
    });

    it('should clean up stale locks from dead processes', async () => {
      const lockFile = testFile + '.lock';

      // Create a fake stale lock with a PID that doesn't exist
      const stalePid = 999999;
      await fs.writeFile(
        lockFile,
        JSON.stringify({ pid: stalePid, timestamp: Date.now() }),
        'utf-8'
      );

      // Should be able to acquire despite existing lock (stale PID)
      const unlock = await acquireLock(testFile);
      const content = JSON.parse(await fs.readFile(lockFile, 'utf-8'));
      expect(content.pid).toBe(process.pid);

      await unlock();
    });

    it('should clean up stale locks older than 30 seconds', async () => {
      const lockFile = testFile + '.lock';

      // Create a lock with current PID but very old timestamp
      await fs.writeFile(
        lockFile,
        JSON.stringify({
          pid: process.pid, // Our own PID — process is alive
          timestamp: Date.now() - 60_000, // 60 seconds ago (> 30s threshold)
        }),
        'utf-8'
      );

      // Should still acquire — lock is older than 30s
      const unlock = await acquireLock(testFile, 1000);
      const content = JSON.parse(await fs.readFile(lockFile, 'utf-8'));
      // Timestamp should be fresh
      expect(Date.now() - content.timestamp).toBeLessThan(2000);

      await unlock();
    });

    it('should clean up malformed lock files', async () => {
      const lockFile = testFile + '.lock';

      // Write garbage to lock file
      await fs.writeFile(lockFile, 'not-json!!!', 'utf-8');

      // Should acquire — malformed lock treated as stale
      const unlock = await acquireLock(testFile);
      const content = JSON.parse(await fs.readFile(lockFile, 'utf-8'));
      expect(content.pid).toBe(process.pid);

      await unlock();
    });
  });

  describe('withFileLock', () => {
    it('should execute function while holding lock and release after', async () => {
      const lockFile = testFile + '.lock';

      const result = await withFileLock(testFile, async () => {
        // Lock should exist while function runs
        const stat = await fs.stat(lockFile);
        expect(stat.isFile()).toBe(true);
        return 42;
      });

      expect(result).toBe(42);

      // Lock should be released after
      await expect(fs.stat(lockFile)).rejects.toThrow();
    });

    it('should release lock even if function throws', async () => {
      const lockFile = testFile + '.lock';

      await expect(
        withFileLock(testFile, async () => {
          throw new Error('boom');
        })
      ).rejects.toThrow('boom');

      // Lock should still be released
      await expect(fs.stat(lockFile)).rejects.toThrow();
    });

    it('should serialize concurrent withFileLock calls', async () => {
      const results: number[] = [];

      const p1 = withFileLock(testFile, async () => {
        results.push(1);
        await new Promise((r) => setTimeout(r, 100));
        results.push(2);
        return 'a';
      });

      const p2 = withFileLock(testFile, async () => {
        results.push(3);
        return 'b';
      });

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toBe('a');
      expect(r2).toBe('b');
      // First lock should complete fully before second starts
      expect(results).toEqual([1, 2, 3]);
    });
  });
});
