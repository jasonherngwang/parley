import { NextResponse } from 'next/server';
import { getTemporalClient } from '@lib/temporal';
import { getActiveWorkflow, setActiveWorkflow } from '@lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = body.input;

    if (!input || typeof input !== 'string' || input.trim().length === 0) {
      return NextResponse.json({ error: 'Input is required' }, { status: 400 });
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
      args: [{ input: input.trim() }],
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
