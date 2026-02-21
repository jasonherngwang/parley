import { insertReview } from '../../../lib/db';
import type { SynthesisVerdict, ArbitrationOutcome } from './synthesis';
import type { Finding } from './specialists';

export interface WriteHistoryArgs {
  workflowId: string;
  prUrl: string;
  prTitle: string;
  repoName: string;
  startedAt: string;
  specialistOutputs: Record<string, Finding[] | null>;
  disputeOutcomes: ArbitrationOutcome[];
  verdict: SynthesisVerdict;
}

export async function writeHistoryRecord(args: WriteHistoryArgs): Promise<void> {
  insertReview({
    workflowId: args.workflowId,
    prUrl: args.prUrl,
    prTitle: args.prTitle,
    repoName: args.repoName,
    startedAt: args.startedAt,
    completedAt: new Date().toISOString(),
    specialistOutputs: args.specialistOutputs,
    disputeOutcomes: args.disputeOutcomes,
    verdict: args.verdict,
  });
}
