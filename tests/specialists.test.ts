import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { SpecialistResult } from '../apps/worker/activities/specialists';

// Mock @temporalio/activity before importing the activity
vi.mock('@temporalio/activity', () => ({
  heartbeat: vi.fn(),
}));

// Mock the ai SDK to avoid real Gemini calls
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

// Mock the models module
vi.mock('../lib/models', () => ({
  geminiFlashLite: { modelId: 'mock-fast' },
  geminiPro: { modelId: 'mock-deep' },
}));

import { streamText, generateText } from 'ai';
import { heartbeat } from '@temporalio/activity';
import {
  runIronjaw,
  runBarnacle,
  runGreenhand,
} from '../apps/worker/activities/specialists';

const FIXTURE_FINDINGS: SpecialistResult['findings'] = [
  {
    id: 'test-1',
    severity: 'critical',
    description: 'SQL injection vulnerability in query builder',
    lineReference: 42,
    recommendation: 'Use parameterized queries',
  },
  {
    id: 'test-2',
    severity: 'minor',
    description: 'Missing null check',
    recommendation: 'Add null guard before accessing property',
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

describe('specialist activities', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(streamText).mockReturnValue(
      makeStreamMock('Arrr, I spy danger in the hold!') as ReturnType<
        typeof streamText
      >
    );

    vi.mocked(generateText).mockResolvedValue({
      experimental_output: { findings: FIXTURE_FINDINGS },
    } as Awaited<ReturnType<typeof generateText>>);
  });

  describe('runIronjaw', () => {
    it('returns findings and rawText', async () => {
      const result = await runIronjaw({
        diff: '--- a/auth.ts\n+++ b/auth.ts\n@@ -1 +1 @@\n-return true\n+return false',
      });

      expect(result.findings).toEqual(FIXTURE_FINDINGS);
      expect(result.rawText).toContain('Arrr');
    });

    it('calls heartbeat with accumulated partialOutput', async () => {
      await runIronjaw({
        diff: '--- a/auth.ts\n+++ b/auth.ts\n@@ -1 +1 @@\n-x\n+y',
      });

      expect(vi.mocked(heartbeat)).toHaveBeenCalled();
      const calls = vi.mocked(heartbeat).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const lastCall = calls[calls.length - 1][0] as { partialOutput: string };
      expect(lastCall.partialOutput).toContain('Arrr');
    });

    it('passes context to generateText prompt', async () => {
      await runIronjaw({
        diff: 'diff content',
        context: 'security-critical module',
      });

      const streamCall = vi.mocked(streamText).mock.calls[0][0];
      const userMessage = (streamCall.messages as Array<{ role: string; content: string }>)[0].content;
      expect(userMessage).toContain('security-critical module');
    });

    it('includes IRONJAW system prompt with security focus', async () => {
      await runIronjaw({ diff: 'diff content' });

      const streamCall = vi.mocked(streamText).mock.calls[0][0];
      expect(streamCall.system).toContain('IRONJAW');
      expect(streamCall.system).toContain('ironjaw-1');
    });
  });

  describe('runBarnacle', () => {
    it('returns findings and rawText', async () => {
      const result = await runBarnacle({ diff: 'diff content' });

      expect(result.findings).toEqual(FIXTURE_FINDINGS);
      expect(typeof result.rawText).toBe('string');
    });

    it('includes BARNACLE system prompt with complexity focus', async () => {
      await runBarnacle({ diff: 'diff content' });

      const streamCall = vi.mocked(streamText).mock.calls[0][0];
      expect(streamCall.system).toContain('BARNACLE');
      expect(streamCall.system).toContain('barnacle-1');
    });
  });

  describe('runGreenhand', () => {
    it('returns findings and rawText', async () => {
      const result = await runGreenhand({ diff: 'diff content' });

      expect(result.findings).toEqual(FIXTURE_FINDINGS);
      expect(typeof result.rawText).toBe('string');
    });

    it('includes GREENHAND system prompt with junior correctness focus', async () => {
      await runGreenhand({ diff: 'diff content' });

      const streamCall = vi.mocked(streamText).mock.calls[0][0];
      expect(streamCall.system).toContain('GREENHAND');
      expect(streamCall.system).toContain('greenhand-1');
    });
  });

  it('returns empty findings array when structured output has none', async () => {
    vi.mocked(generateText).mockResolvedValue({
      experimental_output: { findings: [] },
    } as Awaited<ReturnType<typeof generateText>>);

    const result = await runIronjaw({ diff: 'diff content' });
    expect(result.findings).toEqual([]);
  });

  it('returns empty findings when structured output is null', async () => {
    vi.mocked(generateText).mockResolvedValue({
      experimental_output: null,
    } as Awaited<ReturnType<typeof generateText>>);

    const result = await runIronjaw({ diff: 'diff content' });
    expect(result.findings).toEqual([]);
  });
});
