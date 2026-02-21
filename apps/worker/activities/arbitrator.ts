import { generateText, Output } from 'ai';
import { z } from 'zod';
import { geminiFlashLite } from '../../../lib/models';
import type { Finding } from './specialists';

const arbitrationSchema = z.object({
  ruling: z.enum(['upheld', 'overturned']),
  reasoning: z.string(),
});

export type ArbitrationDecision = z.infer<typeof arbitrationSchema>;

export async function runArbitrator(args: {
  finding: Finding;
  mutineerChallenge?: string;
  humanChallenge?: string;
}): Promise<ArbitrationDecision> {
  const challengeParts: string[] = [];
  if (args.mutineerChallenge) {
    challengeParts.push(`THE MUTINEER challenges: "${args.mutineerChallenge}"`);
  }
  if (args.humanChallenge) {
    challengeParts.push(`Human reviewer challenges: "${args.humanChallenge}"`);
  }

  const { experimental_output: structured } = await generateText({
    model: geminiFlashLite,
    system: `You are a neutral Arbitrator ruling on a challenged code review finding.
Rule "upheld" if the original finding is valid despite the challenge(s).
Rule "overturned" if the challenge(s) reveal the finding is wrong, overstated, or inapplicable.
Provide exactly 2-3 sentences of reasoning. Be fair, precise, and decisive.`,
    messages: [
      {
        role: 'user',
        content: `Finding [${args.finding.id}] (${args.finding.severity}): ${args.finding.description}
Recommendation: ${args.finding.recommendation}

${challengeParts.join('\n')}

Rule on this finding.`,
      },
    ],
    experimental_output: Output.object({ schema: arbitrationSchema }),
  });

  return structured ?? {
    ruling: 'upheld',
    reasoning: 'Arbitrator could not reach a determination; original finding stands.',
  };
}
