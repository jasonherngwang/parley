import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('ai', () => {
  const mockOutput = {
    object: vi.fn().mockReturnValue({ type: 'object' }),
  };
  return {
    generateText: vi.fn(),
    Output: mockOutput,
  };
});

vi.mock('../lib/models', () => ({
  geminiFlashLite: { modelId: 'mock-fast' },
  geminiPro: { modelId: 'mock-deep' },
}));

import { generateText } from 'ai';
import { runArbitrator } from '../apps/worker/activities/arbitrator';
import type { Finding } from '../apps/worker/activities/specialists';

const FIXTURE_FINDING: Finding = {
  id: 'ironjaw-1',
  severity: 'critical',
  description: 'SQL injection vulnerability in login query',
  recommendation: 'Use parameterized queries',
};

describe('runArbitrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns upheld ruling', async () => {
    vi.mocked(generateText).mockResolvedValue({
      experimental_output: {
        ruling: 'upheld',
        reasoning: 'The finding is valid. SQL injection is clearly present.',
      },
    } as Awaited<ReturnType<typeof generateText>>);

    const result = await runArbitrator({
      finding: FIXTURE_FINDING,
      mutineerChallenge: 'The input is already validated upstream.',
    });

    expect(result.ruling).toBe('upheld');
    expect(result.reasoning).toContain('valid');
  });

  it('returns overturned ruling', async () => {
    vi.mocked(generateText).mockResolvedValue({
      experimental_output: {
        ruling: 'overturned',
        reasoning: 'Challenge is correct. The ORM already escapes inputs.',
      },
    } as Awaited<ReturnType<typeof generateText>>);

    const result = await runArbitrator({
      finding: FIXTURE_FINDING,
      humanChallenge: 'We use an ORM that handles escaping.',
    });

    expect(result.ruling).toBe('overturned');
    expect(result.reasoning).toContain('ORM');
  });

  it('includes mutineer challenge text in prompt when provided', async () => {
    vi.mocked(generateText).mockResolvedValue({
      experimental_output: { ruling: 'upheld', reasoning: 'Still valid.' },
    } as Awaited<ReturnType<typeof generateText>>);

    await runArbitrator({
      finding: FIXTURE_FINDING,
      mutineerChallenge: 'The mutineer says this is wrong.',
    });

    const call = vi.mocked(generateText).mock.calls[0][0];
    const userMsg = (call.messages as Array<{ role: string; content: string }>)[0].content;
    expect(userMsg).toContain('THE MUTINEER challenges');
    expect(userMsg).toContain('The mutineer says this is wrong.');
  });

  it('includes human challenge text in prompt when provided', async () => {
    vi.mocked(generateText).mockResolvedValue({
      experimental_output: { ruling: 'upheld', reasoning: 'Still valid.' },
    } as Awaited<ReturnType<typeof generateText>>);

    await runArbitrator({
      finding: FIXTURE_FINDING,
      humanChallenge: 'Human reviewer disagrees with this.',
    });

    const call = vi.mocked(generateText).mock.calls[0][0];
    const userMsg = (call.messages as Array<{ role: string; content: string }>)[0].content;
    expect(userMsg).toContain('Human reviewer challenges');
    expect(userMsg).toContain('Human reviewer disagrees with this.');
  });

  it('includes both challenges when both are provided', async () => {
    vi.mocked(generateText).mockResolvedValue({
      experimental_output: { ruling: 'upheld', reasoning: 'Still valid.' },
    } as Awaited<ReturnType<typeof generateText>>);

    await runArbitrator({
      finding: FIXTURE_FINDING,
      mutineerChallenge: 'Mutineer says no.',
      humanChallenge: 'Human says no too.',
    });

    const call = vi.mocked(generateText).mock.calls[0][0];
    const userMsg = (call.messages as Array<{ role: string; content: string }>)[0].content;
    expect(userMsg).toContain('THE MUTINEER challenges');
    expect(userMsg).toContain('Human reviewer challenges');
  });

  it('includes finding ID and severity in prompt', async () => {
    vi.mocked(generateText).mockResolvedValue({
      experimental_output: { ruling: 'upheld', reasoning: 'Valid.' },
    } as Awaited<ReturnType<typeof generateText>>);

    await runArbitrator({ finding: FIXTURE_FINDING });

    const call = vi.mocked(generateText).mock.calls[0][0];
    const userMsg = (call.messages as Array<{ role: string; content: string }>)[0].content;
    expect(userMsg).toContain('ironjaw-1');
    expect(userMsg).toContain('critical');
  });

  it('falls back to upheld when structured output is null', async () => {
    vi.mocked(generateText).mockResolvedValue({
      experimental_output: null,
    } as Awaited<ReturnType<typeof generateText>>);

    const result = await runArbitrator({ finding: FIXTURE_FINDING });
    expect(result.ruling).toBe('upheld');
    expect(result.reasoning).toBeTruthy();
  });
});
