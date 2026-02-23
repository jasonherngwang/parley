import { NextResponse } from 'next/server';
import { getTemporalClient } from '@lib/temporal';
import { getActiveWorkflow, clearActiveWorkflow } from '@lib/db';

export async function POST() {
  try {
    const active = getActiveWorkflow();

    if (!active) {
      return NextResponse.json({ error: 'No active review' }, { status: 404 });
    }

    try {
      const client = await getTemporalClient();
      const handle = client.workflow.getHandle(active.workflowId);
      await handle.terminate('Cancelled by user');
    } catch {
      // Workflow already gone — that's fine
    }

    clearActiveWorkflow();

    return NextResponse.json({ cancelled: true });
  } catch (err) {
    console.error('Failed to cancel workflow:', err);
    return NextResponse.json(
      { error: 'Failed to cancel review' },
      { status: 500 }
    );
  }
}
