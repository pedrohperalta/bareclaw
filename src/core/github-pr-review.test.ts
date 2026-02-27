import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parsePrUrl, isRepoAllowed, channelKey, tempDir, hasCodeReviewPlugin, pluginRepoDir, processGitHubPrReview } from './github-pr-review.js';
import type { ProcessManager } from './process-manager.js';
import type { Config } from '../config.js';

vi.mock('child_process', () => ({
  execFile: vi.fn((...args: unknown[]) => {
    // promisify calls execFile with the callback as the last argument
    const cb = args[args.length - 1];
    if (typeof cb === 'function') cb(null, '', '');
    return { unref: vi.fn() };
  }),
}));

vi.mock('fs/promises', () => ({
  rm: vi.fn().mockResolvedValue(undefined),
}));

const existsSyncMock = vi.fn().mockReturnValue(false);
const readFileSyncMock = vi.fn().mockReturnValue('');

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: (...args: unknown[]) => existsSyncMock(...args),
    readFileSync: (...args: unknown[]) => readFileSyncMock(...args),
  };
});

describe('parsePrUrl', () => {
  it('parses a valid GitHub PR URL', () => {
    const result = parsePrUrl('https://github.com/acme/app/pull/42');
    expect(result).toEqual({ owner: 'acme', repo: 'app', number: 42 });
  });

  it('parses URL with trailing slash', () => {
    const result = parsePrUrl('https://github.com/acme/app/pull/42/');
    expect(result).toEqual({ owner: 'acme', repo: 'app', number: 42 });
  });

  it('parses http URLs', () => {
    const result = parsePrUrl('http://github.com/acme/app/pull/1');
    expect(result).toEqual({ owner: 'acme', repo: 'app', number: 1 });
  });

  it('returns null for non-GitHub URLs', () => {
    expect(parsePrUrl('https://gitlab.com/acme/app/pull/42')).toBeNull();
  });

  it('returns null for GitHub URLs without pull number', () => {
    expect(parsePrUrl('https://github.com/acme/app')).toBeNull();
  });

  it('returns null for GitHub issue URLs', () => {
    expect(parsePrUrl('https://github.com/acme/app/issues/42')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parsePrUrl('')).toBeNull();
  });

  it('returns null for random text', () => {
    expect(parsePrUrl('not a url')).toBeNull();
  });

  it('returns null for URL with extra path segments', () => {
    expect(parsePrUrl('https://github.com/acme/app/pull/42/files')).toBeNull();
  });
});

describe('isRepoAllowed', () => {
  const pr = { owner: 'Acme', repo: 'App', number: 42 };

  it('returns true when repo is in allowlist', () => {
    expect(isRepoAllowed(pr, ['acme/app'])).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(isRepoAllowed(pr, ['ACME/APP'])).toBe(true);
  });

  it('returns false when repo is not in allowlist', () => {
    expect(isRepoAllowed(pr, ['other/repo'])).toBe(false);
  });

  it('returns false when allowlist is empty', () => {
    expect(isRepoAllowed(pr, [])).toBe(false);
  });

  it('works with multiple repos in allowlist', () => {
    expect(isRepoAllowed(pr, ['other/repo', 'acme/app', 'another/one'])).toBe(true);
  });
});

describe('channelKey', () => {
  it('generates a unique channel key', () => {
    expect(channelKey({ owner: 'acme', repo: 'app', number: 42 })).toBe('github-pr-acme-app-42');
  });
});

describe('tempDir', () => {
  it('generates a temp directory path', () => {
    expect(tempDir({ owner: 'acme', repo: 'app', number: 42 })).toBe('/tmp/bareclaw-review-acme-app-42');
  });
});

describe('pluginRepoDir', () => {
  it('generates a plugin repo temp directory path', () => {
    expect(pluginRepoDir({ owner: 'acme', repo: 'app', number: 42 })).toBe('/tmp/bareclaw-plugins-acme-app-42');
  });
});

describe('hasCodeReviewPlugin', () => {
  beforeEach(() => {
    existsSyncMock.mockReturnValue(false);
    readFileSyncMock.mockReturnValue('');
  });

  it('returns true when plugin.json exists in plugins/code-review', () => {
    existsSyncMock.mockImplementation((path: string) =>
      path.includes('plugins/code-review/.claude-plugin/plugin.json'));
    expect(hasCodeReviewPlugin('/tmp/repo')).toBe(true);
  });

  it('returns true when plugins.json references code-review', () => {
    existsSyncMock.mockImplementation((path: string) =>
      path.includes('.claude/plugins.json'));
    readFileSyncMock.mockReturnValue(JSON.stringify([{ name: 'code-review' }]));
    expect(hasCodeReviewPlugin('/tmp/repo')).toBe(true);
  });

  it('returns false when no plugin is found', () => {
    existsSyncMock.mockReturnValue(false);
    expect(hasCodeReviewPlugin('/tmp/repo')).toBe(false);
  });

  it('returns false when plugins.json exists but has no code-review', () => {
    existsSyncMock.mockImplementation((path: string) =>
      path.includes('.claude/plugins.json'));
    readFileSyncMock.mockReturnValue(JSON.stringify([{ name: 'other-plugin' }]));
    expect(hasCodeReviewPlugin('/tmp/repo')).toBe(false);
  });
});

function mockProcessManager(overrides: Partial<ProcessManager> = {}) {
  return {
    send: vi.fn().mockResolvedValue({ text: 'review done', duration_ms: 1000, is_error: false }),
    shutdown: vi.fn(),
    shutdownHosts: vi.fn(),
    ...overrides,
  } as unknown as ProcessManager;
}

function mockConfig(overrides: Partial<Config> = {}): Config {
  return {
    port: 3000,
    cwd: '/tmp',
    maxTurns: 25,
    allowedTools: 'Read,Bash',
    timeoutMs: 0,
    httpToken: undefined,
    telegramToken: undefined,
    allowedUsers: [],
    sessionFile: '.bareclaw-sessions.json',
    reviewRepos: ['acme/app'],
    ...overrides,
  };
}

describe('processGitHubPrReview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    existsSyncMock.mockReturnValue(false);
  });

  it('clones plugin repo and passes pluginDirs when plugin not found', async () => {
    const pm = mockProcessManager();
    const pr = { owner: 'acme', repo: 'app', number: 42 };

    await processGitHubPrReview('https://github.com/acme/app/pull/42', pr, pm, mockConfig());

    expect(pm.send).toHaveBeenCalledWith(
      'github-pr-acme-app-42',
      'Run /code-review:review-pr 42 --repo acme/app',
      { channel: 'github-pr-acme-app-42', adapter: 'github-pr-review' },
      undefined,
      { cwd: '/tmp/bareclaw-review-acme-app-42', pluginDirs: ['/tmp/bareclaw-plugins-acme-app-42/plugins/code-review'] },
    );
  });

  it('skips plugin clone when target repo has the plugin', async () => {
    existsSyncMock.mockImplementation((path: string) =>
      path.includes('plugins/code-review/.claude-plugin/plugin.json'));
    const pm = mockProcessManager();
    const pr = { owner: 'acme', repo: 'app', number: 42 };

    await processGitHubPrReview('https://github.com/acme/app/pull/42', pr, pm, mockConfig());

    expect(pm.send).toHaveBeenCalledWith(
      'github-pr-acme-app-42',
      'Run /code-review:review-pr 42 --repo acme/app',
      { channel: 'github-pr-acme-app-42', adapter: 'github-pr-review' },
      undefined,
      { cwd: '/tmp/bareclaw-review-acme-app-42' },
    );

    // Verify no plugin repo clone was attempted (only 1 gh clone call for the target repo)
    const { execFile } = await import('child_process');
    const cloneCalls = (execFile as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call: unknown[]) => call[0] === 'gh' && Array.isArray(call[1]) && call[1][1] === 'clone'
    );
    expect(cloneCalls.length).toBe(1);
  });

  it('cleans up both temp directories after successful review', async () => {
    const { rm } = await import('fs/promises');
    const pm = mockProcessManager();
    const pr = { owner: 'acme', repo: 'app', number: 42 };

    await processGitHubPrReview('https://github.com/acme/app/pull/42', pr, pm, mockConfig());

    expect(rm).toHaveBeenCalledWith('/tmp/bareclaw-review-acme-app-42', { recursive: true, force: true });
    expect(rm).toHaveBeenCalledWith('/tmp/bareclaw-plugins-acme-app-42', { recursive: true, force: true });
  });

  it('cleans up both temp directories after failed review', async () => {
    const { rm } = await import('fs/promises');
    const pm = mockProcessManager({
      send: vi.fn().mockRejectedValue(new Error('session crashed')),
    } as unknown as Partial<ProcessManager>);
    const pr = { owner: 'acme', repo: 'app', number: 42 };

    await processGitHubPrReview('https://github.com/acme/app/pull/42', pr, pm, mockConfig());

    expect(rm).toHaveBeenCalledWith('/tmp/bareclaw-review-acme-app-42', { recursive: true, force: true });
    expect(rm).toHaveBeenCalledWith('/tmp/bareclaw-plugins-acme-app-42', { recursive: true, force: true });
  });

  it('skips processing when signal is already aborted', async () => {
    const pm = mockProcessManager();
    const pr = { owner: 'acme', repo: 'app', number: 42 };
    const abort = new AbortController();
    abort.abort();

    await processGitHubPrReview('https://github.com/acme/app/pull/42', pr, pm, mockConfig(), abort.signal);

    expect(pm.send).not.toHaveBeenCalled();
  });

  it('throws on is_error response from Claude', async () => {
    const { execFile } = await import('child_process');
    const pm = mockProcessManager({
      send: vi.fn().mockResolvedValue({ text: 'Session ended', duration_ms: 0, is_error: true }),
    } as unknown as Partial<ProcessManager>);
    const pr = { owner: 'acme', repo: 'app', number: 42 };

    await processGitHubPrReview('https://github.com/acme/app/pull/42', pr, pm, mockConfig());

    // Should have tried to post a failure comment via gh pr comment
    const commentCalls = (execFile as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call: unknown[]) => call[0] === 'gh' && Array.isArray(call[1]) && call[1][0] === 'pr'
    );
    expect(commentCalls.length).toBe(1);
    expect(commentCalls[0][1]).toContain('comment');
  });
});
