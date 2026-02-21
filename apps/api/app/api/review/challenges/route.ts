import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getTemporalClient } from '@lib/temporal';
import { getActiveWorkflow } from '@lib/db';

const challengesBodySchema = z.record(z.string(), z.string());

export async function POST(request: Request) {
  const active = getActiveWorkflow();
  if (!active) {
    return NextResponse.json({ error: 'No active review' }, { status: 404 });
  }

  try {
    const body = await request.json();
    const parsed = challengesBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const client = await getTemporalClient();
    const handle = client.workflow.getHandle(active.workflowId);
    const result = await handle.executeUpdate('submitChallenges', {
      args: [parsed.data],
    });
    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to submit challenges';
    console.error('Failed to submit challenges:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
