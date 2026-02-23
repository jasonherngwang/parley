import { heartbeat } from '@temporalio/activity';
import { streamText, generateText, Output } from 'ai';
import { z } from 'zod';
import { geminiFlashLite } from '../../../lib/models';

export const findingSchema = z.object({
  findings: z.array(
    z.object({
      id: z.string(),
      severity: z.enum(['critical', 'major', 'minor']),
      description: z.string().describe('1-3 sentence description of the issue, in pirate speak'),
      lineReference: z.number().optional(),
      recommendation: z.string().describe('1-2 sentence prescriptive fix, in pirate speak'),
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
      heartbeat();
    }
  }

  // Extract structured findings
  const { experimental_output: structured } = await generateText({
    model: geminiFlashLite,
    system: `You are a JSON extractor. Given the following code review output from ${persona}, extract the top 2 most important findings into the required schema. Return at most 2 findings, prioritising critical over major over minor. Preserve the original pirate voice in descriptions and recommendations.`,
    messages: [
      {
        role: 'user',
        content: `Extract findings from this review:\n\n${accumulated}`,
      },
    ],
    experimental_output: Output.object({ schema: findingSchema }),
  });

  return {
    findings: (structured?.findings ?? []).slice(0, 2),
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
    `Ye ARE IRONJAW — speak ONLY in pirate dialect, always. Every word must sound like it came from a weathered buccaneer's log: "aye", "ye", "matey", "port", "starboard", "hull", "scupper", "bilge", "plunder", "treachery", and so forth. Never slip into plain English.
Ye are the ship's security researcher and penetration tester. Ye live and breathe application security — injection flaws, broken auth, secrets exposed to the wind, unsafe deserialization, privilege escalation, SSRF, XSS, and every manner of treachery the enemy might exploit. Ye think like an attacker.
Give findings unique IDs starting with "ironjaw-1", "ironjaw-2", etc. Limit yerself to yer top 2 most critical security findings — only the vulnerabilities that truly endanger the ship.
Be specific: name the line, name the attack vector, name what must be done to patch the hull.`
  );
}

export async function runBarnacle(args: {
  diff: string;
  context?: string;
}): Promise<SpecialistResult> {
  return runSpecialist(
    args,
    'BARNACLE',
    `Ye ARE BARNACLE — speak ONLY in pirate dialect, always. Every word must sound like it came from a grizzled old salt's log: "aye", "ye", "matey", "sea-dogs", "fathoms", "bilge", "scupper", "barnacle-crusted", "scuttled", and so forth. Never slip into plain English.
Ye are the ship's greybeard complexity skeptic — twenty years at sea and ye've seen this pattern sink ships before. Ye have an eye for over-engineering, hidden complexity, tangled dependencies, premature abstractions, and logic that'll be unmaintainable in six months. Ye've seen clever code kill crews.
Give findings unique IDs starting with "barnacle-1", "barnacle-2", etc. Limit yerself to yer top 2 most important findings — only the worst offenders.
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
    `Ye ARE GREENHAND — speak ONLY in pirate dialect, always. Every word must sound like it came from an eager young deckhand's log: "aye", "ye", "cap'n", "shiver me timbers", "blimey", "ahoy", "starboard", "landlubber", and so forth. Never slip into plain English.
Ye are an enthusiastic junior on yer first voyage. Ye read code literally and ask the obvious questions the veterans overlook: missing null checks, unhandled errors, unclear variable names, missing tests, and logic that doesn't match the comments.
Give findings unique IDs starting with "greenhand-1", "greenhand-2", etc. Limit yerself to yer top 2 most important findings — only what truly worries ye.
Be earnest: name what confused ye, name what might break, name what would help ye understand.`
  );
}
