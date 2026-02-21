import { NextResponse } from 'next/server';
import { getTemporalClient } from '@lib/temporal';
import { getActiveWorkflow } from '@lib/db';

export async function POST() {
  const active = getActiveWorkflow();
  if (!active) {
    return NextResponse.json({ error: 'No active review' }, { status: 404 });
  }

  try {
    const client = await getTemporalClient();
    const handle = client.workflow.getHandle(active.workflowId);
    await handle.signal('extendReviewWindow');
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Failed to signal extendReviewWindow:', err);
    return NextResponse.json(
      { error: 'Failed to extend window' },
      { status: 500 }
    );
  }
}
