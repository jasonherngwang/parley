import * as wf from '@temporalio/workflow';
import type * as fetchActivities from '../activities/fetchGitHubPRDiff';
import type { PRDiffResult } from '../activities/fetchGitHubPRDiff';
import type * as specialistActivities from '../activities/specialists';
import type * as synthesisActivities from '../activities/synthesis';
import type * as historyActivities from '../activities/history';
import type { Finding, SpecialistResult } from '../activities/specialists';
import type { SynthesisVerdict } from '../activities/synthesis';
import {
  findingWorkflow,
  provideHumanInput,
  reportMutineerResult,
  type FindingWorkflowInput,
  type FindingWorkflowResult,
} from './findingWorkflow';

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

const { runSynthesis } = wf.proxyActivities<typeof synthesisActivities>({
  taskQueue: 'review-deep',
  startToCloseTimeout: '3 minutes',
  heartbeatTimeout: '60s',
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
  | 'failed';

export type SynthesisStatus = 'pending' | 'running' | 'complete' | 'failed';

export interface SpecialistState {
  status: SpecialistStatus;
  partialOutput?: string;
  findings: Finding[] | null;
}

export interface FindingLifecycle {
  findingId: string;
  specialist: string;
  severity: 'critical' | 'major' | 'minor';
  description: string;
  recommendation: string;
  childWorkflowId: string;
  childStatus: 'started' | 'complete' | 'failed';
  mutineerChallenge?: string | null;
  mutineerVerdict?: 'agree' | 'disagree' | 'partial';
  mutineerFailed?: boolean;
  humanChallenge?: string | null;
  ruling?: 'upheld' | 'overturned' | 'accepted';
  reasoning?: string;
  arbiterMutineerStance?: 'agrees' | 'disagrees' | 'mixed';
  arbiterHumanStance?: 'agrees' | 'disagrees' | 'mixed';
}

export interface PhaseTiming {
  fetchStartedAt?: string;
  specialistsStartedAt?: string;
  specialistsCompletedAt?: string;
  findingsStartedAt?: string;
  findingsCompletedAt?: string;
  synthesisStartedAt?: string;
  completedAt?: string;
}

export interface TemporalMeta {
  workflowId: string;
  runId: string;
  taskQueue: string;
  historyLength: number;
  startedAt: string;
  continueAsNewCount: number;
  phaseTiming: PhaseTiming;
}

export interface ReviewState {
  status: 'running' | 'complete';
  prUrl: string;
  context?: string;
  title?: string;
  repoName?: string;
  prNumber?: number;
  diff?: string;
  fetchError?: string;
  specialists: {
    ironjaw: SpecialistState;
    barnacle: SpecialistState;
    greenhand: SpecialistState;
  };
  // Phase 2: child workflows per finding
  findings: FindingLifecycle[];
  // Human window (shared timer, runs in parent)
  windowOpen: boolean;
  secondsRemaining: number;
  humanChallenges: Record<string, string>;
  // Phase 3: synthesis
  synthesisStatus: SynthesisStatus;
  synthesisPartialOutput?: string;
  verdict?: SynthesisVerdict;
  // Temporal metadata for demo/educational UI
  temporal: TemporalMeta;
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
  findings: null,
});

const TERMINAL: Set<string> = new Set(['complete', 'failed']);

// Continue-As-New threshold. History length > this triggers a new execution.
const CAN_THRESHOLD = 10_000;

/** Snapshot Temporal runtime metadata and optionally merge phase timing. */
function refreshTemporal(
  current: TemporalMeta,
  phaseUpdate?: Partial<PhaseTiming>
): TemporalMeta {
  const info = wf.workflowInfo();
  return {
    ...current,
    runId: info.runId,
    historyLength: info.historyLength,
    phaseTiming: phaseUpdate
      ? { ...current.phaseTiming, ...phaseUpdate }
      : current.phaseTiming,
  };
}

export async function reviewWorkflow(args: {
  prUrl: string;
  context?: string;
  // Populated when this execution was started by a Continue-As-New call.
  _resumeState?: ReviewState;
}): Promise<ReviewState> {
  const info = wf.workflowInfo();

  // Initialize state from a prior execution (Continue-As-New) or fresh.
  let state: ReviewState = args._resumeState
    ? {
        ...args._resumeState,
        // Refresh runId and historyLength for the new execution
        temporal: {
          ...args._resumeState.temporal,
          runId: info.runId,
          historyLength: info.historyLength,
        },
      }
    : {
        status: 'running',
        prUrl: args.prUrl,
        context: args.context,
        specialists: {
          ironjaw: defaultSpecialistState(),
          barnacle: defaultSpecialistState(),
          greenhand: defaultSpecialistState(),
        },
        findings: [],
        windowOpen: false,
        secondsRemaining: 0,
        humanChallenges: {},
        synthesisStatus: 'pending',
        temporal: {
          workflowId: info.workflowId,
          runId: info.runId,
          taskQueue: info.taskQueue,
          historyLength: info.historyLength,
          startedAt: info.startTime.toISOString(),
          continueAsNewCount: 0,
          phaseTiming: {},
        },
      };

  // Deadline-based timer: tracks when the window expires so that extend
  // correctly adds 2 min to the *current* remaining time, not the original.
  let windowDeadlineMs = 0;

  wf.setHandler(getReviewState, () => ({
    ...state,
    secondsRemaining: state.windowOpen
      ? Math.max(0, Math.ceil((windowDeadlineMs - Date.now()) / 1000))
      : state.secondsRemaining,
  }));

  // Register Signal + Update handlers early so they're never missed.

  // Signal: extend window by 2 minutes (no-op if window not open)
  wf.setHandler(extendReviewWindow, () => {
    if (state.windowOpen) {
      windowDeadlineMs += 120_000;
    }
  });

  // Signal from child workflows: mutineer completed for a specific finding.
  // Updates parent state so the UI shows mutineer results in real time.
  wf.setHandler(reportMutineerResult, (findingId: string, challenge: string | null, verdict: 'agree' | 'disagree' | 'partial', failed?: boolean) => {
    state = {
      ...state,
      findings: state.findings.map((f) =>
        f.findingId === findingId
          ? { ...f, mutineerChallenge: challenge, mutineerVerdict: verdict, mutineerFailed: failed ?? false }
          : f
      ),
    };
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
    state = {
      ...state,
      temporal: refreshTemporal(state.temporal, {
        fetchStartedAt: new Date().toISOString(),
      }),
    };

    let prResult: PRDiffResult;
    try {
      prResult = await fetchGitHubPRDiff({
        prUrl: args.prUrl,
        context: args.context,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      state = { ...state, status: 'complete', fetchError: message };
      return state;
    }

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
      temporal: refreshTemporal(state.temporal, {
        specialistsStartedAt: new Date().toISOString(),
      }),
    };
  }

  const specialistArgs = { diff: state.diff!, context: args.context };

  // ── Step 2: Run specialists in parallel (skip if all done) ─────────────────
  const specialistsDone = () =>
    (['ironjaw', 'barnacle', 'greenhand'] as const).every((n) =>
      TERMINAL.has(state.specialists[n].status)
    );

  if (!specialistsDone()) {
    async function runSpecialist(
      name: 'ironjaw' | 'barnacle' | 'greenhand',
      run: () => Promise<SpecialistResult>,
    ): Promise<void> {
      state = {
        ...state,
        specialists: { ...state.specialists, [name]: { ...state.specialists[name], status: 'running' } },
      };
      try {
        const result = await run();
        state = {
          ...state,
          specialists: {
            ...state.specialists,
            [name]: { status: 'complete', partialOutput: result.rawText, findings: result.findings },
          },
        };
      } catch {
        state = {
          ...state,
          specialists: { ...state.specialists, [name]: { status: 'failed', findings: null } },
        };
      }
    }

    // Only dispatch specialists that are still in a non-terminal state.
    const tasks: Promise<void>[] = [];
    if (!TERMINAL.has(state.specialists.ironjaw.status))
      tasks.push(runSpecialist('ironjaw', () => runIronjaw(specialistArgs)));
    if (!TERMINAL.has(state.specialists.barnacle.status))
      tasks.push(runSpecialist('barnacle', () => runBarnacle(specialistArgs)));
    if (!TERMINAL.has(state.specialists.greenhand.status))
      tasks.push(runSpecialist('greenhand', () => runGreenhand(specialistArgs)));

    await Promise.all(tasks);
  }

  state = {
    ...state,
    temporal: refreshTemporal(state.temporal, {
      specialistsCompletedAt: new Date().toISOString(),
    }),
  };

  // ── Continue-As-New checkpoint 1 (post-specialists, before spawning children)
  if (wf.workflowInfo().historyLength > CAN_THRESHOLD) {
    state = {
      ...state,
      temporal: {
        ...state.temporal,
        continueAsNewCount: state.temporal.continueAsNewCount + 1,
      },
    };
    await wf.continueAsNew<typeof reviewWorkflow>({
      prUrl: args.prUrl,
      context: args.context,
      _resumeState: state,
    });
  }

  // ── Step 3: Spawn child workflows (one per finding) ────────────────────────
  // Flatten all findings from all specialists, limiting to top 2 per specialist
  const SEVERITY_RANK: Record<string, number> = { critical: 0, major: 1, minor: 2 };
  const MAX_FINDINGS_PER_SPECIALIST = 2;

  const allFindings: Array<{ specialist: string; finding: Finding }> = [];
  for (const [name, spec] of Object.entries(state.specialists)) {
    if (spec.findings && spec.findings.length > 0) {
      const sorted = [...spec.findings].sort(
        (a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9),
      );
      for (const f of sorted.slice(0, MAX_FINDINGS_PER_SPECIALIST)) {
        allFindings.push({ specialist: name, finding: f });
      }
    }
  }

  // Only spawn children if findings phase hasn't completed yet
  const findingsAlreadyDone = state.findings.length > 0 &&
    state.findings.every((f) => f.childStatus === 'complete' || f.childStatus === 'failed');

  if (allFindings.length > 0 && !findingsAlreadyDone) {
    const wfId = wf.workflowInfo().workflowId;

    // Initialize findings in state
    state = {
      ...state,
      findings: allFindings.map(({ specialist, finding }) => ({
        findingId: finding.id,
        specialist,
        severity: finding.severity,
        description: finding.description,
        recommendation: finding.recommendation,
        childWorkflowId: `${wfId}-${finding.id}`,
        childStatus: 'started',
      })),
      temporal: refreshTemporal(state.temporal, {
        findingsStartedAt: new Date().toISOString(),
      }),
    };

    // Spawn all child workflows
    let childHandles: Awaited<ReturnType<typeof wf.startChild>>[];
    try {
      childHandles = await Promise.all(
        allFindings.map(({ specialist, finding }) => {
          const childInput: FindingWorkflowInput = {
            findingId: finding.id,
            specialist,
            severity: finding.severity,
            description: finding.description,
            recommendation: finding.recommendation,
            diff: state.diff!,
            context: args.context,
            parentWorkflowId: wfId,
          };
          return wf.startChild(findingWorkflow, {
            workflowId: `${wfId}-${finding.id}`,
            args: [childInput],
          });
        })
      );
    } catch {
      // Mark all findings as failed if child spawning fails
      state = {
        ...state,
        findings: state.findings.map((f) => ({ ...f, childStatus: 'failed' as const })),
      };
      childHandles = [];
    }

    // ── Step 4: Human window (concurrent with child mutineer work) ─────────
    // Open the window if it hasn't been opened yet
    if (!state.windowOpen && state.secondsRemaining === 0) {
      windowDeadlineMs = Date.now() + 600_000;
      state = {
        ...state,
        windowOpen: true,
        secondsRemaining: 600,
      };
    }

    // Countdown — resolves when window closes or deadline passes
    const runWindow = async (): Promise<void> => {
      while (state.windowOpen && windowDeadlineMs > Date.now()) {
        const remainingMs = windowDeadlineMs - Date.now();
        const closed = await wf.condition(
          () => !state.windowOpen,
          remainingMs,
        );
        if (closed) break;
      }
      state = { ...state, windowOpen: false, secondsRemaining: 0 };
    };

    await runWindow();

    // ── Step 5: Signal all children with human input ─────────────────────
    for (let i = 0; i < childHandles.length; i++) {
      const findingId = allFindings[i].finding.id;
      const humanChallenge = state.humanChallenges[findingId] ?? null;
      await childHandles[i].signal(provideHumanInput, humanChallenge);
    }

    // ── Step 6: Await all children ──────────────────────────────────────
    const results = await Promise.all(
      childHandles.map(async (handle, i): Promise<FindingWorkflowResult | null> => {
        try {
          return await handle.result();
        } catch {
          // Mark as failed in state
          const findingId = allFindings[i].finding.id;
          state = {
            ...state,
            findings: state.findings.map((f) =>
              f.findingId === findingId
                ? { ...f, childStatus: 'failed' as const }
                : f
            ),
          };
          return null;
        }
      })
    );

    // Update state with child results
    for (const result of results) {
      if (!result) continue;
      state = {
        ...state,
        findings: state.findings.map((f) =>
          f.findingId === result.findingId
            ? {
                ...f,
                childStatus: 'complete' as const,
                mutineerChallenge: result.mutineerChallenge,
                mutineerVerdict: result.mutineerVerdict,
                humanChallenge: result.humanChallenge,
                ruling: result.ruling,
                reasoning: result.reasoning,
                arbiterMutineerStance: result.arbiterMutineerStance,
                arbiterHumanStance: result.arbiterHumanStance,
              }
            : f
        ),
      };
    }

    state = {
      ...state,
      temporal: refreshTemporal(state.temporal, {
        findingsCompletedAt: new Date().toISOString(),
      }),
    };
  } else if (allFindings.length === 0) {
    // No findings from specialists — skip to synthesis
    state = {
      ...state,
      findings: [],
    };
  }

  // ── Continue-As-New checkpoint 2 (post-children, before synthesis) ─────────
  if (wf.workflowInfo().historyLength > CAN_THRESHOLD) {
    state = {
      ...state,
      temporal: {
        ...state.temporal,
        continueAsNewCount: state.temporal.continueAsNewCount + 1,
      },
    };
    await wf.continueAsNew<typeof reviewWorkflow>({
      prUrl: args.prUrl,
      context: args.context,
      _resumeState: state,
    });
  }

  // ── Step 7: Synthesis ──────────────────────────────────────────────────────
  // Ensure all signal/update handlers have finished before reading final state
  await wf.condition(wf.allHandlersFinished);

  if (state.synthesisStatus !== 'complete' && state.synthesisStatus !== 'failed') {
    state = {
      ...state,
      synthesisStatus: 'running',
      temporal: refreshTemporal(state.temporal, {
        synthesisStartedAt: new Date().toISOString(),
      }),
    };

    // Build unified findings for synthesis
    const synthesisFindings = state.findings
      .filter((f) => f.childStatus === 'complete')
      .map((f) => ({
        findingId: f.findingId,
        specialist: f.specialist,
        severity: f.severity,
        description: f.description,
        recommendation: f.recommendation,
        mutineerChallenge: f.mutineerChallenge ?? null,
        humanChallenge: f.humanChallenge ?? null,
        ruling: f.ruling ?? ('accepted' as const),
        reasoning: f.reasoning ?? '',
      }));

    try {
      const verdictResult = await runSynthesis({
        findings: synthesisFindings,
      });
      state = {
        ...state,
        synthesisStatus: 'complete',
        verdict: verdictResult,
      };
    } catch {
      state = { ...state, synthesisStatus: 'failed' };
    }

    // ── Step 8: Write history record ────────────────────────────────────────
    const histInfo = wf.workflowInfo();
    try {
      await writeHistoryRecord({
        workflowId: histInfo.workflowId,
        prUrl: args.prUrl,
        prTitle: state.title ?? '',
        repoName: state.repoName ?? '',
        startedAt: histInfo.startTime.toISOString(),
        findings: synthesisFindings,
        verdict: state.verdict ?? { findings: [], summary: '' },
      });
    } catch {
      // Non-fatal: history write failure should not prevent workflow completion
    }
  }

  state = {
    ...state,
    status: 'complete',
    temporal: refreshTemporal(state.temporal, {
      completedAt: new Date().toISOString(),
    }),
  };
  return state;
}
