import { heartbeat } from '@temporalio/activity';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { geminiPro } from '../../../lib/models';
import type { Finding } from './specialists';

const synthesisSchema = z.object({
  findings: z.array(
    z.object({
      severity: z.enum(['critical', 'major', 'minor']),
      specialist: z.string(),
      ruling: z.enum(['upheld', 'overturned', 'accepted']).describe('The arbiter\'s ruling: "accepted" if unchallenged, "upheld" if challenged and the original finding was sustained, "overturned" if the challenge succeeded'),
      finding: z.string().describe('1-2 sentence recap of what the specialist originally found, in pirate speak'),
      recommendation: z.string().describe('For upheld/accepted findings: prescriptive action to fix the issue. For overturned findings: a brief note that the arbiter dismissed this finding and why — do NOT recommend a fix'),
    })
  ),
  summary: z.string().describe('2-4 sentence overall risk assessment, in pirate speak'),
});

export type SynthesisVerdict = z.infer<typeof synthesisSchema>;

export interface ArbitrationOutcome {
  findingId: string;
  challengeSources: string[];
  ruling: string;
  reasoning: string;
}

export interface FindingInput {
  findingId: string;
  specialist: string;
  severity: string;
  description: string;
  recommendation: string;
  mutineerChallenge: string | null;
  humanChallenge: string | null;
  ruling: 'upheld' | 'overturned' | 'accepted';
  reasoning: string;
}

export async function runSynthesis(args: {
  findings?: FindingInput[];
  // Legacy shape — kept for backward compatibility during transition
  specialistOutputs?: Record<string, Finding[] | null>;
  arbitrationOutcomes?: ArbitrationOutcome[];
}): Promise<SynthesisVerdict> {
  const specialistLines: string[] = [];
  let arbitrationLines: string;

  if (args.findings) {
    // New unified findings shape
    const bySpecialist = new Map<string, FindingInput[]>();
    for (const f of args.findings) {
      const list = bySpecialist.get(f.specialist) ?? [];
      list.push(f);
      bySpecialist.set(f.specialist, list);
    }
    for (const [name, findings] of bySpecialist) {
      const listed = findings
        .map(
          (f) =>
            `  - [${f.findingId}] (${f.severity}) ${f.description} → ${f.recommendation}`
        )
        .join('\n');
      specialistLines.push(`${name.toUpperCase()}:\n${listed}`);
    }

    const disputed = args.findings.filter((f) => f.ruling !== 'accepted');
    arbitrationLines =
      disputed.length === 0
        ? 'No disputes were arbitrated.'
        : disputed
            .map((f) => {
              const sources: string[] = [];
              if (f.mutineerChallenge) sources.push('mutineer');
              if (f.humanChallenge) sources.push('human');
              return `  - [${f.findingId}] ruling=${f.ruling} (challenged by: ${sources.join(', ')}) — ${f.reasoning}`;
            })
            .join('\n');
  } else {
    // Legacy shape
    for (const [name, findings] of Object.entries(args.specialistOutputs ?? {})) {
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

    const outcomes = args.arbitrationOutcomes ?? [];
    arbitrationLines =
      outcomes.length === 0
        ? 'No disputes were arbitrated.'
        : outcomes
            .map(
              (a) =>
                `  - [${a.findingId}] ruling=${a.ruling} (challenged by: ${a.challengeSources.join(', ')}) — ${a.reasoning}`
            )
            .join('\n');
  }

  const findingCount = args.findings?.length ?? Object.values(args.specialistOutputs ?? {}).reduce((n, f) => n + (f?.length ?? 0), 0);

  const systemPrompt = `Ye ARE THE QUARTERMASTER — speak ONLY in pirate dialect, always. Every word must sound like it came from the ship's master logkeeper: "aye", "ye", "matey", "seaworthy", "hull", "voyage", "bilge", "quarters", "plunder", "scupper", "fathom", and so forth. Never slip into plain English — not even for technical terms. Name the variable or file, then frame it in pirate speak.
Ye record all specialist findings and arbitration outcomes faithfully — ye do NOT form yer own opinions on the merits.
For each of the ${findingCount} findings:
  - "ruling": copy it exactly from the arbitration record — "accepted" (unchallenged), "upheld" (challenged, original finding sustained), or "overturned" (challenge succeeded, finding dismissed). NEVER change a ruling.
  - "finding": a concise recap of what the specialist originally flagged. Start with what is wrong.
  - "recommendation":
      • If ruling is "upheld" or "accepted": a clear, prescriptive action the developer must take to fix it.
      • If ruling is "overturned": state only that the arbiter dismissed this finding and briefly why — do NOT recommend any fix.
  - "severity": copy from the original finding.
  - "specialist": copy the specialist name.
  - Include ALL ${findingCount} findings regardless of ruling — do not merge or skip any.
Write a concise summary paragraph (2-4 sentences) covering the overall risk picture — count only upheld/accepted findings as actionable.`;

  const userMessage = `Specialist findings:\n\n${specialistLines.join('\n\n')}\n\nArbitration outcomes:\n${arbitrationLines}\n\nProduce the final verdict.`;

  heartbeat();

  const { experimental_output: structured } = await generateText({
    model: geminiPro,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
    experimental_output: Output.object({ schema: synthesisSchema }),
  });

  return structured ?? { findings: [], summary: 'Synthesis could not produce a structured verdict.' };
}
