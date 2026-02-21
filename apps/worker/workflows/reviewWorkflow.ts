import * as wf from '@temporalio/workflow';
import type * as fetchActivities from '../activities/fetchGitHubPRDiff';
import type * as specialistActivities from '../activities/specialists';
import type * as mutineerActivities from '../activities/mutineer';
import type * as arbitratorActivities from '../activities/arbitrator';
import type * as synthesisActivities from '../activities/synthesis';
import type * as historyActivities from '../activities/history';
import type { Finding, SpecialistResult } from '../activities/specialists';
import type { MutineerChallenge } from '../activities/mutineer';
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

const TERMINAL: Set<string> = new Set(['complete', 'timed-out', 'failed']);

// Continue-As-New threshold. History length > this triggers a new execution.
const CAN_THRESHOLD = 10_000;

export async function reviewWorkflow(args: {
  prUrl: string;
  context?: string;
  // Populated when this execution was started by a Continue-As-New call.
  _resumeState?: ReviewState;
}): Promise<ReviewState> {
  // Initialize state from a prior execution (Continue-As-New) or fresh.
  let state: ReviewState = args._resumeState ?? {
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

  // Signal: extend window by 2 minutes (no-op if window not open)
  wf.setHandler(extendReviewWindow, () => {
    if (state.windowOpen) {
      state = { ...state, secondsRemaining: state.secondsRemaining + 120 };
    }
  });

  // Update: submit human challenges.
  // Accept at any point during the review so that time-skipping tests — where
  // the 600s timer fires before the gRPC call lands — still record the
  // challenges and include them in arbitration.
  wf.setHandler(submitChallenges, (challenges) => {
    state = { ...state, humanChallenges: challenges };
    if (state.windowOpen) {
      state = { ...state, windowOpen: false };
    }
    return { accepted: true };
  });

  // If resuming a completed execution, return immediately.
  if (state.status === 'complete') return state;

  // ── Step 1: Fetch PR diff (skip if already fetched) ────────────────────────
  if (!state.diff) {
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
  }

  const specialistArgs = { diff: state.diff!, context: args.context };

  // ── Step 2: Run specialists in parallel (skip if all done) ─────────────────
  const specialistsDone = () =>
    (['ironjaw', 'barnacle', 'greenhand'] as const).every((n) =>
      TERMINAL.has(state.specialists[n].status)
    );

  if (!specialistsDone()) {
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

    // Only dispatch specialists that are still in a non-terminal state.
    const tasks: Promise<void>[] = [];
    if (!TERMINAL.has(state.specialists.ironjaw.status))
      tasks.push(runWithTimeout('ironjaw', () => runIronjaw(specialistArgs)));
    if (!TERMINAL.has(state.specialists.barnacle.status))
      tasks.push(runWithTimeout('barnacle', () => runBarnacle(specialistArgs)));
    if (!TERMINAL.has(state.specialists.greenhand.status))
      tasks.push(
        runWithTimeout('greenhand', () => runGreenhand(specialistArgs))
      );

    await Promise.all(tasks);
  }

  // ── Continue-As-New checkpoint 1 (post-specialists) ────────────────────────
  if (wf.workflowInfo().historyLength > CAN_THRESHOLD) {
    await wf.continueAsNew<typeof reviewWorkflow>({
      prUrl: args.prUrl,
      context: args.context,
      _resumeState: state,
    });
  }

  // ── Step 3: Challenge window + Mutineer in parallel (Join Gate 2) ──────────
  const challengePhaseDone = () =>
    !state.windowOpen && TERMINAL.has(state.mutineerStatus);

  if (!challengePhaseDone()) {
    // (Re-)initialize challenge window if it hasn't been opened yet.
    if (state.mutineerStatus === 'pending') {
      state = {
        ...state,
        windowOpen: true,
        secondsRemaining: 600,
        mutineerStatus: 'running',
      };
    }

    // Build allFindings for Mutineer
    const allFindings: Record<string, Finding[]> = {
      ironjaw: state.specialists.ironjaw.findings ?? [],
      barnacle: state.specialists.barnacle.findings ?? [],
      greenhand: state.specialists.greenhand.findings ?? [],
    };

    // Countdown — resolves when window closes or timer expires
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

    // Only run Mutineer if it hasn't completed yet.
    type MutineerPromise = Promise<void>;
    let mutineerPromise: MutineerPromise;
    if (TERMINAL.has(state.mutineerStatus)) {
      mutineerPromise = Promise.resolve();
    } else {
      mutineerPromise = runMutineer({ allFindings, capPerSpecialist: 3 })
        .then((result) => {
          state = {
            ...state,
            mutineerStatus: 'complete',
            mutineerChallenges: result.challenges,
          };
        })
        .catch(() => {
          state = { ...state, mutineerStatus: 'failed' };
        });
    }

    await Promise.all([mutineerPromise, runWindow()]);
  }

  // ── Build arbitration slots (first-time or empty after resume) ─────────────
  // Done here (before CAN checkpoint 2) so the resumed execution can directly
  // dispatch pending arbitrators without rebuilding the merged map.
  if (state.arbitrations.length === 0) {
    const mergedMap = new Map<
      string,
      { findingId: string; sources: Array<'mutineer' | 'human'> }
    >();

    for (const c of state.mutineerChallenges) {
      if (!findFindingById(c.findingId, state.specialists)) continue;
      if (!mergedMap.has(c.findingId)) {
        mergedMap.set(c.findingId, {
          findingId: c.findingId,
          sources: ['mutineer'],
        });
      } else {
        const entry = mergedMap.get(c.findingId)!;
        if (!entry.sources.includes('mutineer')) entry.sources.push('mutineer');
      }
    }

    for (const [findingId, challengeText] of Object.entries(
      state.humanChallenges
    )) {
      if (!challengeText.trim()) continue;
      if (!findFindingById(findingId, state.specialists)) continue;
      if (!mergedMap.has(findingId)) {
        mergedMap.set(findingId, { findingId, sources: ['human'] });
      } else {
        const entry = mergedMap.get(findingId)!;
        if (!entry.sources.includes('human')) entry.sources.push('human');
      }
    }

    state = {
      ...state,
      arbitrations: Array.from(mergedMap.values()).map((c) => ({
        findingId: c.findingId,
        status: 'pending' as const,
        challengeSources: c.sources,
      })),
    };
  }

  // ── Continue-As-New checkpoint 2 (post-challenge, slots initialized) ───────
  if (wf.workflowInfo().historyLength > CAN_THRESHOLD) {
    await wf.continueAsNew<typeof reviewWorkflow>({
      prUrl: args.prUrl,
      context: args.context,
      _resumeState: state,
    });
  }

  // ── Step 4: Fan-out arbitrators for all non-complete findings ───────────────
  const pendingArbs = state.arbitrations.filter((a) => a.status !== 'complete');

  if (pendingArbs.length > 0) {
    const arbitrationPromises = pendingArbs.map(async (arb) => {
      const fid = arb.findingId;
      const finding = findFindingById(fid, state.specialists);
      if (!finding) return;

      const mutineerChallenge = state.mutineerChallenges.find(
        (c) => c.findingId === fid
      )?.challengeText;
      const humanChallenge = state.humanChallenges[fid]?.trim()
        ? state.humanChallenges[fid]
        : undefined;

      state = {
        ...state,
        arbitrations: state.arbitrations.map((a) =>
          a.findingId === fid ? { ...a, status: 'running' as const } : a
        ),
      };

      try {
        const decision = await runArbitrator({
          finding,
          mutineerChallenge,
          humanChallenge,
        });
        state = {
          ...state,
          arbitrations: state.arbitrations.map((a) =>
            a.findingId === fid
              ? {
                  ...a,
                  status: 'complete' as const,
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
                  status: 'complete' as const,
                  ruling: 'inconclusive' as const,
                  reasoning: 'Arbitrator unavailable',
                }
              : a
          ),
        };
      }
    });

    await Promise.all(arbitrationPromises);
  }

  // ── Continue-As-New checkpoint 3 (post-arbitration) ───────────────────────
  if (wf.workflowInfo().historyLength > CAN_THRESHOLD) {
    await wf.continueAsNew<typeof reviewWorkflow>({
      prUrl: args.prUrl,
      context: args.context,
      _resumeState: state,
    });
  }

  // ── Step 5: Synthesis ──────────────────────────────────────────────────────
  // Ensure all signal/update handlers have finished before reading final state
  await wf.condition(wf.allHandlersFinished);

  if (state.synthesisStatus !== 'complete' && state.synthesisStatus !== 'failed') {
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

    // ── Step 6: Write history record ────────────────────────────────────────
    const info = wf.workflowInfo();
    try {
      await writeHistoryRecord({
        workflowId: info.workflowId,
        prUrl: args.prUrl,
        prTitle: state.title ?? '',
        repoName: state.repoName ?? '',
        startedAt: info.startTime.toISOString(),
        specialistOutputs,
        disputeOutcomes: state.arbitrations
          .filter((a) => a.ruling !== undefined)
          .map((a) => ({
            findingId: a.findingId,
            challengeSources: a.challengeSources as string[],
            ruling: a.ruling!,
            reasoning: a.reasoning ?? '',
          })),
        verdict: state.verdict ?? { findings: [], summary: '' },
      });
    } catch {
      // Non-fatal: history write failure should not prevent workflow completion
    }
  }

  state = { ...state, status: 'complete' };
  return state;
}
