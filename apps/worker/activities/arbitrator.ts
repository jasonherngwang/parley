import { generateText, Output } from 'ai';
import { z } from 'zod';
import { geminiFlashLite } from '../../../lib/models';
import type { Finding } from './specialists';

export type ArbiterStance = 'agrees' | 'disagrees' | 'mixed';

const arbitrationSchema = z.object({
  ruling: z.enum(['upheld', 'overturned']),
  reasoning: z.string().describe('2-4 sentences explaining the ruling, in pirate speak'),
  mutineerStance: z.enum(['agrees', 'disagrees', 'mixed']).optional().describe('REQUIRED if mutineer challenged. Your stance on the mutineer argument.'),
  humanStance: z.enum(['agrees', 'disagrees', 'mixed']).optional().describe('REQUIRED if human challenged. Your stance on the human argument.'),
});

export type ArbitrationDecision = z.infer<typeof arbitrationSchema>;

export async function runArbitrator(args: {
  finding: Finding;
  diff: string;
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
    system: `Ye ARE THE ARBITER — speak ONLY in pirate dialect, always. Every word must sound like it came from a sea-worn magistrate's ledger: "aye", "ye", "matey", "ruling", "quarter", "starboard", "plunder", "verdict", "scupper", "hull", "fathom", and so forth. Never slip into plain English — not even for technical terms. Name the variable or function, then couch it in pirate speak.
Ye be the ship's judge. Ye weigh disputed findings with fairness and precision. Ye have access to the original diff — use it. Look at the actual code before ruling.
Rule "upheld" if the original finding be valid despite the challenge(s).
Rule "overturned" if the challenge(s) reveal the finding be wrong, overstated, or inapplicable.
Provide 2-4 sentences of reasoning grounded in what the code actually shows.
IMPORTANT: For EVERY challenger present, ye MUST include yer stance toward their argument. If the mutineer challenged, set mutineerStance. If a human challenged, set humanStance. Use "agrees" if ye side with them, "disagrees" if ye side against them, "mixed" if partly right. Do not omit either stance when the challenger is present.`,
    messages: [
      {
        role: 'user',
        content: `Finding [${args.finding.id}] (${args.finding.severity}): ${args.finding.description}
Recommendation: ${args.finding.recommendation}

${challengeParts.join('\n')}

Relevant diff:
\`\`\`diff
${args.diff.slice(0, 6000)}
\`\`\`

Rule on this finding.`,
      },
    ],
    experimental_output: Output.object({ schema: arbitrationSchema }),
  });

  const result = structured ?? {
    ruling: 'upheld' as const,
    reasoning: 'Arbitrator could not reach a determination; original finding stands.',
  };

  // Default stances when the LLM omits them despite a challenger being present
  return {
    ...result,
    mutineerStance: result.mutineerStance ?? (args.mutineerChallenge ? 'mixed' : undefined),
    humanStance: result.humanStance ?? (args.humanChallenge ? 'mixed' : undefined),
  };
}
