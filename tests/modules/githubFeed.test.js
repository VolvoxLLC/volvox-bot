import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock child_process for gh CLI calls
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('node:util', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    promisify: (fn) => {
      // Return a promisified version that defers to our mock
      return (...args) =>
        new Promise((resolve, reject) =>
          fn(...args, (err, result) => {
            if (err) reject(err);
            else resolve(result);
          }),
        );
    },
  };
});

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

vi.mock('../../src/utils/safeSend.js', () => ({
  safeSend: vi.fn().mockResolvedValue({}),
}));

vi.mock('discord.js', () => {
  class EmbedBuilder {
    constructor() {
      this._data = {};
    }
    setColor(c) {
      this._data.color = c;
      return this;
    }
    setTitle(t) {
      this._data.title = t;
      return this;
    }
    setURL(u) {
      this._data.url = u;
      return this;
    }
    setAuthor(a) {
      this._data.author = a;
      return this;
    }
    addFields(...fields) {
      this._data.fields = [...(this._data.fields || []), ...fields.flat()];
      return this;
    }
    setTimestamp(t) {
      this._data.timestamp = t;
      return this;
    }
    setDescription(d) {
      this._data.description = d;
      return this;
    }
  }
  return { EmbedBuilder };
});

import { execFile } from 'node:child_process';
import { getPool } from '../../src/db.js';
import { getConfig } from '../../src/modules/config.js';
import {
  buildEmbed,
  buildIssueEmbed,
  buildPrEmbed,
  buildPushEmbed,
  buildReleaseEmbed,
  fetchRepoEvents,
  startGithubFeed,
  stopGithubFeed,
} from '../../src/modules/githubFeed.js';
import { safeSend } from '../../src/utils/safeSend.js';

/** Helper: build a base GitHub event object */
function makeEvent(overrides = {}) {
  return {
    id: '12345',
    type: 'PushEvent',
    actor: { login: 'testuser', avatar_url: 'https://example.com/avatar.png' },
    repo: { name: 'owner/repo' },
    created_at: '2026-02-27T10:00:00Z',
    payload: {},
    ...overrides,
  };
}

describe('fetchRepoEvents', () => {
  it('should call gh api and return parsed JSON', async () => {
    const fakeEvents = [{ id: '1', type: 'PushEvent' }];
    execFile.mockImplementation((_cmd, _args, _opts, cb) => {
      cb(null, { stdout: JSON.stringify(fakeEvents) });
    });

    const result = await fetchRepoEvents('VolvoxLLC', 'volvox-bot');
    expect(result).toEqual(fakeEvents);
    expect(execFile).toHaveBeenCalledWith(
      'gh',
      ['api', 'repos/VolvoxLLC/volvox-bot/events', '--paginate', '-q', '.[0:10]'],
      { timeout: 30_000 },
      expect.any(Function),
    );
  });

  it('should return empty array for empty stdout', async () => {
    execFile.mockImplementation((_cmd, _args, _opts, cb) => {
      cb(null, { stdout: '' });
    });
    const result = await fetchRepoEvents('owner', 'repo');
    expect(result).toEqual([]);
  });

  it('should throw on gh CLI error', async () => {
    execFile.mockImplementation((_cmd, _args, _opts, cb) => {
      cb(new Error('gh: not found'));
    });
    await expect(fetchRepoEvents('owner', 'repo')).rejects.toThrow('gh: not found');
  });
});

describe('buildPrEmbed', () => {
  it('should build green embed for opened PR', () => {
    const event = makeEvent({
      type: 'PullRequestEvent',
      payload: {
        action: 'opened',
        pull_request: {
          number: 42,
          title: 'Add feature X',
          html_url: 'https://github.com/owner/repo/pull/42',
          additions: 100,
          deletions: 10,
        },
      },
    });
    const embed = buildPrEmbed(event);
    expect(embed).not.toBeNull();
    expect(embed._data.color).toBe(0x2ecc71);
    expect(embed._data.title).toContain('#42');
    expect(embed._data.title).toContain('Add feature X');
  });

  it('should build purple embed for merged PR', () => {
    const event = makeEvent({
      type: 'PullRequestEvent',
      payload: {
        action: 'closed',
        pull_request: {
          number: 43,
          title: 'Merge something',
          html_url: 'https://github.com/owner/repo/pull/43',
          merged: true,
        },
      },
    });
    const embed = buildPrEmbed(event);
    expect(embed).not.toBeNull();
    expect(embed._data.color).toBe(0x9b59b6);
  });

  it('should build red embed for closed (not merged) PR', () => {
    const event = makeEvent({
      type: 'PullRequestEvent',
      payload: {
        action: 'closed',
        pull_request: {
          number: 44,
          title: 'Closed PR',
          html_url: 'https://github.com/owner/repo/pull/44',
          merged: false,
        },
      },
    });
    const embed = buildPrEmbed(event);
    expect(embed).not.toBeNull();
    expect(embed._data.color).toBe(0xe74c3c);
  });

  it('should return null for unhandled PR action', () => {
    const event = makeEvent({
      type: 'PullRequestEvent',
      payload: {
        action: 'labeled',
        pull_request: { number: 45, title: 'PR', html_url: 'https://x.com' },
      },
    });
    const embed = buildPrEmbed(event);
    expect(embed).toBeNull();
  });

  it('should return null for missing pull_request', () => {
    const event = makeEvent({ type: 'PullRequestEvent', payload: { action: 'opened' } });
    expect(buildPrEmbed(event)).toBeNull();
  });
});

describe('buildIssueEmbed', () => {
  it('should build blue embed for opened issue', () => {
    const event = makeEvent({
      type: 'IssuesEvent',
      payload: {
        action: 'opened',
        issue: {
          number: 51,
          title: 'GitHub feed',
          html_url: 'https://github.com/owner/repo/issues/51',
          labels: [{ name: 'enhancement' }],
          assignee: { login: 'bill' },
        },
      },
    });
    const embed = buildIssueEmbed(event);
    expect(embed).not.toBeNull();
    expect(embed._data.color).toBe(0x3498db);
    expect(embed._data.title).toContain('#51');
    const labelField = embed._data.fields.find((f) => f.name === 'Labels');
    expect(labelField?.value).toBe('enhancement');
    const assigneeField = embed._data.fields.find((f) => f.name === 'Assignee');
    expect(assigneeField?.value).toBe('bill');
  });

  it('should build red embed for closed issue', () => {
    const event = makeEvent({
      type: 'IssuesEvent',
      payload: {
        action: 'closed',
        issue: { number: 52, title: 'Bug', html_url: 'https://x.com', labels: [], assignee: null },
      },
    });
    const embed = buildIssueEmbed(event);
    expect(embed._data.color).toBe(0xe74c3c);
  });

  it('should return null for unhandled action', () => {
    const event = makeEvent({
      type: 'IssuesEvent',
      payload: {
        action: 'assigned',
        issue: { number: 53, title: 'X', html_url: 'https://x.com' },
      },
    });
    expect(buildIssueEmbed(event)).toBeNull();
  });
});

describe('buildReleaseEmbed', () => {
  it('should build gold embed for a release', () => {
    const event = makeEvent({
      type: 'ReleaseEvent',
      payload: {
        release: {
          tag_name: 'v1.2.0',
          html_url: 'https://github.com/owner/repo/releases/tag/v1.2.0',
          body: 'Added cool features!',
        },
      },
    });
    const embed = buildReleaseEmbed(event);
    expect(embed).not.toBeNull();
    expect(embed._data.color).toBe(0xf1c40f);
    expect(embed._data.title).toContain('v1.2.0');
    const notesField = embed._data.fields.find((f) => f.name === 'Notes');
    expect(notesField?.value).toBe('Added cool features!');
  });

  it('should truncate body to 200 chars', () => {
    const longBody = 'x'.repeat(300);
    const event = makeEvent({
      type: 'ReleaseEvent',
      payload: {
        release: {
          tag_name: 'v2.0.0',
          html_url: 'https://x.com',
          body: longBody,
        },
      },
    });
    const embed = buildReleaseEmbed(event);
    const notesField = embed._data.fields.find((f) => f.name === 'Notes');
    expect(notesField?.value.length).toBe(200);
  });

  it('should return null for missing release', () => {
    const event = makeEvent({ type: 'ReleaseEvent', payload: {} });
    expect(buildReleaseEmbed(event)).toBeNull();
  });
});

describe('buildPushEmbed', () => {
  it('should build gray embed for push event', () => {
    const event = makeEvent({
      type: 'PushEvent',
      payload: {
        ref: 'refs/heads/main',
        commits: [
          { sha: 'abc1234', message: 'fix: something' },
          { sha: 'def5678', message: 'feat: another thing' },
        ],
      },
    });
    const embed = buildPushEmbed(event);
    expect(embed).not.toBeNull();
    expect(embed._data.color).toBe(0x95a5a6);
    expect(embed._data.title).toContain('main');
    expect(embed._data.title).toContain('2 commit');
  });

  it('should show only first 3 commits', () => {
    const commits = Array.from({ length: 5 }, (_, i) => ({
      sha: `sha${i}`,
      message: `commit ${i}`,
    }));
    const event = makeEvent({
      type: 'PushEvent',
      payload: { ref: 'refs/heads/feat', commits },
    });
    const embed = buildPushEmbed(event);
    const commitField = embed._data.fields.find((f) => f.name === 'Commits');
    const lines = commitField.value.split('\n');
    expect(lines).toHaveLength(3);
  });

  it('should return null for empty commits', () => {
    const event = makeEvent({
      type: 'PushEvent',
      payload: { ref: 'refs/heads/main', commits: [] },
    });
    expect(buildPushEmbed(event)).toBeNull();
  });

  it('should return null for missing payload', () => {
    const event = makeEvent({ type: 'PushEvent', payload: null });
    expect(buildPushEmbed(event)).toBeNull();
  });
});

describe('buildEmbed', () => {
  const enabledAll = ['pr', 'issue', 'release', 'push'];

  it('should dispatch PullRequestEvent', () => {
    const event = makeEvent({
      type: 'PullRequestEvent',
      payload: {
        action: 'opened',
        pull_request: { number: 1, title: 'T', html_url: 'https://x.com' },
      },
    });
    expect(buildEmbed(event, enabledAll)).not.toBeNull();
  });

  it('should dispatch IssuesEvent', () => {
    const event = makeEvent({
      type: 'IssuesEvent',
      payload: {
        action: 'opened',
        issue: { number: 1, title: 'T', html_url: 'https://x.com', labels: [] },
      },
    });
    expect(buildEmbed(event, enabledAll)).not.toBeNull();
  });

  it('should dispatch ReleaseEvent', () => {
    const event = makeEvent({
      type: 'ReleaseEvent',
      payload: { release: { tag_name: 'v1.0.0', html_url: 'https://x.com', body: '' } },
    });
    expect(buildEmbed(event, enabledAll)).not.toBeNull();
  });

  it('should dispatch PushEvent', () => {
    const event = makeEvent({
      type: 'PushEvent',
      payload: { ref: 'refs/heads/main', commits: [{ sha: 'abc', message: 'test' }] },
    });
    expect(buildEmbed(event, enabledAll)).not.toBeNull();
  });

  it('should return null for unknown event type', () => {
    const event = makeEvent({ type: 'WatchEvent' });
    expect(buildEmbed(event, enabledAll)).toBeNull();
  });

  it('should return null when event type is not in enabledEvents', () => {
    const event = makeEvent({
      type: 'PullRequestEvent',
      payload: {
        action: 'opened',
        pull_request: { number: 1, title: 'T', html_url: 'https://x.com' },
      },
    });
    expect(buildEmbed(event, ['issue', 'release', 'push'])).toBeNull();
  });
});

describe('startGithubFeed / stopGithubFeed', () => {
  let mockPool;
  let mockClient;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };
    getPool.mockReturnValue(mockPool);

    mockClient = {
      guilds: {
        cache: new Map([['guild-1', {}]]),
      },
      channels: {
        fetch: vi.fn().mockResolvedValue({
          id: 'ch-1',
          send: vi.fn().mockResolvedValue({}),
        }),
      },
    };

    getConfig.mockReturnValue({
      github: {
        feed: {
          enabled: false,
          channelId: null,
          repos: [],
          events: ['pr', 'issue', 'release', 'push'],
          pollIntervalMinutes: 5,
        },
      },
    });
  });

  afterEach(() => {
    stopGithubFeed();
    vi.useRealTimers();
  });

  it('should start and stop without errors', () => {
    expect(() => startGithubFeed(mockClient)).not.toThrow();
    expect(() => stopGithubFeed()).not.toThrow();
  });

  it('should not double-start', () => {
    startGithubFeed(mockClient);
    // Starting again should be a no-op (interval is already set)
    expect(() => startGithubFeed(mockClient)).not.toThrow();
    stopGithubFeed();
  });

  it('should skip guilds with feed disabled', async () => {
    getConfig.mockReturnValue({
      github: { feed: { enabled: false } },
    });

    startGithubFeed(mockClient);

    // Advance past the initial 5s poll delay only (don't run interval forever)
    await vi.advanceTimersByTimeAsync(6_000);

    expect(safeSend).not.toHaveBeenCalled();
    stopGithubFeed();
  });

  it('should dedup events — not post already-seen events', async () => {
    // First call returns a DB row showing last_event_id = '999'
    // Second call (upsert) just resolves
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ last_event_id: '999' }] }) // SELECT
      .mockResolvedValueOnce({ rows: [] }); // upsert

    execFile.mockImplementation((_cmd, _args, _opts, cb) => {
      // Event ID '999' is same as last_event_id → no new events
      cb(null, {
        stdout: JSON.stringify([
          {
            id: '999',
            type: 'WatchEvent',
            created_at: '2026-01-01T00:00:00Z',
            actor: {},
            repo: { name: 'o/r' },
            payload: {},
          },
        ]),
      });
    });

    getConfig.mockReturnValue({
      github: {
        feed: {
          enabled: true,
          channelId: 'ch-1',
          repos: ['owner/repo'],
          events: ['pr', 'issue', 'release', 'push'],
          pollIntervalMinutes: 5,
        },
      },
    });

    startGithubFeed(mockClient);
    // Advance past the initial 5s poll delay only
    await vi.advanceTimersByTimeAsync(6_000);

    expect(safeSend).not.toHaveBeenCalled();
  });
});
