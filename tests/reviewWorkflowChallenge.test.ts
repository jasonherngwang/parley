import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { describe, it, expect } from 'vitest';
import path from 'path';
import type { PRDiffResult } from '../apps/worker/activities/fetchGitHubPRDiff';
import type { SpecialistResult } from '../apps/worker/activities/specialists';
import type { MutineerForFindingResult, MutineerForFindingInput } from '../apps/worker/activities/mutineer';
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

// Mutineer that challenges ironjaw-1
const mockMutineerChallengeIronjaw = async (args: MutineerForFindingInput): Promise<MutineerForFindingResult> => {
  if (args.finding.id === 'ironjaw-1') {
    return { challenged: true, challengeText: 'This is not actually a vulnerability.' };
  }
  return { challenged: false, challengeText: null };
};

const mockMutineerNoChallenges = async (): Promise<MutineerForFindingResult> => ({
  challenged: false,
  challengeText: null,
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

describe('reviewWorkflow — child workflow challenge phase', () => {
  it('spawns child workflows and completes with findings in state', async () => {
    await withEnv(async (env) => {
      await withWorkers(
        env,
        'test-child-basic',
        {
          ...BASE_ACTIVITIES,
          runMutineerForFinding: mockMutineerNoChallenges,
          runArbitrator: mockArbitrator,
        },
        async () => {
          const handle = await env.client.workflow.start('reviewWorkflow', {
            taskQueue: 'test-child-basic',
            workflowId: 'test-child-basic-1',
            args: [{ prUrl: 'https://github.com/acme/backend/pull/99' }],
          });

          const result = await handle.result();
          expect(result.status).toBe('complete');
          expect(result.windowOpen).toBe(false);
          // Should have 3 findings (one from each specialist)
          expect(result.findings).toHaveLength(3);
          // All accepted since no challenges
          for (const f of result.findings) {
            expect(f.childStatus).toBe('complete');
            expect(f.ruling).toBe('accepted');
          }
        }
      );
    });
  }, 60_000);

  it('mutineer challenge in child workflow triggers arbitration', async () => {
    await withEnv(async (env) => {
      await withWorkers(
        env,
        'test-child-mutineer',
        {
          ...BASE_ACTIVITIES,
          runMutineerForFinding: mockMutineerChallengeIronjaw,
          runArbitrator: mockArbitrator,
        },
        async () => {
          const handle = await env.client.workflow.start('reviewWorkflow', {
            taskQueue: 'test-child-mutineer',
            workflowId: 'test-child-mutineer-1',
            args: [{ prUrl: 'https://github.com/acme/backend/pull/99' }],
          });

          const result = await handle.result();
          expect(result.status).toBe('complete');
          expect(result.findings).toHaveLength(3);

          const ironjawFinding = result.findings.find((f: { findingId: string }) => f.findingId === 'ironjaw-1');
          expect(ironjawFinding).toBeDefined();
          expect(ironjawFinding!.mutineerChallenge).toBe('This is not actually a vulnerability.');
          expect(ironjawFinding!.ruling).toBe('upheld');
          expect(ironjawFinding!.reasoning).toBe('The finding stands despite the challenge.');

          // Other findings should be accepted (no challenge)
          const barnacleFinding = result.findings.find((f: { findingId: string }) => f.findingId === 'barnacle-1');
          expect(barnacleFinding!.ruling).toBe('accepted');
        }
      );
    });
  }, 60_000);

  it('human challenges are sent to child workflows via signal', async () => {
    await withEnv(async (env) => {
      await withWorkers(
        env,
        'test-child-human',
        {
          ...BASE_ACTIVITIES,
          runMutineerForFinding: mockMutineerNoChallenges,
          runArbitrator: mockArbitratorOverturned,
        },
        async () => {
          const handle = await env.client.workflow.start('reviewWorkflow', {
            taskQueue: 'test-child-human',
            workflowId: 'test-child-human-1',
            args: [{ prUrl: 'https://github.com/acme/backend/pull/99' }],
          });

          // Submit human challenge concurrently with result()
          const [updateResult, result] = await Promise.all([
            handle.executeUpdate('submitChallenges', {
              args: [{ 'ironjaw-1': 'I disagree with this finding.' }],
            }),
            handle.result(),
          ]);

          expect(updateResult).toEqual({ accepted: true });
          expect(result.status).toBe('complete');
          expect(result.humanChallenges).toEqual({ 'ironjaw-1': 'I disagree with this finding.' });

          const ironjawFinding = result.findings.find((f: { findingId: string }) => f.findingId === 'ironjaw-1');
          expect(ironjawFinding!.humanChallenge).toBe('I disagree with this finding.');
          expect(ironjawFinding!.ruling).toBe('overturned');
        }
      );
    });
  }, 60_000);

  it('extendReviewWindow signal still works with child workflow architecture', async () => {
    await withEnv(async (env) => {
      await withWorkers(
        env,
        'test-child-extend',
        {
          ...BASE_ACTIVITIES,
          runMutineerForFinding: mockMutineerNoChallenges,
          runArbitrator: mockArbitrator,
        },
        async () => {
          const handle = await env.client.workflow.start('reviewWorkflow', {
            taskQueue: 'test-child-extend',
            workflowId: 'test-child-extend-1',
            args: [{ prUrl: 'https://github.com/acme/backend/pull/99' }],
          });

          const [, result] = await Promise.all([
            handle.signal('extendReviewWindow'),
            handle.result(),
          ]);

          expect(result.status).toBe('complete');
        }
      );
    });
  }, 60_000);

  it('no child workflows spawned when all specialists return no findings', async () => {
    await withEnv(async (env) => {
      await withWorkers(
        env,
        'test-child-no-findings',
        {
          fetchGitHubPRDiff: mockFetch,
          runIronjaw: mockSpecialistNoFindings,
          runBarnacle: mockSpecialistNoFindings,
          runGreenhand: mockSpecialistNoFindings,
          runMutineerForFinding: mockMutineerNoChallenges,
          runArbitrator: mockArbitrator,
        },
        async () => {
          const handle = await env.client.workflow.start('reviewWorkflow', {
            taskQueue: 'test-child-no-findings',
            workflowId: 'test-child-no-findings-1',
            args: [{ prUrl: 'https://github.com/acme/backend/pull/99' }],
          });

          const result = await handle.result();
          expect(result.status).toBe('complete');
          expect(result.findings).toHaveLength(0);
        }
      );
    });
  }, 60_000);

  it('child workflow results include specialist and severity metadata', async () => {
    await withEnv(async (env) => {
      await withWorkers(
        env,
        'test-child-metadata',
        {
          ...BASE_ACTIVITIES,
          runMutineerForFinding: mockMutineerNoChallenges,
          runArbitrator: mockArbitrator,
        },
        async () => {
          const handle = await env.client.workflow.start('reviewWorkflow', {
            taskQueue: 'test-child-metadata',
            workflowId: 'test-child-metadata-1',
            args: [{ prUrl: 'https://github.com/acme/backend/pull/99' }],
          });

          const result = await handle.result();
          expect(result.findings).toHaveLength(3);

          for (const f of result.findings) {
            expect(f.specialist).toBeDefined();
            expect(f.severity).toBe('major');
            expect(f.description).toBeDefined();
            expect(f.recommendation).toBeDefined();
            expect(f.childWorkflowId).toContain(f.findingId);
          }
        }
      );
    });
  }, 60_000);
});
