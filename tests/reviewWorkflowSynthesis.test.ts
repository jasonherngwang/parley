import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { describe, it, expect } from 'vitest';
import path from 'path';
import type { PRDiffResult } from '../apps/worker/activities/fetchGitHubPRDiff';
import type { SpecialistResult } from '../apps/worker/activities/specialists';
import type { MutineerResult } from '../apps/worker/activities/mutineer';
import type { ArbitrationDecision } from '../apps/worker/activities/arbitrator';
import type { SynthesisVerdict } from '../apps/worker/activities/synthesis';
import type { WriteHistoryArgs } from '../apps/worker/activities/history';

const FIXTURE_DIFF = `--- a/src/auth.ts\n+++ b/src/auth.ts\n@@ -1 +1 @@\n-return password === 'admin123'\n+return hash === expectedHash`;

const mockFetch = async (): Promise<PRDiffResult> => ({
  title: 'Fix auth',
  repoName: 'acme/backend',
  prNumber: 99,
  diff: FIXTURE_DIFF,
  submitterContext: '',
});

const makeFinding = (prefix: string) => ({
  id: `${prefix}-1`,
  severity: 'major' as const,
  description: `${prefix} issue`,
  recommendation: `Fix ${prefix}`,
});

const mockIronjaw = async (): Promise<SpecialistResult> => ({
  findings: [makeFinding('ironjaw')],
  rawText: 'Ironjaw finds danger',
});
const mockBarnacle = async (): Promise<SpecialistResult> => ({
  findings: [makeFinding('barnacle')],
  rawText: 'Barnacle grumbles',
});
const mockGreenhand = async (): Promise<SpecialistResult> => ({
  findings: [makeFinding('greenhand')],
  rawText: 'Greenhand reports',
});
const mockMutineerEmpty = async (): Promise<MutineerResult> => ({
  challenges: [],
});
const mockArbitrator = async (): Promise<ArbitrationDecision> => ({
  ruling: 'upheld',
  reasoning: 'The finding stands.',
});

const FIXTURE_VERDICT: SynthesisVerdict = {
  findings: [
    {
      severity: 'major',
      specialist: 'ironjaw',
      description: 'ironjaw issue',
      recommendation: 'Fix ironjaw',
    },
    {
      severity: 'major',
      specialist: 'barnacle',
      description: 'barnacle issue',
      recommendation: 'Fix barnacle',
    },
    {
      severity: 'major',
      specialist: 'greenhand',
      description: 'greenhand issue',
      recommendation: 'Fix greenhand',
    },
  ],
  summary: 'Three issues found across the crew.',
};

const mockSynthesis = async (): Promise<SynthesisVerdict> => FIXTURE_VERDICT;

let capturedHistoryArgs: WriteHistoryArgs | null = null;
const mockWriteHistory = async (args: WriteHistoryArgs): Promise<void> => {
  capturedHistoryArgs = args;
};

const BASE_FAST_ACTIVITIES = {
  fetchGitHubPRDiff: mockFetch,
  runIronjaw: mockIronjaw,
  runBarnacle: mockBarnacle,
  runGreenhand: mockGreenhand,
  runMutineer: mockMutineerEmpty,
  runArbitrator: mockArbitrator,
  writeHistoryRecord: mockWriteHistory,
};

const WORKFLOWS_PATH = path.resolve(__dirname, '../apps/worker/workflows');

async function withEnv(fn: (env: TestWorkflowEnvironment) => Promise<void>): Promise<void> {
  const env = await TestWorkflowEnvironment.createTimeSkipping();
  try {
    await fn(env);
  } finally {
    await env.teardown();
  }
}

/** Run fn with a fast+deep worker pair, shutting both down when fn completes. */
async function withWorkers(
  env: TestWorkflowEnvironment,
  fastTaskQueue: string,
  synthesisImpl: () => Promise<SynthesisVerdict>,
  fn: () => Promise<void>
): Promise<void> {
  const fastWorker = await Worker.create({
    connection: env.nativeConnection,
    taskQueue: fastTaskQueue,
    workflowsPath: WORKFLOWS_PATH,
    activities: BASE_FAST_ACTIVITIES,
  });
  const deepWorker = await Worker.create({
    connection: env.nativeConnection,
    taskQueue: 'review-deep',
    activities: { runSynthesis: synthesisImpl },
  });
  const deepRun = deepWorker.run();
  try {
    await fastWorker.runUntil(fn);
  } finally {
    deepWorker.shutdown();
    await deepRun.catch(() => {});
  }
}

describe('reviewWorkflow — Issue #5 synthesis', () => {
  it('synthesis runs after arbitrations and verdict appears in final state', async () => {
    await withEnv(async (env) => {
      capturedHistoryArgs = null;

      await withWorkers(
        env,
        'test-synth-fast-1',
        mockSynthesis,
        async () => {
          const handle = await env.client.workflow.start('reviewWorkflow', {
            taskQueue: 'test-synth-fast-1',
            workflowId: 'test-synth-1',
            args: [{ prUrl: 'https://github.com/acme/backend/pull/99' }],
          });

          const result = await handle.result();
          expect(result.status).toBe('complete');
          expect(result.synthesisStatus).toBe('complete');
          expect(result.verdict).toBeDefined();
          expect(result.verdict?.findings).toHaveLength(3);
          expect(result.verdict?.summary).toBe('Three issues found across the crew.');
        }
      );
    });
  }, 60_000);

  it('writeHistoryRecord is called with correct workflowId, prUrl, prTitle, verdict', async () => {
    await withEnv(async (env) => {
      capturedHistoryArgs = null;

      await withWorkers(
        env,
        'test-synth-fast-2',
        mockSynthesis,
        async () => {
          const handle = await env.client.workflow.start('reviewWorkflow', {
            taskQueue: 'test-synth-fast-2',
            workflowId: 'test-synth-history-check',
            args: [{ prUrl: 'https://github.com/acme/backend/pull/99' }],
          });

          // writeHistoryRecord runs during the workflow, before result() returns
          await handle.result();

          expect(capturedHistoryArgs).not.toBeNull();
          expect(capturedHistoryArgs?.workflowId).toBe('test-synth-history-check');
          expect(capturedHistoryArgs?.prUrl).toBe(
            'https://github.com/acme/backend/pull/99'
          );
          expect(capturedHistoryArgs?.prTitle).toBe('Fix auth');
          expect(capturedHistoryArgs?.repoName).toBe('acme/backend');
          expect(capturedHistoryArgs?.verdict).toEqual(FIXTURE_VERDICT);
        }
      );
    });
  }, 60_000);

  it('workflow completes even if synthesis fails (synthesisStatus=failed)', async () => {
    await withEnv(async (env) => {
      const failingSynthesis = async (): Promise<SynthesisVerdict> => {
        throw new Error('Synthesis API unavailable');
      };

      await withWorkers(
        env,
        'test-synth-fail',
        failingSynthesis,
        async () => {
          const handle = await env.client.workflow.start('reviewWorkflow', {
            taskQueue: 'test-synth-fail',
            workflowId: 'test-synth-fail-1',
            args: [{ prUrl: 'https://github.com/acme/backend/pull/99' }],
          });

          const result = await handle.result();
          // Workflow still completes despite synthesis failure
          expect(result.status).toBe('complete');
          expect(result.synthesisStatus).toBe('failed');
          expect(result.verdict).toBeUndefined();
        }
      );
    });
  }, 120_000);

  it('synthesisStatus is complete and verdict present at end of workflow', async () => {
    await withEnv(async (env) => {
      await withWorkers(
        env,
        'test-synth-status',
        mockSynthesis,
        async () => {
          const handle = await env.client.workflow.start('reviewWorkflow', {
            taskQueue: 'test-synth-status',
            workflowId: 'test-synth-status-1',
            args: [{ prUrl: 'https://github.com/acme/backend/pull/99' }],
          });

          const result = await handle.result();
          expect(result.synthesisStatus).toBe('complete');
          expect(result.verdict?.summary).toBe('Three issues found across the crew.');
        }
      );
    });
  }, 60_000);
});
