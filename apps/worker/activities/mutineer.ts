import { heartbeat } from '@temporalio/activity';
import { streamText, generateText, Output } from 'ai';
import { z } from 'zod';
import { geminiFlashLite } from '../../../lib/models';
export interface MutineerForFindingInput {
  finding: {
    id: string;
    specialist: string;
    severity: 'critical' | 'major' | 'minor';
    description: string;
    recommendation: string;
  };
  diff: string;
  context?: string;
}

export type MutineerVerdict = 'agree' | 'disagree' | 'partial';

export interface MutineerForFindingResult {
  challenged: boolean;
  challengeText: string | null;
  verdict: MutineerVerdict;
}

export async function runMutineerForFinding(
  args: MutineerForFindingInput
): Promise<MutineerForFindingResult> {
  const { finding, diff } = args;

  const systemPrompt = `Ye ARE THE MUTINEER — speak ONLY in pirate dialect, always. Every word must sound like it came from a mutinous buccaneer's log: "aye", "ye", "matey", "bilge", "scoundrel", "plunder", "treachery", "mainsail", "helm", "fathom", and so forth. Never slip into plain English — not even for technical terms. Name the variable, then frame it in pirate speak.
Ye have one job: scrutinise this finding against the actual code. Point to specific evidence in the diff — does the code support this finding, or does it contradict it? If the code clearly supports the finding, concede. If the finding is overstated, wrong, or missing context that the diff reveals — challenge it with that evidence. Be sharp and grounded in what ye actually see.`;

  const userMessage = `Finding [${finding.id}] (${finding.severity}): ${finding.description}
Recommendation: ${finding.recommendation}

Diff to examine:
\`\`\`diff
${diff.slice(0, 4000)}
\`\`\`
${args.context ? `\nSubmitter context: ${args.context}` : ''}

Look at the diff. Does the code actually support this finding? Challenge or concede based on what ye see.`;

  const streamResult = streamText({
    model: geminiFlashLite,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  let accumulated = '';
  for await (const part of streamResult.fullStream) {
    if (part.type === 'text-delta') {
      accumulated += part.text;
      heartbeat();
    }
  }

  const singleChallengeSchema = z.object({
    challenged: z.boolean(),
    challengeText: z.string().nullable().describe('2-4 sentences in pirate voice preserving the original tone'),
    verdict: z.enum(['agree', 'disagree', 'partial']),
  });

  const { experimental_output: structured } = await generateText({
    model: geminiFlashLite,
    system: `You are a JSON extractor. Given the following output from THE MUTINEER about a single finding, extract into the required schema.
- "challenged": true if the mutineer pushed back on the finding, false if they conceded.
- "challengeText": the mutineer's core argument in 2-4 sentences. Preserve the original pirate voice and tone. Null if conceded.
- "verdict": "agree" if the mutineer fully concedes, "disagree" if they fundamentally reject the finding, "partial" if they acknowledge some merit but raise concerns.`,
    messages: [
      {
        role: 'user',
        content: `Extract from this output:\n\n${accumulated}`,
      },
    ],
    experimental_output: Output.object({ schema: singleChallengeSchema }),
  });

  const verdict = structured?.verdict ?? (structured?.challenged ? 'disagree' : 'agree');

  return {
    challenged: structured?.challenged ?? false,
    challengeText: structured?.challengeText ?? null,
    verdict,
  };
}

