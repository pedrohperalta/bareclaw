import { execFile } from 'child_process';
import { rm } from 'fs/promises';
import { promisify } from 'util';
import type { Config } from '../config.js';
import type { ProcessManager } from './process-manager.js';

const execFileAsync = promisify(execFile);

export interface PrInfo {
  owner: string;
  repo: string;
  number: number;
}

const PR_URL_PATTERN = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/;

export function parsePrUrl(url: string): PrInfo | null {
  const match = url.match(PR_URL_PATTERN);
  if (!match) return null;
  return { owner: match[1], repo: match[2], number: parseInt(match[3], 10) };
}

export function isRepoAllowed(pr: PrInfo, allowedRepos: string[]): boolean {
  if (allowedRepos.length === 0) return false;
  const repoKey = `${pr.owner}/${pr.repo}`.toLowerCase();
  return allowedRepos.some(r => r.toLowerCase() === repoKey);
}

export function channelKey(pr: PrInfo): string {
  return `github-pr-${pr.owner}-${pr.repo}-${pr.number}`;
}

export function tempDir(pr: PrInfo): string {
  return `/tmp/bareclaw-review-${pr.owner}-${pr.repo}-${pr.number}`;
}

const REVIEW_SYSTEM_PROMPT = `Run /code-review:review-pr {PR_NUMBER} --repo {REPO_SLUG}`;

export async function processGitHubPrReview(
  prUrl: string,
  pr: PrInfo,
  processManager: ProcessManager,
  config: Config,
  signal?: AbortSignal,
): Promise<void> {
  const dir = tempDir(pr);
  const channel = channelKey(pr);

  try {
    if (signal?.aborted) return;

    // Clone the repo (stay on default branch for Conductor context)
    const repoSlug = `${pr.owner}/${pr.repo}`;
    console.log(`[github-pr-review] cloning ${repoSlug} to ${dir}`);
    await execFileAsync('gh', ['repo', 'clone', repoSlug, dir, '--', '--depth=1'], { signal });

    if (signal?.aborted) return;

    // Build prompt — the code-review plugin handles everything
    const prompt = REVIEW_SYSTEM_PROMPT
      .replace('{PR_NUMBER}', String(pr.number))
      .replace('{REPO_SLUG}', repoSlug);

    // Spawn a one-shot Claude session in the cloned repo directory
    console.log(`[github-pr-review] starting review session for ${prUrl}`);
    const response = await processManager.send(channel, prompt, {
      channel,
      adapter: 'github-pr-review',
    }, undefined, { cwd: dir });

    if (response.is_error) {
      throw new Error(`Claude session error: ${response.text}`);
    }

    console.log(`[github-pr-review] review complete for ${prUrl} (${response.duration_ms}ms)`);
  } catch (err) {
    if (signal?.aborted) {
      console.log(`[github-pr-review] review cancelled for ${prUrl}`);
      return;
    }

    const message = err instanceof Error ? err.message : String(err);
    console.error(`[github-pr-review] review failed for ${prUrl}: ${message}`);

    // Post failure comment on the PR
    try {
      const body = `**Automated review failed**\n\n\`\`\`\n${message}\n\`\`\`\n\n_Posted by BAREclaw_`;
      await execFileAsync('gh', ['pr', 'comment', prUrl, '--body', body]);
      console.log(`[github-pr-review] posted failure comment on ${prUrl}`);
    } catch (commentErr) {
      console.error(`[github-pr-review] failed to post comment: ${commentErr instanceof Error ? commentErr.message : commentErr}`);
    }
  } finally {
    // Cleanup temp directory
    try {
      await rm(dir, { recursive: true, force: true });
      console.log(`[github-pr-review] cleaned up ${dir}`);
    } catch (cleanupErr) {
      console.error(`[github-pr-review] cleanup failed for ${dir}: ${cleanupErr}`);
    }
  }
}
