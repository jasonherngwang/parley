import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getTemporalClient } from '@lib/temporal';
import { getActiveWorkflow, setActiveWorkflow } from '@lib/db';
import { parseGitHubPRUrl } from '@lib/github';

const startBodySchema = z.object({
  prUrl: z.string().min(1, 'PR URL is required'),
  context: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = startBodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid request body' },
        { status: 400 }
      );
    }

    const { prUrl, context } = parsed.data;

    // Validate URL format before starting workflow
    try {
      parseGitHubPRUrl(prUrl.trim());
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Invalid GitHub PR URL' },
        { status: 400 }
      );
    }

    const existing = getActiveWorkflow();
    if (existing) {
      return NextResponse.json(
        { error: 'A review is already running' },
        { status: 409 }
      );
    }

    const client = await getTemporalClient();
    const workflowId = `review-${Date.now()}`;

    await client.workflow.start('reviewWorkflow', {
      taskQueue: 'review-fast',
      workflowId,
      args: [{ prUrl: prUrl.trim(), context: context?.trim() || undefined }],
    });

    setActiveWorkflow(workflowId);

    return NextResponse.json({ workflowId });
  } catch (err) {
    console.error('Failed to start workflow:', err);
    return NextResponse.json(
      { error: 'Failed to start review' },
      { status: 500 }
    );
  }
}
