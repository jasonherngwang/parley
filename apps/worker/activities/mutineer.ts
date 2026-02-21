import { heartbeat } from '@temporalio/activity';
import { streamText, generateText, Output } from 'ai';
import { z } from 'zod';
import { geminiFlashLite } from '../../../lib/models';
import type { Finding } from './specialists';

const mutineerOutputSchema = z.object({
  challenges: z.array(
    z.object({
      findingId: z.string(),
      specialistName: z.string(),
      challengeText: z.string(),
    })
  ),
});

export type MutineerResult = z.infer<typeof mutineerOutputSchema>;
export type MutineerChallenge = MutineerResult['challenges'][number];

export async function runMutineer(args: {
  allFindings: Record<string, Finding[]>;
  capPerSpecialist: number;
}): Promise<MutineerResult> {
  const specialistsWithFindings = Object.entries(args.allFindings).filter(
    ([, findings]) => findings.length > 0
  );

  if (specialistsWithFindings.length === 0) {
    return { challenges: [] };
  }

  const findingsText = specialistsWithFindings
    .map(([name, findings]) => {
      const listed = findings
        .map((f) => `  - [${f.id}] (${f.severity}) ${f.description}`)
        .join('\n');
      return `${name.toUpperCase()}:\n${listed}`;
    })
    .join('\n\n');

  const systemPrompt = `Ye are THE MUTINEER. Ye argue the opposite on principle. Read all findings from the crew and challenge the ones ye deem hasty, overstated, or plain wrong.

For each specialist that has findings, challenge at least 1 but no more than ${args.capPerSpecialist} of their findings.
Write in first-person pirate voice — sharp, contrarian, unyielding.
For each challenge, reference the exact finding ID and give a focused opposing argument: name why the finding is wrong, overstated, or missing context.`;

  const userMessage = `Here are the findings from the crew:\n\n${findingsText}\n\nChallenge them. Minimum 1 per specialist that has findings, maximum ${args.capPerSpecialist} per specialist.`;

  const streamResult = streamText({
    model: geminiFlashLite,
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
    model: geminiFlashLite,
    system: `You are a JSON extractor. Given the following challenge output from THE MUTINEER, extract all challenges into the required schema. Each challenge must reference a valid finding ID from the crew's output.`,
    messages: [
      {
        role: 'user',
        content: `Extract challenges from this output:\n\n${accumulated}`,
      },
    ],
    experimental_output: Output.object({ schema: mutineerOutputSchema }),
  });

  return {
    challenges: structured?.challenges ?? [],
  };
}
