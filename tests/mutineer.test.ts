import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@temporalio/activity', () => ({
  heartbeat: vi.fn(),
}));

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

import { streamText, generateText } from 'ai';
import { heartbeat } from '@temporalio/activity';
import { runMutineer } from '../apps/worker/activities/mutineer';
import type { Finding } from '../apps/worker/activities/specialists';

const FIXTURE_FINDINGS: Finding[] = [
  {
    id: 'ironjaw-1',
    severity: 'critical',
    description: 'SQL injection vulnerability',
    recommendation: 'Use parameterized queries',
  },
  {
    id: 'ironjaw-2',
    severity: 'major',
    description: 'Missing auth check on endpoint',
    recommendation: 'Add auth middleware',
  },
];

const BARNACLE_FINDINGS: Finding[] = [
  {
    id: 'barnacle-1',
    severity: 'minor',
    description: 'Over-engineered abstraction',
    recommendation: 'Simplify the pattern',
  },
];

function makeStreamMock(text: string) {
  async function* fullStream() {
    const words = text.split(' ');
    for (const word of words) {
      yield { type: 'text-delta', text: word + ' ' };
    }
  }
  return { fullStream: fullStream() };
}

describe('runMutineer', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(streamText).mockReturnValue(
      makeStreamMock(
        'Arrr, I mutiny against these findings! ironjaw-1 is overblown!'
      ) as ReturnType<typeof streamText>
    );

    vi.mocked(generateText).mockResolvedValue({
      experimental_output: {
        challenges: [
          {
            findingId: 'ironjaw-1',
            specialistName: 'ironjaw',
            challengeText: 'This is not actually exploitable in context.',
          },
        ],
      },
    } as Awaited<ReturnType<typeof generateText>>);
  });

  it('returns extracted challenges', async () => {
    const result = await runMutineer({
      allFindings: { ironjaw: FIXTURE_FINDINGS },
      capPerSpecialist: 3,
    });

    expect(result.challenges).toHaveLength(1);
    expect(result.challenges[0].findingId).toBe('ironjaw-1');
    expect(result.challenges[0].challengeText).toContain('exploitable');
  });

  it('calls heartbeat with accumulated partial output', async () => {
    await runMutineer({
      allFindings: { ironjaw: FIXTURE_FINDINGS },
      capPerSpecialist: 3,
    });

    expect(vi.mocked(heartbeat)).toHaveBeenCalled();
    const calls = vi.mocked(heartbeat).mock.calls;
    const lastCall = calls[calls.length - 1][0] as { partialOutput: string };
    expect(lastCall.partialOutput).toContain('Arrr');
  });

  it('includes finding IDs in the prompt', async () => {
    await runMutineer({
      allFindings: { ironjaw: FIXTURE_FINDINGS, barnacle: BARNACLE_FINDINGS },
      capPerSpecialist: 2,
    });

    const streamCall = vi.mocked(streamText).mock.calls[0][0];
    const userMessage = (
      streamCall.messages as Array<{ role: string; content: string }>
    )[0].content;
    expect(userMessage).toContain('ironjaw-1');
    expect(userMessage).toContain('barnacle-1');
  });

  it('includes capPerSpecialist in the prompt', async () => {
    await runMutineer({
      allFindings: { ironjaw: FIXTURE_FINDINGS },
      capPerSpecialist: 2,
    });

    const streamCall = vi.mocked(streamText).mock.calls[0][0];
    expect(streamCall.system).toContain('2');
  });

  it('returns empty challenges when no findings', async () => {
    const result = await runMutineer({
      allFindings: { ironjaw: [], barnacle: [] },
      capPerSpecialist: 3,
    });

    expect(result.challenges).toEqual([]);
    // Should skip LLM entirely for empty findings
    expect(vi.mocked(streamText)).not.toHaveBeenCalled();
  });

  it('returns empty challenges when structured output is null', async () => {
    vi.mocked(generateText).mockResolvedValue({
      experimental_output: null,
    } as Awaited<ReturnType<typeof generateText>>);

    const result = await runMutineer({
      allFindings: { ironjaw: FIXTURE_FINDINGS },
      capPerSpecialist: 3,
    });

    expect(result.challenges).toEqual([]);
  });

  it('includes THE MUTINEER in system prompt', async () => {
    await runMutineer({
      allFindings: { ironjaw: FIXTURE_FINDINGS },
      capPerSpecialist: 3,
    });

    const streamCall = vi.mocked(streamText).mock.calls[0][0];
    expect(streamCall.system).toContain('MUTINEER');
  });
});
