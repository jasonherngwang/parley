import { heartbeat } from '@temporalio/activity';
import { streamText, generateText, Output } from 'ai';
import { z } from 'zod';
import { geminiPro } from '../../../lib/models';
import type { Finding } from './specialists';

const synthesisSchema = z.object({
  findings: z.array(
    z.object({
      severity: z.enum(['critical', 'major', 'minor']),
      specialist: z.string(),
      description: z.string(),
      ruling: z.enum(['upheld', 'overturned', 'inconclusive']).optional(),
      challengeSources: z.array(z.enum(['mutineer', 'human'])).optional(),
      recommendation: z.string(),
    })
  ),
  summary: z.string(),
});

export type SynthesisVerdict = z.infer<typeof synthesisSchema>;

export interface ArbitrationOutcome {
  findingId: string;
  challengeSources: string[];
  ruling: string;
  reasoning: string;
}

export async function runSynthesis(args: {
  specialistOutputs: Record<string, Finding[] | null>;
  arbitrationOutcomes: ArbitrationOutcome[];
}): Promise<SynthesisVerdict> {
  const specialistLines: string[] = [];
  for (const [name, findings] of Object.entries(args.specialistOutputs)) {
    if (!findings || findings.length === 0) {
      specialistLines.push(`${name.toUpperCase()}: No findings.`);
      continue;
    }
    const listed = findings
      .map(
        (f) =>
          `  - [${f.id}] (${f.severity}) ${f.description} → ${f.recommendation}`
      )
      .join('\n');
    specialistLines.push(`${name.toUpperCase()}:\n${listed}`);
  }

  const arbitrationLines =
    args.arbitrationOutcomes.length === 0
      ? 'No disputes were arbitrated.'
      : args.arbitrationOutcomes
          .map(
            (a) =>
              `  - [${a.findingId}] ruling=${a.ruling} (challenged by: ${a.challengeSources.join(', ')}) — ${a.reasoning}`
          )
          .join('\n');

  const systemPrompt = `You are the Synthesis agent. You reconcile all specialist findings and arbitration outcomes into a final structured verdict.
For each finding, assign the correct severity, note which specialist raised it, carry through the ruling if it was arbitrated, and provide a clear recommendation.
Write a concise summary paragraph (2-4 sentences) at the end that captures the overall risk picture of this PR.
Be thorough but precise.`;

  const userMessage = `Specialist findings:\n\n${specialistLines.join('\n\n')}\n\nArbitration outcomes:\n${arbitrationLines}\n\nProduce the final verdict.`;

  const streamResult = streamText({
    model: geminiPro,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  let accumulated = '';
  for await (const part of streamResult.fullStream) {
    if (part.type === 'text-delta') {
      accumulated += part.text;
      heartbeat({ partialOutput: accumulated });
    }
  }

  const { experimental_output: structured } = await generateText({
    model: geminiPro,
    system: `You are a JSON extractor. Given the following synthesis output, extract all findings and the summary into the required schema. Preserve severity, specialist attribution, ruling, challengeSources, and recommendation faithfully.`,
    messages: [
      {
        role: 'user',
        content: `Extract the verdict from this synthesis:\n\n${accumulated}`,
      },
    ],
    experimental_output: Output.object({ schema: synthesisSchema }),
  });

  return structured ?? { findings: [], summary: 'Synthesis could not produce a structured verdict.' };
}
