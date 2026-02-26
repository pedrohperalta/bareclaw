import { describe, it, expect } from 'vitest';
import { parsePrUrl, isRepoAllowed, channelKey, tempDir } from './github-pr-review.js';

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
