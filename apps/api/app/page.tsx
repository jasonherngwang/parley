'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  type Node,
  type Edge,
  type NodeTypes,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

type SpecialistStatus =
  | 'pending'
  | 'running'
  | 'complete'
  | 'timed-out'
  | 'failed';

interface SpecialistState {
  status: SpecialistStatus;
  attemptNumber: number;
  partialOutput?: string;
  findings: Array<{
    id: string;
    severity: 'critical' | 'major' | 'minor';
    description: string;
    lineReference?: number;
    recommendation: string;
  }> | null;
}

interface Specialists {
  ironjaw: SpecialistState;
  barnacle: SpecialistState;
  greenhand: SpecialistState;
}

type FloorOpenState = { type: 'floor-open' };
type RunningState = {
  type: 'running';
  prUrl: string;
  title?: string;
  repoName?: string;
  prNumber?: number;
  specialists?: Specialists;
};
type CompleteState = {
  type: 'complete';
  prUrl: string;
  title?: string;
  repoName?: string;
  prNumber?: number;
  specialists?: Specialists;
};
type AppState = FloorOpenState | RunningState | CompleteState;

// --- Specialist node custom component ---

interface SpecialistNodeData {
  name: string;
  character: string;
  state: SpecialistState;
  [key: string]: unknown;
}

function statusColor(status: SpecialistStatus): string {
  switch (status) {
    case 'pending':
      return 'border-gray-600 bg-gray-900';
    case 'running':
      return 'border-blue-500 bg-gray-900';
    case 'complete':
      return 'border-green-500 bg-gray-900';
    case 'timed-out':
      return 'border-yellow-500 bg-gray-900';
    case 'failed':
      return 'border-red-500 bg-gray-900';
  }
}

function statusDot(status: SpecialistStatus) {
  switch (status) {
    case 'pending':
      return <span className="h-2 w-2 rounded-full bg-gray-500" />;
    case 'running':
      return (
        <span className="h-2 w-2 animate-pulse rounded-full bg-blue-400" />
      );
    case 'complete':
      return <span className="h-2 w-2 rounded-full bg-green-400" />;
    case 'timed-out':
      return <span className="h-2 w-2 rounded-full bg-yellow-400" />;
    case 'failed':
      return <span className="h-2 w-2 rounded-full bg-red-400" />;
  }
}

function SpecialistNode({ data }: { data: SpecialistNodeData }) {
  const { name, character, state } = data;
  const severityCounts =
    state.findings?.reduce(
      (acc, f) => {
        acc[f.severity] = (acc[f.severity] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    ) ?? {};

  return (
    <div
      className={`w-56 rounded-xl border-2 p-3 text-xs shadow-lg ${statusColor(state.status)}`}
    >
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <div className="flex items-center gap-2 mb-1">
        {statusDot(state.status)}
        <span className="font-bold text-gray-100 uppercase tracking-wide">
          {name}
        </span>
        {state.attemptNumber > 1 && (
          <span className="ml-auto text-amber-400 text-[10px]">
            {state.attemptNumber}/3
          </span>
        )}
      </div>
      <p className="text-gray-500 text-[10px] mb-2 italic">{character}</p>

      {state.status === 'running' && state.partialOutput && (
        <div className="rounded bg-gray-800 p-2 max-h-24 overflow-hidden text-gray-300 leading-relaxed">
          <span className="line-clamp-4">{state.partialOutput}</span>
          <span className="animate-pulse">▋</span>
        </div>
      )}

      {state.status === 'complete' && state.findings && (
        <div className="space-y-1">
          {state.findings.length === 0 ? (
            <p className="text-gray-500 italic">No findings</p>
          ) : (
            <>
              <div className="flex gap-2 text-[10px]">
                {(severityCounts['critical'] ?? 0) > 0 && (
                  <span className="text-red-400">
                    {severityCounts['critical']} critical
                  </span>
                )}
                {(severityCounts['major'] ?? 0) > 0 && (
                  <span className="text-orange-400">
                    {severityCounts['major']} major
                  </span>
                )}
                {(severityCounts['minor'] ?? 0) > 0 && (
                  <span className="text-yellow-400">
                    {severityCounts['minor']} minor
                  </span>
                )}
              </div>
              <ul className="space-y-1 max-h-28 overflow-y-auto">
                {state.findings.slice(0, 3).map((f) => (
                  <li
                    key={f.id}
                    className="rounded bg-gray-800 px-2 py-1 text-gray-300 leading-snug"
                  >
                    <span
                      className={
                        f.severity === 'critical'
                          ? 'text-red-400'
                          : f.severity === 'major'
                            ? 'text-orange-400'
                            : 'text-yellow-400'
                      }
                    >
                      [{f.severity}]
                    </span>{' '}
                    {f.description}
                  </li>
                ))}
                {state.findings.length > 3 && (
                  <li className="text-gray-500 italic">
                    +{state.findings.length - 3} more
                  </li>
                )}
              </ul>
            </>
          )}
        </div>
      )}

      {state.status === 'timed-out' && (
        <p className="text-yellow-400 italic">Timed out after 45s</p>
      )}
      {state.status === 'failed' && (
        <p className="text-red-400 italic">Failed after 3 attempts</p>
      )}

      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  specialist: SpecialistNode as unknown as NodeTypes['specialist'],
};

// --- DAG component ---

const SPECIALISTS: Array<{
  key: keyof Specialists;
  name: string;
  character: string;
}> = [
  {
    key: 'ironjaw',
    name: 'IRONJAW',
    character: 'Paranoid. Finds what\'s rotten in the hold.',
  },
  {
    key: 'barnacle',
    name: 'BARNACLE',
    character: 'Greybeard. Has seen this pattern sink ships before.',
  },
  {
    key: 'greenhand',
    name: 'GREENHAND',
    character: 'Enthusiastic junior. First voyage. Reads code literally.',
  },
];

function SpecialistDAG({ specialists }: { specialists: Specialists }) {
  const nodes: Node[] = SPECIALISTS.map((s, i) => ({
    id: s.key,
    type: 'specialist',
    position: { x: i * 240, y: 0 },
    data: {
      name: s.name,
      character: s.character,
      state: specialists[s.key],
    },
  }));

  const edges: Edge[] = [];

  return (
    <div className="h-72 w-full rounded-xl border border-gray-800 overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={false}
        zoomOnScroll={false}
      >
        <Background color="#374151" gap={16} />
      </ReactFlow>
    </div>
  );
}

// --- Main page ---

export default function Home() {
  const [state, setState] = useState<AppState>({ type: 'floor-open' });
  const [prUrl, setPrUrl] = useState('');
  const [context, setContext] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource('/api/review/stream');
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as AppState;
        setState(data);
      } catch {
        // Ignore malformed events
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!prUrl.trim() || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/review/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prUrl: prUrl.trim(),
          context: context.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Failed to start review');
      } else {
        setPrUrl('');
        setContext('');
      }
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  }, [prUrl, context, submitting]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-4xl space-y-8">
        <header className="text-center">
          <h1 className="text-4xl font-bold tracking-tight">Parley</h1>
          <p className="mt-2 text-gray-400">Adversarial Code Review</p>
        </header>

        {state.type === 'floor-open' && (
          <div className="space-y-4 rounded-xl border border-gray-800 bg-gray-900 p-6">
            <p className="text-sm text-gray-400">
              The floor is open. Submit a GitHub PR URL to start a review.
            </p>
            <div className="space-y-3">
              <input
                type="url"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 p-3 text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="https://github.com/owner/repo/pull/123"
                value={prUrl}
                onChange={(e) => setPrUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmit();
                }}
              />
              <textarea
                className="w-full rounded-lg border border-gray-700 bg-gray-800 p-3 text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                rows={3}
                placeholder="Optional: additional context about this PR..."
                value={context}
                onChange={(e) => setContext(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              onClick={handleSubmit}
              disabled={submitting || !prUrl.trim()}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Starting...' : 'Start Review'}
            </button>
          </div>
        )}

        {(state.type === 'running' || state.type === 'complete') && (
          <div
            className={`space-y-4 rounded-xl border p-6 ${
              state.type === 'complete'
                ? 'border-green-800/50 bg-gray-900'
                : 'border-blue-800/50 bg-gray-900'
            }`}
          >
            <div className="flex items-center gap-3">
              {state.type === 'running' ? (
                <div className="h-3 w-3 animate-pulse rounded-full bg-blue-500" />
              ) : (
                <div className="h-3 w-3 rounded-full bg-green-500" />
              )}
              <span className="font-medium">
                {state.type === 'running' ? 'Review Running' : 'Review Complete'}
              </span>
            </div>

            {state.title ? (
              <div className="rounded-lg bg-gray-800 p-4">
                <p className="text-sm text-gray-400">
                  {state.repoName} #{state.prNumber}
                </p>
                <p className="mt-1 font-medium text-gray-200">{state.title}</p>
              </div>
            ) : (
              <div className="rounded-lg bg-gray-800 p-4">
                <p className="text-sm text-gray-400">Fetching PR details...</p>
                <p className="mt-1 break-all text-xs text-gray-500">
                  {state.prUrl}
                </p>
              </div>
            )}

            {state.specialists && (
              <>
                <p className="text-xs text-gray-500 uppercase tracking-widest">
                  Specialist Crew
                </p>
                <SpecialistDAG specialists={state.specialists} />
              </>
            )}

            {state.type === 'complete' && (
              <p className="text-sm text-green-400">
                Done. The floor will reopen shortly.
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
