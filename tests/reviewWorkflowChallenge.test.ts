import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { describe, it, expect } from 'vitest';
import path from 'path';
import type { PRDiffResult } from '../apps/worker/activities/fetchGitHubPRDiff';
import type { SpecialistResult } from '../apps/worker/activities/specialists';
import type { MutineerResult } from '../apps/worker/activities/mutineer';
import type { ArbitrationDecision } from '../apps/worker/activities/arbitrator';
import type { SynthesisVerdict } from '../apps/worker/activities/synthesis';

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
const mockSpecialistNoFindings = async (): Promise<SpecialistResult> => ({
  findings: [],
  rawText: 'No issues found',
});
const mockMutineerWithChallenges = async (): Promise<MutineerResult> => ({
  challenges: [
    {
      findingId: 'ironjaw-1',
      specialistName: 'ironjaw',
      challengeText: 'This is not actually a vulnerability.',
    },
  ],
});
const mockMutineerEmpty = async (): Promise<MutineerResult> => ({
  challenges: [],
});
const mockArbitrator = async (): Promise<ArbitrationDecision> => ({
  ruling: 'upheld',
  reasoning: 'The finding stands despite the challenge.',
});
const mockArbitratorOverturned = async (): Promise<ArbitrationDecision> => ({
  ruling: 'overturned',
  reasoning: 'The challenge is valid; finding withdrawn.',
});

const mockSynthesis = async (): Promise<SynthesisVerdict> => ({
  findings: [],
  summary: 'No significant issues.',
});

const mockWriteHistory = async (): Promise<void> => {};

const BASE_ACTIVITIES = {
  fetchGitHubPRDiff: mockFetch,
  runIronjaw: mockIronjaw,
  runBarnacle: mockBarnacle,
  runGreenhand: mockGreenhand,
};

const WORKFLOWS_PATH = path.resolve(__dirname, '../apps/worker/workflows');

/** Create an isolated time-skipping env, run fn, then tear down. */
async function withEnv(fn: (env: TestWorkflowEnvironment) => Promise<void>): Promise<void> {
  const env = await TestWorkflowEnvironment.createTimeSkipping();
  try {
    await fn(env);
  } finally {
    await env.teardown();
  }
}

/** Run fn with a fast+deep worker pair; shuts both down when fn completes. */
async function withWorkers(
  env: TestWorkflowEnvironment,
  fastTaskQueue: string,
  fastActivities: Record<string, unknown>,
  fn: () => Promise<void>
): Promise<void> {
  const fastWorker = await Worker.create({
    connection: env.nativeConnection,
    taskQueue: fastTaskQueue,
    workflowsPath: WORKFLOWS_PATH,
    activities: { ...fastActivities, writeHistoryRecord: mockWriteHistory },
  });
  const deepWorker = await Worker.create({
    connection: env.nativeConnection,
    taskQueue: 'review-deep',
    activities: { runSynthesis: mockSynthesis },
  });
  const deepRun = deepWorker.run();
  try {
    await fastWorker.runUntil(fn);
  } finally {
    deepWorker.shutdown();
    await deepRun.catch(() => {});
  }
}

describe('reviewWorkflow — Issue #4 challenge phase', () => {
  it('opens challenge window after specialist join gate', async () => {
    await withEnv(async (env) => {
      await withWorkers(
        env,
        'test-challenge-window',
        {
          ...BASE_ACTIVITIES,
          runMutineer: mockMutineerEmpty,
          runArbitrator: mockArbitrator,
        },
        async () => {
          const handle = await env.client.workflow.start('reviewWorkflow', {
            taskQueue: 'test-challenge-window',
            workflowId: 'test-challenge-window-1',
            args: [{ prUrl: 'https://github.com/acme/backend/pull/99' }],
          });

          const result = await handle.result();
          expect(result.status).toBe('complete');
          expect(result.windowOpen).toBe(false);
          expect(result.mutineerStatus).toBe('complete');
        }
      );
    });
  }, 60_000);

  it('dispatches arbitrators for mutineer-challenged findings', async () => {
    await withEnv(async (env) => {
      await withWorkers(
        env,
        'test-arb-mutineer',
        {
          ...BASE_ACTIVITIES,
          runMutineer: mockMutineerWithChallenges,
          runArbitrator: mockArbitrator,
        },
        async () => {
          const handle = await env.client.workflow.start('reviewWorkflow', {
            taskQueue: 'test-arb-mutineer',
            workflowId: 'test-arb-mutineer-1',
            args: [{ prUrl: 'https://github.com/acme/backend/pull/99' }],
          });

          const result = await handle.result();
          expect(result.status).toBe('complete');
          expect(result.arbitrations).toHaveLength(1);
          expect(result.arbitrations[0].findingId).toBe('ironjaw-1');
          expect(result.arbitrations[0].ruling).toBe('upheld');
          expect(result.arbitrations[0].status).toBe('complete');
          expect(result.arbitrations[0].challengeSources).toContain('mutineer');
        }
      );
    });
  }, 60_000);

  it('workflow completes if mutineer has no challenges and window expires', async () => {
    await withEnv(async (env) => {
      await withWorkers(
        env,
        'test-no-challenges',
        {
          ...BASE_ACTIVITIES,
          runMutineer: mockMutineerEmpty,
          runArbitrator: mockArbitrator,
        },
        async () => {
          const handle = await env.client.workflow.start('reviewWorkflow', {
            taskQueue: 'test-no-challenges',
            workflowId: 'test-no-challenges-1',
            args: [{ prUrl: 'https://github.com/acme/backend/pull/99' }],
          });

          const result = await handle.result();
          expect(result.status).toBe('complete');
          expect(result.arbitrations).toHaveLength(0);
        }
      );
    });
  }, 60_000);

  it('human challenges are merged with mutineer challenges for same finding', async () => {
    await withEnv(async (env) => {
      await withWorkers(
        env,
        'test-merged-challenges',
        {
          ...BASE_ACTIVITIES,
          runMutineer: mockMutineerWithChallenges, // challenges ironjaw-1
          runArbitrator: mockArbitratorOverturned,
        },
        async () => {
          const handle = await env.client.workflow.start('reviewWorkflow', {
            taskQueue: 'test-merged-challenges',
            workflowId: 'test-merged-challenges-1',
            args: [{ prUrl: 'https://github.com/acme/backend/pull/99' }],
          });

          // Fire executeUpdate concurrently with result() so the long-poll on
          // result() prevents the time-skipping server from advancing the timer
          // before the update is delivered.
          const [updateResult, result] = await Promise.all([
            handle.executeUpdate('submitChallenges', {
              args: [{ 'ironjaw-1': 'I also disagree with this finding.' }],
            }),
            handle.result(),
          ]);

          expect(updateResult).toEqual({ accepted: true });
          expect(result.status).toBe('complete');
          // Should still be one arbitration for ironjaw-1 (not duplicated)
          expect(result.arbitrations).toHaveLength(1);
          expect(result.arbitrations[0].findingId).toBe('ironjaw-1');
          // Both sources present
          expect(result.arbitrations[0].challengeSources).toContain('mutineer');
          expect(result.arbitrations[0].challengeSources).toContain('human');
          expect(result.arbitrations[0].ruling).toBe('overturned');
        }
      );
    });
  }, 60_000);

  it('extendReviewWindow signal adds 120 seconds', async () => {
    await withEnv(async (env) => {
      await withWorkers(
        env,
        'test-extend-window',
        {
          ...BASE_ACTIVITIES,
          runMutineer: mockMutineerEmpty,
          runArbitrator: mockArbitrator,
        },
        async () => {
          const handle = await env.client.workflow.start('reviewWorkflow', {
            taskQueue: 'test-extend-window',
            workflowId: 'test-extend-window-1',
            args: [{ prUrl: 'https://github.com/acme/backend/pull/99' }],
          });

          // Send signal concurrently with result() for the same reason as above.
          const [, result] = await Promise.all([
            handle.signal('extendReviewWindow'),
            handle.result(),
          ]);

          expect(result.status).toBe('complete');
        }
      );
    });
  }, 60_000);

  it('submitChallenges closes the window and stores human challenges', async () => {
    await withEnv(async (env) => {
      await withWorkers(
        env,
        'test-submit-challenges',
        {
          ...BASE_ACTIVITIES,
          runMutineer: mockMutineerEmpty,
          runArbitrator: mockArbitrator,
        },
        async () => {
          const handle = await env.client.workflow.start('reviewWorkflow', {
            taskQueue: 'test-submit-challenges',
            workflowId: 'test-submit-challenges-1',
            args: [{ prUrl: 'https://github.com/acme/backend/pull/99' }],
          });

          // Concurrent: submit update + await result
          const [updateResult, result] = await Promise.all([
            handle.executeUpdate('submitChallenges', {
              args: [{ 'ironjaw-1': 'I think this is fine.' }],
            }),
            handle.result(),
          ]);

          expect(updateResult).toEqual({ accepted: true });
          expect(result.status).toBe('complete');
          expect(result.humanChallenges).toEqual({ 'ironjaw-1': 'I think this is fine.' });
          // One arbitration for the human challenge
          expect(result.arbitrations).toHaveLength(1);
          expect(result.arbitrations[0].challengeSources).toContain('human');
        }
      );
    });
  }, 60_000);

  it('workflow state shows arbitration as complete with ruling', async () => {
    await withEnv(async (env) => {
      await withWorkers(
        env,
        'test-arb-query',
        {
          ...BASE_ACTIVITIES,
          runMutineer: mockMutineerWithChallenges,
          runArbitrator: mockArbitrator,
        },
        async () => {
          const handle = await env.client.workflow.start('reviewWorkflow', {
            taskQueue: 'test-arb-query',
            workflowId: 'test-arb-query-1',
            args: [{ prUrl: 'https://github.com/acme/backend/pull/99' }],
          });

          await handle.result();

          const state = await handle.query('getReviewState') as {
            arbitrations: Array<{ status: string; ruling: string }>;
          };
          expect(state.arbitrations[0].status).toBe('complete');
          expect(state.arbitrations[0].ruling).toBe('upheld');
        }
      );
    });
  }, 60_000);

  it('no arbitrators when all specialists return no findings', async () => {
    await withEnv(async (env) => {
      await withWorkers(
        env,
        'test-no-findings',
        {
          fetchGitHubPRDiff: mockFetch,
          runIronjaw: mockSpecialistNoFindings,
          runBarnacle: mockSpecialistNoFindings,
          runGreenhand: mockSpecialistNoFindings,
          runMutineer: mockMutineerEmpty,
          runArbitrator: mockArbitrator,
        },
        async () => {
          const handle = await env.client.workflow.start('reviewWorkflow', {
            taskQueue: 'test-no-findings',
            workflowId: 'test-no-findings-1',
            args: [{ prUrl: 'https://github.com/acme/backend/pull/99' }],
          });

          const result = await handle.result();
          expect(result.status).toBe('complete');
          expect(result.arbitrations).toHaveLength(0);
          expect(result.mutineerChallenges).toHaveLength(0);
        }
      );
    });
  }, 60_000);
});
