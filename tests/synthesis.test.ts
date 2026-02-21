import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('ai', () => {
  const mockOutput = {
    object: vi.fn().mockReturnValue({ type: 'object' }),
  };
  return {
    streamText: vi.fn(),
    generateText: vi.fn(),
    Output: mockOutput,
  };
});

vi.mock('../lib/models', () => ({
  geminiFlashLite: { modelId: 'mock-fast' },
  geminiPro: { modelId: 'mock-deep' },
}));

vi.mock('@temporalio/activity', () => ({
  heartbeat: vi.fn(),
}));

import { streamText, generateText } from 'ai';
import { heartbeat } from '@temporalio/activity';
import { runSynthesis } from '../apps/worker/activities/synthesis';
import type { Finding } from '../apps/worker/activities/specialists';

const FIXTURE_FINDINGS: Finding[] = [
  {
    id: 'ironjaw-1',
    severity: 'critical',
    description: 'SQL injection in login handler',
    recommendation: 'Use parameterized queries',
  },
  {
    id: 'barnacle-1',
    severity: 'major',
    description: 'Over-engineered abstraction layer',
    recommendation: 'Simplify to a single function',
  },
];

function makeAsyncIterable(chunks: string[]) {
  return (async function* () {
    for (const text of chunks) {
      yield { type: 'text-delta' as const, text };
    }
  })();
}

describe('runSynthesis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(streamText).mockReturnValue({
      fullStream: makeAsyncIterable(['Critical ', 'finding found.']) as unknown as ReturnType<typeof streamText>['fullStream'],
    } as ReturnType<typeof streamText>);
  });

  it('returns structured verdict when LLM succeeds', async () => {
    const expectedVerdict = {
      findings: [
        {
          severity: 'critical' as const,
          specialist: 'ironjaw',
          description: 'SQL injection in login handler',
          ruling: 'upheld' as const,
          challengeSources: ['mutineer'] as Array<'mutineer' | 'human'>,
          recommendation: 'Use parameterized queries',
        },
      ],
      summary: 'This PR has one critical security issue that must be addressed.',
    };

    vi.mocked(generateText).mockResolvedValue({
      experimental_output: expectedVerdict,
    } as Awaited<ReturnType<typeof generateText>>);

    const result = await runSynthesis({
      specialistOutputs: { ironjaw: FIXTURE_FINDINGS, barnacle: null },
      arbitrationOutcomes: [
        {
          findingId: 'ironjaw-1',
          challengeSources: ['mutineer'],
          ruling: 'upheld',
          reasoning: 'SQL injection is clearly present.',
        },
      ],
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe('critical');
    expect(result.summary).toContain('critical');
  });

  it('heartbeats with accumulated partial output during streaming', async () => {
    vi.mocked(generateText).mockResolvedValue({
      experimental_output: { findings: [], summary: 'All clear.' },
    } as Awaited<ReturnType<typeof generateText>>);

    await runSynthesis({
      specialistOutputs: { ironjaw: FIXTURE_FINDINGS },
      arbitrationOutcomes: [],
    });

    // Should have called heartbeat for each chunk + once before generateText
    expect(vi.mocked(heartbeat)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(heartbeat).mock.calls[0][0]).toEqual({
      partialOutput: 'Critical ',
    });
    expect(vi.mocked(heartbeat).mock.calls[1][0]).toEqual({
      partialOutput: 'Critical finding found.',
    });
    expect(vi.mocked(heartbeat).mock.calls[2][0]).toEqual({
      partialOutput: 'Critical finding found.',
      phase: 'extracting',
    });
  });

  it('falls back to empty verdict when structured output is null', async () => {
    vi.mocked(generateText).mockResolvedValue({
      experimental_output: null,
    } as Awaited<ReturnType<typeof generateText>>);

    const result = await runSynthesis({
      specialistOutputs: { ironjaw: FIXTURE_FINDINGS },
      arbitrationOutcomes: [],
    });

    expect(result.findings).toHaveLength(0);
    expect(result.summary).toBeTruthy();
  });

  it('includes arbitration outcomes in the user message', async () => {
    vi.mocked(generateText).mockResolvedValue({
      experimental_output: { findings: [], summary: 'Done.' },
    } as Awaited<ReturnType<typeof generateText>>);

    await runSynthesis({
      specialistOutputs: { ironjaw: FIXTURE_FINDINGS },
      arbitrationOutcomes: [
        {
          findingId: 'ironjaw-1',
          challengeSources: ['human'],
          ruling: 'overturned',
          reasoning: 'Context shows this is safe.',
        },
      ],
    });

    const streamCall = vi.mocked(streamText).mock.calls[0][0];
    const userMsg = (streamCall.messages as Array<{ role: string; content: string }>)[0].content;
    expect(userMsg).toContain('ironjaw-1');
    expect(userMsg).toContain('overturned');
  });

  it('marks specialists with no findings as "No findings" in the prompt', async () => {
    vi.mocked(generateText).mockResolvedValue({
      experimental_output: { findings: [], summary: 'Clean.' },
    } as Awaited<ReturnType<typeof generateText>>);

    await runSynthesis({
      specialistOutputs: { ironjaw: [], barnacle: null, greenhand: [] },
      arbitrationOutcomes: [],
    });

    const streamCall = vi.mocked(streamText).mock.calls[0][0];
    const userMsg = (streamCall.messages as Array<{ role: string; content: string }>)[0].content;
    expect(userMsg).toContain('No findings');
  });

  it('uses geminiPro model for streaming', async () => {
    vi.mocked(generateText).mockResolvedValue({
      experimental_output: { findings: [], summary: 'Done.' },
    } as Awaited<ReturnType<typeof generateText>>);

    await runSynthesis({
      specialistOutputs: { ironjaw: FIXTURE_FINDINGS },
      arbitrationOutcomes: [],
    });

    const streamCall = vi.mocked(streamText).mock.calls[0][0];
    expect((streamCall.model as { modelId: string }).modelId).toBe('mock-deep');
  });

  it('uses geminiPro model for structured extraction', async () => {
    vi.mocked(generateText).mockResolvedValue({
      experimental_output: { findings: [], summary: 'Done.' },
    } as Awaited<ReturnType<typeof generateText>>);

    await runSynthesis({
      specialistOutputs: { ironjaw: FIXTURE_FINDINGS },
      arbitrationOutcomes: [],
    });

    const genCall = vi.mocked(generateText).mock.calls[0][0];
    expect((genCall.model as { modelId: string }).modelId).toBe('mock-deep');
  });
});
