import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import type { PRDiffResult } from '../apps/worker/activities/fetchGitHubPRDiff';
import type { SpecialistResult } from '../apps/worker/activities/specialists';
import type { MutineerResult } from '../apps/worker/activities/mutineer';
import type { ArbitrationDecision } from '../apps/worker/activities/arbitrator';

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

const mockFindings = (prefix: string): SpecialistResult['findings'] => [
  {
    id: `${prefix}-1`,
    severity: 'major' as const,
    description: `${prefix} finding`,
    recommendation: `Fix the ${prefix} issue`,
  },
];

const mockRunIronjaw = async (args: {
  diff: string;
  context?: string;
}): Promise<SpecialistResult> => ({
  findings: mockFindings('ironjaw'),
  rawText: `Arrr, IRONJAW spotted trouble! Diff: ${args.diff.slice(0, 20)}`,
});

const mockRunBarnacle = async (args: {
  diff: string;
  context?: string;
}): Promise<SpecialistResult> => ({
  findings: mockFindings('barnacle'),
  rawText: `Barnacle grumbles... Diff: ${args.diff.slice(0, 20)}`,
});

const mockRunGreenhand = async (args: {
  diff: string;
  context?: string;
}): Promise<SpecialistResult> => ({
  findings: mockFindings('greenhand'),
  rawText: `Greenhand reports... Diff: ${args.diff.slice(0, 20)}`,
});

const mockMutineer = async (): Promise<MutineerResult> => ({
  challenges: [],
});

const mockArbitrator = async (): Promise<ArbitrationDecision> => ({
  ruling: 'upheld',
  reasoning: 'Mock arbitration ruling.',
});

describe('reviewWorkflow — Issue #3 specialists', () => {
  let testEnv: TestWorkflowEnvironment;

  beforeAll(async () => {
    testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  });

  afterAll(async () => {
    await testEnv?.teardown();
  });

  it('runs all three specialists and stores findings in state', async () => {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      taskQueue: 'test-specialists',
      workflowsPath: path.resolve(__dirname, '../apps/worker/workflows'),
      activities: {
        fetchGitHubPRDiff: mockFetchGitHubPRDiff,
        runIronjaw: mockRunIronjaw,
        runBarnacle: mockRunBarnacle,
        runGreenhand: mockRunGreenhand,
        runMutineer: mockMutineer,
        runArbitrator: mockArbitrator,
      },
    });

    await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start('reviewWorkflow', {
        taskQueue: 'test-specialists',
        workflowId: 'test-specialists-1',
        args: [{ prUrl: 'https://github.com/acme/backend/pull/42' }],
      });

      const result = await handle.result();

      expect(result.status).toBe('complete');
      expect(result.specialists.ironjaw.status).toBe('complete');
      expect(result.specialists.barnacle.status).toBe('complete');
      expect(result.specialists.greenhand.status).toBe('complete');
      expect(result.specialists.ironjaw.findings).toHaveLength(1);
      expect(result.specialists.ironjaw.findings![0].id).toBe('ironjaw-1');
      expect(result.specialists.barnacle.findings![0].id).toBe('barnacle-1');
      expect(result.specialists.greenhand.findings![0].id).toBe('greenhand-1');
    });
  });

  it('exposes specialist state via getReviewState query', async () => {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      taskQueue: 'test-specialists-query',
      workflowsPath: path.resolve(__dirname, '../apps/worker/workflows'),
      activities: {
        fetchGitHubPRDiff: mockFetchGitHubPRDiff,
        runIronjaw: mockRunIronjaw,
        runBarnacle: mockRunBarnacle,
        runGreenhand: mockRunGreenhand,
        runMutineer: mockMutineer,
        runArbitrator: mockArbitrator,
      },
    });

    await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start('reviewWorkflow', {
        taskQueue: 'test-specialists-query',
        workflowId: 'test-specialists-query-1',
        args: [{ prUrl: 'https://github.com/acme/backend/pull/42' }],
      });

      await handle.result();

      const state = await handle.query('getReviewState') as {
        specialists: {
          ironjaw: { status: string };
          barnacle: { status: string };
          greenhand: { status: string };
        };
      };
      expect(state.specialists.ironjaw.status).toBe('complete');
      expect(state.specialists.barnacle.status).toBe('complete');
      expect(state.specialists.greenhand.status).toBe('complete');
    });
  });

  it('stores PR diff for specialists and passes context through', async () => {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      taskQueue: 'test-specialists-ctx',
      workflowsPath: path.resolve(__dirname, '../apps/worker/workflows'),
      activities: {
        fetchGitHubPRDiff: mockFetchGitHubPRDiff,
        runIronjaw: mockRunIronjaw,
        runBarnacle: mockRunBarnacle,
        runGreenhand: mockRunGreenhand,
        runMutineer: mockMutineer,
        runArbitrator: mockArbitrator,
      },
    });

    await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start('reviewWorkflow', {
        taskQueue: 'test-specialists-ctx',
        workflowId: 'test-specialists-ctx-1',
        args: [
          {
            prUrl: 'https://github.com/acme/backend/pull/42',
            context: 'security audit',
          },
        ],
      });

      const result = await handle.result();
      expect(result.status).toBe('complete');
      expect(result.context).toBe('security audit');
      // Diff stored from fetchGitHubPRDiff and passed to specialists
      expect(result.diff).toBe(FIXTURE_DIFF);
      // All specialists have rawText (they received and processed the diff)
      expect(result.specialists.ironjaw.partialOutput).toContain('IRONJAW');
      expect(result.specialists.barnacle.partialOutput).toContain('Barnacle');
    });
  });
});
