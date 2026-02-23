import { insertReview } from '../../../lib/db';
import type { SynthesisVerdict, ArbitrationOutcome, FindingInput } from './synthesis';
import type { Finding } from './specialists';

export interface WriteHistoryArgs {
  workflowId: string;
  prUrl: string;
  prTitle: string;
  repoName: string;
  startedAt: string;
  findings?: FindingInput[];
  // Legacy shape — kept for backward compatibility
  specialistOutputs?: Record<string, Finding[] | null>;
  disputeOutcomes?: ArbitrationOutcome[];
  verdict: SynthesisVerdict;
}

export async function writeHistoryRecord(args: WriteHistoryArgs): Promise<void> {
  // Convert unified findings to legacy shape for DB storage
  let specialistOutputs: Record<string, Finding[] | null>;
  let disputeOutcomes: ArbitrationOutcome[];

  if (args.findings) {
    const bySpecialist = new Map<string, Finding[]>();
    for (const f of args.findings) {
      const list = bySpecialist.get(f.specialist) ?? [];
      list.push({
        id: f.findingId,
        severity: f.severity as 'critical' | 'major' | 'minor',
        description: f.description,
        recommendation: f.recommendation,
      });
      bySpecialist.set(f.specialist, list);
    }
    specialistOutputs = Object.fromEntries(bySpecialist);

    disputeOutcomes = args.findings
      .filter((f) => f.ruling !== 'accepted')
      .map((f) => {
        const sources: string[] = [];
        if (f.mutineerChallenge) sources.push('mutineer');
        if (f.humanChallenge) sources.push('human');
        return {
          findingId: f.findingId,
          challengeSources: sources,
          ruling: f.ruling,
          reasoning: f.reasoning,
        };
      });
  } else {
    specialistOutputs = args.specialistOutputs ?? {};
    disputeOutcomes = args.disputeOutcomes ?? [];
  }

  insertReview({
    workflowId: args.workflowId,
    prUrl: args.prUrl,
    prTitle: args.prTitle,
    repoName: args.repoName,
    startedAt: args.startedAt,
    completedAt: new Date().toISOString(),
    specialistOutputs,
    disputeOutcomes,
    verdict: args.verdict,
  });
}
