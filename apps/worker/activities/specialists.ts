import { heartbeat } from '@temporalio/activity';
import { streamText, generateText, Output } from 'ai';
import { z } from 'zod';
import { geminiFlashLite } from '../../../lib/models';

export const findingSchema = z.object({
  findings: z.array(
    z.object({
      id: z.string(),
      severity: z.enum(['critical', 'major', 'minor']),
      description: z.string(),
      lineReference: z.number().optional(),
      recommendation: z.string(),
    })
  ),
});

export type Finding = z.infer<typeof findingSchema>['findings'][number];

export interface SpecialistResult {
  findings: Finding[];
  rawText: string;
}

async function runSpecialist(
  args: { diff: string; context?: string },
  persona: string,
  systemPrompt: string
): Promise<SpecialistResult> {
  const userMessage = [
    `Here is the PR diff to review:\n\n\`\`\`diff\n${args.diff}\n\`\`\``,
    args.context ? `\nSubmitter context: ${args.context}` : '',
  ].join('');

  // Stream for live token heartbeating
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

  // Extract structured findings
  const { experimental_output: structured } = await generateText({
    model: geminiFlashLite,
    system: `You are a JSON extractor. Given the following code review output from ${persona}, extract all findings into the required schema. Keep descriptions and recommendations concise.`,
    messages: [
      {
        role: 'user',
        content: `Extract findings from this review:\n\n${accumulated}`,
      },
    ],
    experimental_output: Output.object({ schema: findingSchema }),
  });

  return {
    findings: structured?.findings ?? [],
    rawText: accumulated,
  };
}

export async function runIronjaw(args: {
  diff: string;
  context?: string;
}): Promise<SpecialistResult> {
  return runSpecialist(
    args,
    'IRONJAW',
    `Ye are IRONJAW, the ship's paranoid security auditor. Write yer review as first-person ship's log entries.
Ye have a nose for rot in the hull — injection flaws, broken auth, secrets exposed to the wind, unsafe deserialization, privilege escalation, and every manner of treachery the enemy might exploit.
Give findings unique IDs starting with "ironjaw-1", "ironjaw-2", etc.
Be specific: name the line, name the threat, name what must be done.`
  );
}

export async function runBarnacle(args: {
  diff: string;
  context?: string;
}): Promise<SpecialistResult> {
  return runSpecialist(
    args,
    'BARNACLE',
    `Ye are BARNACLE, the ship's greybeard complexity skeptic — twenty years at sea and ye've seen this pattern sink ships before. Write yer review as first-person ship's log entries.
Ye have an eye for over-engineering, hidden complexity, tangled dependencies, premature abstractions, and logic that'll be unmaintainable in six months. Ye've seen clever code kill crews.
Give findings unique IDs starting with "barnacle-1", "barnacle-2", etc.
Be direct: name the smell, name the risk, name the simpler course.`
  );
}

export async function runGreenhand(args: {
  diff: string;
  context?: string;
}): Promise<SpecialistResult> {
  return runSpecialist(
    args,
    'GREENHAND',
    `Ye are GREENHAND, an enthusiastic junior on yer first voyage. Write yer review as first-person ship's log entries.
Ye read code literally and ask the obvious questions the veterans overlook: missing null checks, unhandled errors, unclear variable names, missing tests, and logic that doesn't match the comments.
Give findings unique IDs starting with "greenhand-1", "greenhand-2", etc.
Be earnest: name what confused ye, name what might break, name what would help ye understand.`
  );
}
