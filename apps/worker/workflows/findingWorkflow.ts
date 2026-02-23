import * as wf from '@temporalio/workflow';
import type * as mutineerActivities from '../activities/mutineer';
import type * as arbitratorActivities from '../activities/arbitrator';

const { runMutineerForFinding } = wf.proxyActivities<typeof mutineerActivities>({
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

export interface FindingWorkflowInput {
  findingId: string;
  specialist: string;
  severity: 'critical' | 'major' | 'minor';
  description: string;
  recommendation: string;
  diff: string;
  context?: string;
  parentWorkflowId: string;
}

export type MutineerVerdict = 'agree' | 'disagree' | 'partial';

export type ArbiterStance = 'agrees' | 'disagrees' | 'mixed';

export interface FindingWorkflowResult {
  findingId: string;
  specialist: string;
  severity: 'critical' | 'major' | 'minor';
  description: string;
  recommendation: string;
  mutineerChallenge: string | null;
  mutineerVerdict: MutineerVerdict;
  humanChallenge: string | null;
  ruling: 'upheld' | 'overturned' | 'accepted';
  reasoning: string;
  arbiterMutineerStance?: ArbiterStance;
  arbiterHumanStance?: ArbiterStance;
}

export const provideHumanInput = wf.defineSignal<[string | null]>('provideHumanInput');

// Defined here so the child can import it; registered by the parent workflow.
export const reportMutineerResult = wf.defineSignal<[string, string | null, MutineerVerdict, boolean?]>('reportMutineerResult');

export type FindingPhase = 'mutineering' | 'waiting' | 'arbitrating' | 'done';
export interface FindingState {
  phase: FindingPhase;
}
export const getFindingState = wf.defineQuery<FindingState>('getFindingState');

export async function findingWorkflow(input: FindingWorkflowInput): Promise<FindingWorkflowResult> {
  let humanInput: string | null = null;
  let humanInputReceived = false;
  let mutineerChallenge: string | null = null;
  let mutineerVerdict: MutineerVerdict = 'agree';
  let phase: FindingPhase = 'mutineering';

  // Register handlers before any await
  wf.setHandler(getFindingState, () => ({ phase }));
  wf.setHandler(provideHumanInput, (challenge: string | null) => {
    humanInput = challenge;
    humanInputReceived = true;
  });

  // Step 1: Run mutineer for this finding
  let mutineerFailed = false;
  try {
    const mutineerResult = await runMutineerForFinding({
      finding: {
        id: input.findingId,
        specialist: input.specialist,
        severity: input.severity,
        description: input.description,
        recommendation: input.recommendation,
      },
      diff: input.diff,
      context: input.context,
    });
    mutineerChallenge = mutineerResult.challenged ? mutineerResult.challengeText : null;
    mutineerVerdict = mutineerResult.verdict;
  } catch {
    // Mutineer failure is non-fatal — treat as no challenge
    mutineerChallenge = null;
    mutineerVerdict = 'agree';
    mutineerFailed = true;
  }

  // Signal parent with mutineer result so the UI updates immediately
  try {
    const parentHandle = wf.getExternalWorkflowHandle(input.parentWorkflowId);
    await parentHandle.signal(reportMutineerResult, input.findingId, mutineerChallenge, mutineerVerdict, mutineerFailed);
  } catch {
    // Non-fatal: parent might have moved on via Continue-As-New
  }

  // Step 2: Wait for human input signal from parent
  phase = 'waiting';
  await wf.condition(() => humanInputReceived);

  const humanChallenge = (humanInput as string | null)?.trim() || null;

  // Step 3: Arbitrate if challenged
  if (mutineerChallenge || humanChallenge) {
    phase = 'arbitrating';
    try {
      const decision = await runArbitrator({
        finding: {
          id: input.findingId,
          severity: input.severity,
          description: input.description,
          recommendation: input.recommendation,
        },
        diff: input.diff,
        mutineerChallenge: mutineerChallenge ?? undefined,
        humanChallenge: humanChallenge ?? undefined,
      });
      phase = 'done';
      return {
        findingId: input.findingId,
        specialist: input.specialist,
        severity: input.severity,
        description: input.description,
        recommendation: input.recommendation,
        mutineerChallenge,
        mutineerVerdict,
        humanChallenge,
        ruling: decision.ruling,
        reasoning: decision.reasoning,
        arbiterMutineerStance: decision.mutineerStance,
        arbiterHumanStance: decision.humanStance,
      };
    } catch {
      phase = 'done';
      return {
        findingId: input.findingId,
        specialist: input.specialist,
        severity: input.severity,
        description: input.description,
        recommendation: input.recommendation,
        mutineerChallenge,
        mutineerVerdict,
        humanChallenge,
        ruling: 'upheld',
        reasoning: 'Arbitrator unavailable; original finding stands.',
      };
    }
  }

  // No challenges — finding accepted
  phase = 'done';
  return {
    findingId: input.findingId,
    specialist: input.specialist,
    severity: input.severity,
    description: input.description,
    recommendation: input.recommendation,
    mutineerChallenge: null,
    mutineerVerdict: 'agree',
    humanChallenge: null,
    ruling: 'accepted',
    reasoning: 'No challenges filed.',
  };
}
