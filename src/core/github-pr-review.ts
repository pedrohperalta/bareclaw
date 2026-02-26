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

const REVIEW_SYSTEM_PROMPT = `You are reviewing a pull request. Follow these steps:

1. Look for a review skill in .claude/commands/ (e.g. review-pr.md, review.md, or similar).
   - If found, execute that skill to perform the review.
   - If not found, proceed with step 2.

2. Default review process:
   - Run: gh pr view {PR_URL} to understand the PR context
   - Run: gh pr diff {PR_URL} to see all changes
   - Analyze the changes for: correctness, potential bugs, security issues, and code quality
   - Submit your review using: gh pr review {PR_URL} --body "<your review>"

Important:
- Be thorough but concise in your review
- Focus on substantive issues, not style nitpicks
- If the changes look good, approve with: gh pr review {PR_URL} --approve --body "<comment>"
- If there are issues, request changes with: gh pr review {PR_URL} --request-changes --body "<issues>"`;

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

    // Clone the repo
    const repoUrl = `https://github.com/${pr.owner}/${pr.repo}.git`;
    console.log(`[github-pr-review] cloning ${repoUrl} to ${dir}`);
    await execFileAsync('git', ['clone', '--depth=1', repoUrl, dir], { signal });

    // Fetch the PR branch
    console.log(`[github-pr-review] fetching PR #${pr.number}`);
    await execFileAsync('git', ['fetch', 'origin', `pull/${pr.number}/head:pr-${pr.number}`], { cwd: dir, signal });
    await execFileAsync('git', ['checkout', `pr-${pr.number}`], { cwd: dir, signal });

    if (signal?.aborted) return;

    // Build prompt with the PR URL injected
    const prompt = REVIEW_SYSTEM_PROMPT.replaceAll('{PR_URL}', prUrl);

    // Spawn a one-shot Claude session in the cloned repo directory
    console.log(`[github-pr-review] starting review session for ${prUrl}`);
    const response = await processManager.send(channel, prompt, {
      channel,
      adapter: 'github-pr-review',
    });

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
