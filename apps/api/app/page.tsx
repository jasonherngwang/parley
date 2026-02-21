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

// ── Types ──────────────────────────────────────────────────────────────────────

type SpecialistStatus =
  | 'pending'
  | 'running'
  | 'complete'
  | 'timed-out'
  | 'failed';

type MutineerStatus = 'pending' | 'running' | 'complete' | 'failed';

interface Finding {
  id: string;
  severity: 'critical' | 'major' | 'minor';
  description: string;
  lineReference?: number;
  recommendation: string;
}

interface SpecialistState {
  status: SpecialistStatus;
  attemptNumber: number;
  partialOutput?: string;
  findings: Finding[] | null;
}

interface MutineerChallenge {
  findingId: string;
  specialistName: string;
  challengeText: string;
}

interface ArbitrationState {
  findingId: string;
  status: 'pending' | 'running' | 'complete';
  ruling?: 'upheld' | 'overturned' | 'inconclusive';
  reasoning?: string;
  challengeSources: Array<'mutineer' | 'human'>;
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
  windowOpen?: boolean;
  secondsRemaining?: number;
  humanChallenges?: Record<string, string>;
  mutineerStatus?: MutineerStatus;
  mutineerPartialOutput?: string;
  mutineerChallenges?: MutineerChallenge[];
  arbitrations?: ArbitrationState[];
};
type CompleteState = {
  type: 'complete';
  prUrl: string;
  title?: string;
  repoName?: string;
  prNumber?: number;
  specialists?: Specialists;
  windowOpen?: boolean;
  secondsRemaining?: number;
  mutineerStatus?: MutineerStatus;
  mutineerChallenges?: MutineerChallenge[];
  arbitrations?: ArbitrationState[];
};
type AppState = FloorOpenState | RunningState | CompleteState;

// ── Specialist Node ────────────────────────────────────────────────────────────

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

// ── Specialist DAG ─────────────────────────────────────────────────────────────

const SPECIALISTS: Array<{
  key: keyof Specialists;
  name: string;
  character: string;
}> = [
  {
    key: 'ironjaw',
    name: 'IRONJAW',
    character: "Paranoid. Finds what's rotten in the hold.",
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

// ── Mutineer Panel ─────────────────────────────────────────────────────────────

function MutineerPanel({
  status,
  challenges,
}: {
  status: MutineerStatus;
  challenges: MutineerChallenge[];
}) {
  const borderColor =
    status === 'complete'
      ? 'border-orange-500'
      : status === 'running'
        ? 'border-blue-500'
        : status === 'failed'
          ? 'border-red-500'
          : 'border-gray-600';

  return (
    <div
      className={`rounded-xl border-2 p-4 text-xs bg-gray-900 ${borderColor}`}
    >
      <div className="flex items-center gap-2 mb-1">
        {status === 'running' ? (
          <span className="h-2 w-2 animate-pulse rounded-full bg-blue-400" />
        ) : status === 'complete' ? (
          <span className="h-2 w-2 rounded-full bg-orange-400" />
        ) : status === 'failed' ? (
          <span className="h-2 w-2 rounded-full bg-red-400" />
        ) : (
          <span className="h-2 w-2 rounded-full bg-gray-500" />
        )}
        <span className="font-bold text-gray-100 uppercase tracking-wide">
          THE MUTINEER
        </span>
      </div>
      <p className="text-gray-500 text-[10px] mb-2 italic">
        Argues the opposite on principle.
      </p>
      {status === 'running' && (
        <p className="text-blue-400 italic">Reviewing findings…</p>
      )}
      {status === 'complete' && (
        <p className="text-orange-300">
          Challenged {challenges.length} finding
          {challenges.length !== 1 ? 's' : ''}
        </p>
      )}
      {status === 'failed' && (
        <p className="text-red-400 italic">Failed — no challenges filed</p>
      )}
    </div>
  );
}

// ── Human Review Panel ─────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function HumanReviewPanel({
  specialists,
  windowOpen,
  secondsRemaining,
  onExtend,
  onSubmit,
  submitted,
}: {
  specialists: Specialists;
  windowOpen: boolean;
  secondsRemaining: number;
  onExtend: () => void;
  onSubmit: (challenges: Record<string, string>) => void;
  submitted: boolean;
}) {
  const [challenges, setChallenges] = useState<Record<string, string>>({});
  const [localSeconds, setLocalSeconds] = useState(secondsRemaining);

  // Sync local countdown from SSE state
  useEffect(() => {
    setLocalSeconds(secondsRemaining);
  }, [secondsRemaining]);

  // Tick down locally for smooth display
  useEffect(() => {
    if (!windowOpen || submitted) return;
    const interval = setInterval(() => {
      setLocalSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [windowOpen, submitted]);

  const allFindings: Array<{ specialist: string; finding: Finding }> = [];
  for (const [name, s] of Object.entries(specialists)) {
    if (s.findings) {
      for (const f of s.findings) {
        allFindings.push({ specialist: name, finding: f });
      }
    }
  }

  const isExpired = !windowOpen && !submitted;

  return (
    <div className="rounded-xl border-2 border-gray-700 bg-gray-900 p-4 text-xs space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-bold text-gray-100 uppercase tracking-wide">
          Human Review Window
        </span>
        <span
          className={`font-mono text-base font-bold ${
            isExpired
              ? 'text-gray-500'
              : localSeconds < 60
                ? 'text-red-400'
                : 'text-gray-300'
          }`}
        >
          {submitted
            ? 'Submitted'
            : isExpired
              ? 'Expired'
              : formatTime(localSeconds)}
        </span>
      </div>

      {allFindings.length === 0 && (
        <p className="text-gray-500 italic">No findings to challenge.</p>
      )}

      {allFindings.length > 0 && (
        <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
          {allFindings.map(({ specialist, finding }) => (
            <div
              key={finding.id}
              className="rounded-lg bg-gray-800 p-3 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <span
                    className={`text-[10px] font-semibold uppercase ${
                      finding.severity === 'critical'
                        ? 'text-red-400'
                        : finding.severity === 'major'
                          ? 'text-orange-400'
                          : 'text-yellow-400'
                    }`}
                  >
                    {specialist.toUpperCase()} — {finding.severity}
                  </span>
                  <p className="text-gray-300 mt-0.5">{finding.description}</p>
                </div>
                <span className="text-gray-600 font-mono text-[9px] shrink-0">
                  {finding.id}
                </span>
              </div>
              <textarea
                className="w-full rounded bg-gray-700 border border-gray-600 p-2 text-gray-200 placeholder-gray-500 focus:border-blue-500 focus:outline-none resize-none text-xs"
                rows={2}
                placeholder="Challenge this finding… (optional)"
                value={challenges[finding.id] ?? ''}
                onChange={(e) =>
                  setChallenges((prev) => ({
                    ...prev,
                    [finding.id]: e.target.value,
                  }))
                }
                disabled={!windowOpen || submitted}
              />
            </div>
          ))}
        </div>
      )}

      {windowOpen && !submitted && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={onExtend}
            className="rounded-lg border border-gray-600 px-3 py-1.5 text-gray-300 text-[11px] hover:border-blue-500 hover:text-blue-400 transition-colors"
          >
            Extend (+2 min)
          </button>
          <button
            onClick={() => onSubmit(challenges)}
            className="flex-1 rounded-lg bg-blue-600 px-3 py-1.5 font-medium text-white text-[11px] hover:bg-blue-500 transition-colors"
          >
            Submit Challenges
          </button>
        </div>
      )}

      {submitted && (
        <p className="text-green-400 text-[11px]">Challenges submitted.</p>
      )}
      {isExpired && (
        <p className="text-gray-500 text-[11px] italic">
          Window expired — no challenges submitted.
        </p>
      )}
    </div>
  );
}

// ── Arbitration Panel ──────────────────────────────────────────────────────────

function rulingBadge(ruling?: ArbitrationState['ruling']) {
  if (!ruling) return null;
  const colors: Record<string, string> = {
    upheld: 'bg-red-900 text-red-300 border-red-700',
    overturned: 'bg-green-900 text-green-300 border-green-700',
    inconclusive: 'bg-gray-800 text-gray-400 border-gray-600',
  };
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${colors[ruling] ?? colors['inconclusive']}`}
    >
      {ruling}
    </span>
  );
}

function ArbitrationPanel({
  specialists,
  arbitrations,
}: {
  specialists: Specialists;
  arbitrations: ArbitrationState[];
}) {
  if (arbitrations.length === 0) return null;

  const findFinding = (id: string): Finding | undefined => {
    for (const s of Object.values(specialists)) {
      const f = s.findings?.find((f: Finding) => f.id === id);
      if (f) return f;
    }
    return undefined;
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500 uppercase tracking-widest">
        Arbitration
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {arbitrations.map((arb) => {
          const finding = findFinding(arb.findingId);
          return (
            <div
              key={arb.findingId}
              className={`rounded-xl border-2 p-3 text-xs bg-gray-900 ${
                arb.status === 'running'
                  ? 'border-blue-500'
                  : arb.ruling === 'upheld'
                    ? 'border-red-700'
                    : arb.ruling === 'overturned'
                      ? 'border-green-700'
                      : 'border-gray-600'
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                {arb.status === 'running' ? (
                  <span className="h-2 w-2 animate-pulse rounded-full bg-blue-400" />
                ) : arb.ruling === 'upheld' ? (
                  <span className="h-2 w-2 rounded-full bg-red-400" />
                ) : arb.ruling === 'overturned' ? (
                  <span className="h-2 w-2 rounded-full bg-green-400" />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-gray-500" />
                )}
                <span className="font-bold text-gray-100 uppercase tracking-wide">
                  Arbitrator
                </span>
                {rulingBadge(arb.ruling)}
              </div>
              {finding && (
                <p className="text-gray-400 mb-1">
                  <span className="font-mono text-gray-500 text-[9px]">
                    [{arb.findingId}]
                  </span>{' '}
                  {finding.description}
                </p>
              )}
              <div className="flex gap-1 mb-1.5 flex-wrap">
                {arb.challengeSources.includes('mutineer') && (
                  <span className="rounded border border-orange-700 bg-orange-900/30 px-1 py-0.5 text-[9px] text-orange-300">
                    Mutineer
                  </span>
                )}
                {arb.challengeSources.includes('human') && (
                  <span className="rounded border border-blue-700 bg-blue-900/30 px-1 py-0.5 text-[9px] text-blue-300">
                    Human
                  </span>
                )}
              </div>
              {arb.status === 'running' && (
                <p className="text-blue-400 italic">Deliberating…</p>
              )}
              {arb.reasoning && (
                <p className="text-gray-400 leading-relaxed">{arb.reasoning}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function Home() {
  const [state, setState] = useState<AppState>({ type: 'floor-open' });
  const [prUrl, setPrUrl] = useState('');
  const [context, setContext] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challengesSubmitted, setChallengesSubmitted] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Reset submitted flag when a new review starts
  useEffect(() => {
    if (state.type === 'floor-open') {
      setChallengesSubmitted(false);
    }
  }, [state.type]);

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

  const handleExtend = useCallback(async () => {
    await fetch('/api/review/extend', { method: 'POST' });
  }, []);

  const handleSubmitChallenges = useCallback(
    async (challenges: Record<string, string>) => {
      const res = await fetch('/api/review/challenges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(challenges),
      });
      if (res.ok) {
        setChallengesSubmitted(true);
      }
    },
    []
  );

  const showChallengePhase =
    (state.type === 'running' || state.type === 'complete') &&
    (state.windowOpen === true ||
      challengesSubmitted ||
      (state.mutineerStatus && state.mutineerStatus !== 'pending') ||
      (state.arbitrations && state.arbitrations.length > 0));

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
            className={`space-y-6 rounded-xl border p-6 ${
              state.type === 'complete'
                ? 'border-green-800/50 bg-gray-900'
                : 'border-blue-800/50 bg-gray-900'
            }`}
          >
            {/* Header */}
            <div className="flex items-center gap-3">
              {state.type === 'running' ? (
                <div className="h-3 w-3 animate-pulse rounded-full bg-blue-500" />
              ) : (
                <div className="h-3 w-3 rounded-full bg-green-500" />
              )}
              <span className="font-medium">
                {state.type === 'running'
                  ? 'Review Running'
                  : 'Review Complete'}
              </span>
            </div>

            {/* PR metadata */}
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

            {/* Specialist DAG */}
            {state.specialists && (
              <>
                <p className="text-xs text-gray-500 uppercase tracking-widest">
                  Specialist Crew
                </p>
                <SpecialistDAG specialists={state.specialists} />
              </>
            )}

            {/* Challenge phase */}
            {showChallengePhase && state.specialists && (
              <>
                <p className="text-xs text-gray-500 uppercase tracking-widest">
                  Challenge Phase
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <MutineerPanel
                    status={state.mutineerStatus ?? 'pending'}
                    challenges={state.mutineerChallenges ?? []}
                  />

                  {(state.windowOpen === true ||
                    challengesSubmitted ||
                    state.secondsRemaining === 0) && (
                    <HumanReviewPanel
                      specialists={state.specialists}
                      windowOpen={state.windowOpen ?? false}
                      secondsRemaining={state.secondsRemaining ?? 0}
                      onExtend={handleExtend}
                      onSubmit={handleSubmitChallenges}
                      submitted={challengesSubmitted}
                    />
                  )}
                </div>

                {state.arbitrations && state.arbitrations.length > 0 && (
                  <ArbitrationPanel
                    specialists={state.specialists}
                    arbitrations={state.arbitrations}
                  />
                )}
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
