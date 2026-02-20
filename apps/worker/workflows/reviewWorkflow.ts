import * as wf from '@temporalio/workflow';
import type * as activities from '../activities/fetchGitHubPRDiff';

const { fetchGitHubPRDiff } = wf.proxyActivities<typeof activities>({
  startToCloseTimeout: '45s',
  heartbeatTimeout: '15s',
  retry: {
    maximumAttempts: 2,
    initialInterval: '1s',
  },
});

export interface ReviewState {
  status: 'running' | 'complete';
  prUrl: string;
  context?: string;
  title?: string;
  repoName?: string;
  prNumber?: number;
  diff?: string;
}

export const getReviewState = wf.defineQuery<ReviewState>('getReviewState');

export async function reviewWorkflow(args: {
  prUrl: string;
  context?: string;
}): Promise<ReviewState> {
  let state: ReviewState = {
    status: 'running',
    prUrl: args.prUrl,
    context: args.context,
  };

  wf.setHandler(getReviewState, () => state);

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
  };

  state = { ...state, status: 'complete' };
  return state;
}
