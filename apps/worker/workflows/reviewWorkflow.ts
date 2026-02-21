import * as wf from '@temporalio/workflow';
import type * as fetchActivities from '../activities/fetchGitHubPRDiff';
import type * as specialistActivities from '../activities/specialists';
import type * as mutineerActivities from '../activities/mutineer';
import type * as arbitratorActivities from '../activities/arbitrator';
import type * as synthesisActivities from '../activities/synthesis';
import type * as historyActivities from '../activities/history';
import type { Finding, SpecialistResult } from '../activities/specialists';
import type { MutineerResult, MutineerChallenge } from '../activities/mutineer';
import type { SynthesisVerdict } from '../activities/synthesis';

const { fetchGitHubPRDiff } = wf.proxyActivities<typeof fetchActivities>({
  startToCloseTimeout: '45s',
  heartbeatTimeout: '15s',
  retry: {
    maximumAttempts: 2,
    initialInterval: '1s',
  },
});

const { runIronjaw, runBarnacle, runGreenhand } =
  wf.proxyActivities<typeof specialistActivities>({
    startToCloseTimeout: '45s',
    heartbeatTimeout: '15s',
    retry: {
      maximumAttempts: 3,
      initialInterval: '2s',
      backoffCoefficient: 2,
    },
  });

const { runMutineer } = wf.proxyActivities<typeof mutineerActivities>({
  startToCloseTimeout: '90s',
  heartbeatTimeout: '15s',
  retry: {
    maximumAttempts: 3,
    initialInterval: '2s',
    backoffCoefficient: 2,
  },
});

const { runArbitrator } = wf.proxyActivities<typeof arbitratorActivities>({
  startToCloseTimeout: '30s',
  retry: {
    maximumAttempts: 3,
    initialInterval: '2s',
    backoffCoefficient: 2,
  },
});

const { runSynthesis } = wf.proxyActivities<typeof synthesisActivities>({
  taskQueue: 'review-deep',
  startToCloseTimeout: '3 minutes',
  heartbeatTimeout: '30s',
  retry: {
    maximumAttempts: 2,
    initialInterval: '5s',
  },
});

const { writeHistoryRecord } = wf.proxyActivities<typeof historyActivities>({
  startToCloseTimeout: '30s',
  retry: {
    maximumAttempts: 3,
    initialInterval: '1s',
  },
});

export type SpecialistStatus =
  | 'pending'
  | 'running'
  | 'complete'
  | 'timed-out'
  | 'failed';

export type MutineerStatus = 'pending' | 'running' | 'complete' | 'failed';

export type SynthesisStatus = 'pending' | 'running' | 'complete' | 'failed';

export interface SpecialistState {
  status: SpecialistStatus;
  attemptNumber: number;
  partialOutput?: string;
  findings: Finding[] | null;
}

export interface ArbitrationState {
  findingId: string;
  status: 'pending' | 'running' | 'complete';
  ruling?: 'upheld' | 'overturned' | 'inconclusive';
  reasoning?: string;
  challengeSources: Array<'mutineer' | 'human'>;
}

export interface ReviewState {
  status: 'running' | 'complete';
  prUrl: string;
  context?: string;
  title?: string;
  repoName?: string;
  prNumber?: number;
  diff?: string;
  specialists: {
    ironjaw: SpecialistState;
    barnacle: SpecialistState;
    greenhand: SpecialistState;
  };
  // Phase 2: challenge window
  windowOpen: boolean;
  secondsRemaining: number;
  humanChallenges: Record<string, string>;
  mutineerStatus: MutineerStatus;
  mutineerPartialOutput?: string;
  mutineerChallenges: MutineerChallenge[];
  arbitrations: ArbitrationState[];
  // Phase 3: synthesis
  synthesisStatus: SynthesisStatus;
  synthesisPartialOutput?: string;
  verdict?: SynthesisVerdict;
}

// Signals and updates
export const extendReviewWindow = wf.defineSignal('extendReviewWindow');
export const submitChallenges = wf.defineUpdate<
  { accepted: boolean },
  [Record<string, string>]
>('submitChallenges');

export const getReviewState = wf.defineQuery<ReviewState>('getReviewState');

const defaultSpecialistState = (): SpecialistState => ({
  status: 'pending',
  attemptNumber: 0,
  findings: null,
});

function findFindingById(
  findingId: string,
  specialists: ReviewState['specialists']
): Finding | undefined {
  for (const s of Object.values(specialists)) {
    if (s.findings) {
      const found = s.findings.find((f) => f.id === findingId);
      if (found) return found;
    }
  }
  return undefined;
}

// Tick size for the countdown loop (seconds).
// 600 = single tick for 10-minute window → fewest workflow tasks → fastest tests.
const WINDOW_TICK_S = 600;

export async function reviewWorkflow(args: {
  prUrl: string;
  context?: string;
}): Promise<ReviewState> {
  let state: ReviewState = {
    status: 'running',
    prUrl: args.prUrl,
    context: args.context,
    specialists: {
      ironjaw: defaultSpecialistState(),
      barnacle: defaultSpecialistState(),
      greenhand: defaultSpecialistState(),
    },
    windowOpen: false,
    secondsRemaining: 0,
    humanChallenges: {},
    mutineerStatus: 'pending',
    mutineerChallenges: [],
    arbitrations: [],
    synthesisStatus: 'pending',
  };

  wf.setHandler(getReviewState, () => state);

  // Register Signal + Update handlers early so they're never missed.
  // Both are no-ops / errors while the window is not yet open.

  // Signal: extend window by 2 minutes (no-op if window not open)
  wf.setHandler(extendReviewWindow, () => {
    if (state.windowOpen) {
      state = { ...state, secondsRemaining: state.secondsRemaining + 120 };
    }
  });

  // Update: submit human challenges.
  // Accept at any point during the review (not only while windowOpen) so that
  // time-skipping tests — where the 600s timer fires before the gRPC call lands —
  // still record the challenges and include them in arbitration.
  // Throwing in the handler body (not in a validator) causes workflow-task failures
  // and retry loops, so we simply never throw here.
  wf.setHandler(submitChallenges, (challenges) => {
    state = { ...state, humanChallenges: challenges };
    if (state.windowOpen) {
      state = { ...state, windowOpen: false };
    }
    return { accepted: true };
  });

  // ── Step 1: Fetch PR diff ───────────────────────────────────────────────────
  const prResult = await fetchGitHubPRDiff({
    prUrl: args.prUrl,
    context: args.context,
  });

  state = {
    ...state,
    title: prResult.title,
    repoName: prResult.repoName,
    prNumber: prResult.prNumber,
    diff: prResult.diff,
    specialists: {
      ironjaw: { ...state.specialists.ironjaw, status: 'running' },
      barnacle: { ...state.specialists.barnacle, status: 'running' },
      greenhand: { ...state.specialists.greenhand, status: 'running' },
    },
  };

  const specialistArgs = { diff: prResult.diff, context: args.context };

  // ── Step 2: Run specialists in parallel (Join Gate 1) ──────────────────────
  async function runWithTimeout(
    name: 'ironjaw' | 'barnacle' | 'greenhand',
    run: () => Promise<SpecialistResult>
  ): Promise<void> {
    try {
      await wf.CancellationScope.withTimeout(45_000, async () => {
        const result = await run();
        state = {
          ...state,
          specialists: {
            ...state.specialists,
            [name]: {
              status: 'complete',
              attemptNumber: state.specialists[name].attemptNumber,
              partialOutput: result.rawText,
              findings: result.findings,
            },
          },
        };
      });
    } catch (err) {
      if (wf.isCancellation(err)) {
        state = {
          ...state,
          specialists: {
            ...state.specialists,
            [name]: {
              ...state.specialists[name],
              status: 'timed-out',
              findings: null,
            },
          },
        };
      } else {
        state = {
          ...state,
          specialists: {
            ...state.specialists,
            [name]: {
              ...state.specialists[name],
              status: 'failed',
              findings: null,
            },
          },
        };
      }
    }
  }

  await Promise.all([
    runWithTimeout('ironjaw', () => runIronjaw(specialistArgs)),
    runWithTimeout('barnacle', () => runBarnacle(specialistArgs)),
    runWithTimeout('greenhand', () => runGreenhand(specialistArgs)),
  ]);

  // ── Step 3: Open challenge window + run Mutineer in parallel (Join Gate 2) ─
  state = {
    ...state,
    windowOpen: true,
    secondsRemaining: 600,
    mutineerStatus: 'running',
  };

  // Build allFindings for Mutineer
  const allFindings: Record<string, Finding[]> = {
    ironjaw: state.specialists.ironjaw.findings ?? [],
    barnacle: state.specialists.barnacle.findings ?? [],
    greenhand: state.specialists.greenhand.findings ?? [],
  };

  // Countdown function — resolves when window closes or timer expires
  const runWindow = async (): Promise<void> => {
    while (state.windowOpen && state.secondsRemaining > 0) {
      const tick = Math.min(state.secondsRemaining, WINDOW_TICK_S);
      const closed = await wf.condition(
        () => !state.windowOpen,
        tick * 1000
      );
      if (closed) break;
      state = {
        ...state,
        secondsRemaining: Math.max(0, state.secondsRemaining - tick),
      };
    }
    state = { ...state, windowOpen: false };
  };

  // Mutineer runs in parallel with the window
  const mutineerPromise = runMutineer({
    allFindings,
    capPerSpecialist: 3,
  })
    .then((result: MutineerResult) => {
      state = {
        ...state,
        mutineerStatus: 'complete',
        mutineerChallenges: result.challenges,
      };
      return result;
    })
    .catch(() => {
      state = { ...state, mutineerStatus: 'failed' };
      return { challenges: [] } as MutineerResult;
    });

  // Join Gate 2: wait for both Mutineer and window to resolve
  const [mutineerResult] = await Promise.all([
    mutineerPromise,
    runWindow(),
  ]);

  // ── Step 4: Fan-out arbitrators for all challenged findings ────────────────

  // Merge mutineer challenges + human challenges per finding
  type MergedChallenge = {
    findingId: string;
    finding: Finding;
    mutineerChallenge?: string;
    humanChallenge?: string;
    sources: Array<'mutineer' | 'human'>;
  };

  const mergedMap = new Map<string, MergedChallenge>();

  // From Mutineer
  for (const c of mutineerResult.challenges) {
    const finding = findFindingById(c.findingId, state.specialists);
    if (!finding) continue;
    if (!mergedMap.has(c.findingId)) {
      mergedMap.set(c.findingId, {
        findingId: c.findingId,
        finding,
        mutineerChallenge: c.challengeText,
        sources: ['mutineer'],
      });
    } else {
      const entry = mergedMap.get(c.findingId)!;
      entry.mutineerChallenge = c.challengeText;
      if (!entry.sources.includes('mutineer')) entry.sources.push('mutineer');
    }
  }

  // From human
  for (const [findingId, challengeText] of Object.entries(
    state.humanChallenges
  )) {
    if (!challengeText.trim()) continue;
    const finding = findFindingById(findingId, state.specialists);
    if (!finding) continue;
    if (!mergedMap.has(findingId)) {
      mergedMap.set(findingId, {
        findingId,
        finding,
        humanChallenge: challengeText,
        sources: ['human'],
      });
    } else {
      const entry = mergedMap.get(findingId)!;
      entry.humanChallenge = challengeText;
      if (!entry.sources.includes('human')) entry.sources.push('human');
    }
  }

  // Initialise arbitration slots
  const mergedChallenges = Array.from(mergedMap.values());
  state = {
    ...state,
    arbitrations: mergedChallenges.map((c) => ({
      findingId: c.findingId,
      status: 'pending',
      challengeSources: c.sources,
    })),
  };

  // Dispatch one arbitrator per disputed finding, all in parallel
  const arbitrationPromises = mergedChallenges.map(async (input) => {
    const fid = input.findingId;

    state = {
      ...state,
      arbitrations: state.arbitrations.map((a) =>
        a.findingId === fid ? { ...a, status: 'running' } : a
      ),
    };

    try {
      const decision = await runArbitrator({
        finding: input.finding,
        mutineerChallenge: input.mutineerChallenge,
        humanChallenge: input.humanChallenge,
      });
      state = {
        ...state,
        arbitrations: state.arbitrations.map((a) =>
          a.findingId === fid
            ? {
                ...a,
                status: 'complete',
                ruling: decision.ruling,
                reasoning: decision.reasoning,
              }
            : a
        ),
      };
    } catch {
      state = {
        ...state,
        arbitrations: state.arbitrations.map((a) =>
          a.findingId === fid
            ? {
                ...a,
                status: 'complete',
                ruling: 'inconclusive',
                reasoning: 'Arbitrator unavailable',
              }
            : a
        ),
      };
    }
  });

  await Promise.all(arbitrationPromises);

  // ── Step 5: Synthesis ──────────────────────────────────────────────────────
  // Ensure all signal/update handlers have finished before reading final state
  await wf.condition(wf.allHandlersFinished);

  state = { ...state, synthesisStatus: 'running' };

  const specialistOutputs: Record<string, Finding[] | null> = {
    ironjaw: state.specialists.ironjaw.findings,
    barnacle: state.specialists.barnacle.findings,
    greenhand: state.specialists.greenhand.findings,
  };

  const arbitrationOutcomes = state.arbitrations
    .filter((a) => a.ruling !== undefined)
    .map((a) => ({
      findingId: a.findingId,
      challengeSources: a.challengeSources as string[],
      ruling: a.ruling!,
      reasoning: a.reasoning ?? '',
    }));

  try {
    const verdictResult = await runSynthesis({
      specialistOutputs,
      arbitrationOutcomes,
    });
    state = {
      ...state,
      synthesisStatus: 'complete',
      verdict: verdictResult,
    };
  } catch {
    state = { ...state, synthesisStatus: 'failed' };
  }

  // ── Step 6: Write history record ──────────────────────────────────────────
  const info = wf.workflowInfo();
  try {
    await writeHistoryRecord({
      workflowId: info.workflowId,
      prUrl: args.prUrl,
      prTitle: state.title ?? '',
      repoName: state.repoName ?? '',
      startedAt: info.startTime.toISOString(),
      specialistOutputs,
      disputeOutcomes: arbitrationOutcomes,
      verdict: state.verdict ?? { findings: [], summary: '' },
    });
  } catch {
    // Non-fatal: history write failure should not prevent workflow completion
  }

  state = { ...state, status: 'complete' };
  return state;
}
