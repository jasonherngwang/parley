import * as wf from '@temporalio/workflow';
import type * as fetchActivities from '../activities/fetchGitHubPRDiff';
import type * as specialistActivities from '../activities/specialists';
import type { Finding, SpecialistResult } from '../activities/specialists';

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

export type SpecialistStatus =
  | 'pending'
  | 'running'
  | 'complete'
  | 'timed-out'
  | 'failed';

export interface SpecialistState {
  status: SpecialistStatus;
  attemptNumber: number;
  partialOutput?: string;
  findings: Finding[] | null;
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
}

export const getReviewState = wf.defineQuery<ReviewState>('getReviewState');

const defaultSpecialistState = (): SpecialistState => ({
  status: 'pending',
  attemptNumber: 0,
  findings: null,
});

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
  };

  wf.setHandler(getReviewState, () => state);

  // Step 1: Fetch PR diff
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

  // Step 2: Run all three specialists in parallel with individual timeouts
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

  state = { ...state, status: 'complete' };
  return state;
}
