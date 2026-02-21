import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import type { PRDiffResult } from '../apps/worker/activities/fetchGitHubPRDiff';
import type { SpecialistResult } from '../apps/worker/activities/specialists';

const FIXTURE_DIFF = `--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,3 +1,5 @@
 export function authenticate(password: string): boolean {
-  return password === 'admin123';
+  const hash = createHash('sha256').update(password).digest('hex');
+  return hash === expectedHash;
 }`;

const mockFetchGitHubPRDiff = async (args: {
  prUrl: string;
  context?: string;
}): Promise<PRDiffResult> => ({
  title: 'Fix authentication flow',
  repoName: 'acme/backend',
  prNumber: 42,
  diff: FIXTURE_DIFF,
  submitterContext: args.context ?? '',
});

const mockSpecialist = async (): Promise<SpecialistResult> => ({
  findings: [],
  rawText: 'Mock specialist output',
});

describe('reviewWorkflow (Issue #2)', () => {
  let testEnv: TestWorkflowEnvironment;

  beforeAll(async () => {
    testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  });

  afterAll(async () => {
    await testEnv?.teardown();
  });

  it('fetches PR diff and completes with PR metadata in state', async () => {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      taskQueue: 'test-review-pr',
      workflowsPath: path.resolve(__dirname, '../apps/worker/workflows'),
      activities: {
        fetchGitHubPRDiff: mockFetchGitHubPRDiff,
        runIronjaw: mockSpecialist,
        runBarnacle: mockSpecialist,
        runGreenhand: mockSpecialist,
      },
    });

    await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start('reviewWorkflow', {
        taskQueue: 'test-review-pr',
        workflowId: 'test-pr-1',
        args: [{ prUrl: 'https://github.com/acme/backend/pull/42' }],
      });

      // Query running state immediately after start
      const runningState = await handle.query<{
        status: string;
        prUrl: string;
      }>('getReviewState');
      expect(runningState.status).toBe('running');
      expect(runningState.prUrl).toBe('https://github.com/acme/backend/pull/42');

      // Wait for completion
      const result = await handle.result();
      expect(result.status).toBe('complete');
      expect(result.title).toBe('Fix authentication flow');
      expect(result.repoName).toBe('acme/backend');
      expect(result.prNumber).toBe(42);
    });
  });

  it('stores submitter context in workflow state', async () => {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      taskQueue: 'test-review-pr-ctx',
      workflowsPath: path.resolve(__dirname, '../apps/worker/workflows'),
      activities: {
        fetchGitHubPRDiff: mockFetchGitHubPRDiff,
        runIronjaw: mockSpecialist,
        runBarnacle: mockSpecialist,
        runGreenhand: mockSpecialist,
      },
    });

    await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start('reviewWorkflow', {
        taskQueue: 'test-review-pr-ctx',
        workflowId: 'test-pr-ctx-1',
        args: [
          {
            prUrl: 'https://github.com/acme/backend/pull/42',
            context: 'security-critical rewrite',
          },
        ],
      });

      const result = await handle.result();
      expect(result.status).toBe('complete');
      expect(result.context).toBe('security-critical rewrite');
    });
  });

  it('can run multiple sequential workflows', async () => {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      taskQueue: 'test-review-pr-seq',
      workflowsPath: path.resolve(__dirname, '../apps/worker/workflows'),
      activities: {
        fetchGitHubPRDiff: mockFetchGitHubPRDiff,
        runIronjaw: mockSpecialist,
        runBarnacle: mockSpecialist,
        runGreenhand: mockSpecialist,
      },
    });

    await worker.runUntil(async () => {
      const handle1 = await testEnv.client.workflow.start('reviewWorkflow', {
        taskQueue: 'test-review-pr-seq',
        workflowId: 'test-seq-pr-1',
        args: [{ prUrl: 'https://github.com/acme/backend/pull/1' }],
      });
      const result1 = await handle1.result();
      expect(result1.status).toBe('complete');

      const handle2 = await testEnv.client.workflow.start('reviewWorkflow', {
        taskQueue: 'test-review-pr-seq',
        workflowId: 'test-seq-pr-2',
        args: [{ prUrl: 'https://github.com/acme/backend/pull/2' }],
      });
      const result2 = await handle2.result();
      expect(result2.status).toBe('complete');
      expect(result2.prUrl).toBe('https://github.com/acme/backend/pull/2');
    });
  });
});
