import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getTemporalClient } from '@lib/temporal';
import { getActiveWorkflow, setActiveWorkflow, clearActiveWorkflow } from '@lib/db';
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
      // Use describe() to check server-side execution status without replaying.
      // This avoids nondeterminism errors when the workflow code has changed.
      try {
        const existingClient = await getTemporalClient();
        const handle = existingClient.workflow.getHandle(existing.workflowId);
        const desc = await handle.describe();
        const status = desc.status.name;

        if (status === 'RUNNING') {
          return NextResponse.json(
            { error: 'A review is already running' },
            { status: 409 }
          );
        }
        // Terminal state (COMPLETED, FAILED, TERMINATED, CANCELLED, TIMED_OUT)
        // — safe to start a new one
        clearActiveWorkflow();
      } catch {
        // Workflow gone from server — safe to proceed
        clearActiveWorkflow();
      }
    }

    const client = await getTemporalClient();
    const workflowId = `review-${Date.now()}`;

    await client.workflow.start('reviewWorkflow', {
      taskQueue: 'review-fast',
      workflowId,
      args: [{ prUrl: prUrl.trim(), context: context?.trim() || undefined }],
      // Global timeout: auto-terminate if workflow is stuck. Normal reviews
      // complete well within this window; if hit, it means something is stuck.
      workflowExecutionTimeout: '30 minutes',
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
