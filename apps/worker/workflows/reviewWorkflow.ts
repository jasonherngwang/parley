import * as wf from '@temporalio/workflow';
import type * as activities from '../activities/mock';

const { echoActivity } = wf.proxyActivities<typeof activities>({
  startToCloseTimeout: '10s',
});

export interface ReviewState {
  status: 'running' | 'complete';
  input: string;
}

export const getReviewState = wf.defineQuery<ReviewState>('getReviewState');

export async function reviewWorkflow(args: { input: string }): Promise<ReviewState> {
  let state: ReviewState = { status: 'running', input: args.input };

  wf.setHandler(getReviewState, () => state);

  await echoActivity(args.input);
  await wf.sleep('2s');

  state = { ...state, status: 'complete' };
  return state;
}
