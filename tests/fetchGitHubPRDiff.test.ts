import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock @temporalio/activity before importing the activity
vi.mock('@temporalio/activity', () => {
  class ApplicationFailure extends Error {
    nonRetryable: boolean = false;
    type: string = '';
    static nonRetryable(message: string, type: string) {
      const err = new ApplicationFailure(message);
      err.nonRetryable = true;
      err.type = type;
      return err;
    }
    constructor(message: string) {
      super(message);
      this.name = 'ApplicationFailure';
    }
  }
  return {
    heartbeat: vi.fn(),
    ApplicationFailure,
  };
});

vi.mock('../lib/github', () => ({
  parseGitHubPRUrl: vi.fn(),
  fetchPRFiles: vi.fn(),
}));

import { fetchGitHubPRDiff } from '../apps/worker/activities/fetchGitHubPRDiff';
import { parseGitHubPRUrl, fetchPRFiles } from '../lib/github';

// Fixture diff under 500 lines
const FIXTURE_DIFF = `--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,5 +1,8 @@
+import { createHash } from 'crypto';
+
 export function authenticate(password: string): boolean {
-  return password === 'admin123';
+  const hash = createHash('sha256').update(password).digest('hex');
+  return hash === expectedHash;
 }`;

describe('fetchGitHubPRDiff activity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(parseGitHubPRUrl).mockReturnValue({
      owner: 'acme',
      repo: 'backend',
      number: 42,
    });
    vi.mocked(fetchPRFiles).mockResolvedValue({
      title: 'Fix authentication flow',
      repoName: 'acme/backend',
      diff: FIXTURE_DIFF,
      lineCount: FIXTURE_DIFF.split('\n').length,
    });
  });

  it('returns PR metadata on success', async () => {
    const result = await fetchGitHubPRDiff({
      prUrl: 'https://github.com/acme/backend/pull/42',
    });

    expect(result.title).toBe('Fix authentication flow');
    expect(result.repoName).toBe('acme/backend');
    expect(result.prNumber).toBe(42);
    expect(result.diff).toBe(FIXTURE_DIFF);
    expect(result.submitterContext).toBe('');
  });

  it('passes context through to submitterContext', async () => {
    const result = await fetchGitHubPRDiff({
      prUrl: 'https://github.com/acme/backend/pull/42',
      context: 'security-critical auth rewrite',
    });

    expect(result.submitterContext).toBe('security-critical auth rewrite');
  });

  it('throws nonRetryable error when diff exceeds 500 lines', async () => {
    const hugeDiff = Array(502).fill('+ added line').join('\n');
    vi.mocked(fetchPRFiles).mockResolvedValue({
      title: 'Massive refactor',
      repoName: 'acme/backend',
      diff: hugeDiff,
      lineCount: 502,
    });

    await expect(
      fetchGitHubPRDiff({ prUrl: 'https://github.com/acme/backend/pull/99' })
    ).rejects.toMatchObject({
      name: 'ApplicationFailure',
      nonRetryable: true,
      message: expect.stringContaining('Diff too large'),
    });
  });

  it('calls parseGitHubPRUrl with the provided URL', async () => {
    const url = 'https://github.com/acme/backend/pull/42';
    await fetchGitHubPRDiff({ prUrl: url });

    expect(vi.mocked(parseGitHubPRUrl)).toHaveBeenCalledWith(url);
  });

  it('calls fetchPRFiles with parsed owner/repo/number', async () => {
    await fetchGitHubPRDiff({ prUrl: 'https://github.com/acme/backend/pull/42' });

    expect(vi.mocked(fetchPRFiles)).toHaveBeenCalledWith('acme', 'backend', 42);
  });
});
