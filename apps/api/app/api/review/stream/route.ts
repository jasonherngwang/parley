import { getTemporalClient } from '@lib/temporal';
import { getActiveWorkflow, clearActiveWorkflow } from '@lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const send = (data: Record<string, unknown>) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const poll = async () => {
        if (closed) return;

        try {
          const active = getActiveWorkflow();

          if (!active) {
            send({ type: 'floor-open' });
          } else {
            try {
              const client = await getTemporalClient();
              const handle = client.workflow.getHandle(active.workflowId);
              const state = await handle.query('getReviewState');

              send({ type: (state as { status: string }).status, ...(state as Record<string, unknown>) });

              if ((state as { status: string }).status === 'complete') {
                clearActiveWorkflow();
              }
            } catch {
              // Workflow may have been terminated or doesn't exist
              clearActiveWorkflow();
              send({ type: 'floor-open' });
            }
          }
        } catch (err) {
          console.error('SSE poll error:', err);
          send({ type: 'error', message: 'Internal error' });
        }
      };

      // Initial poll immediately
      poll();

      const intervalId = setInterval(poll, 1000);

      request.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(intervalId);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
