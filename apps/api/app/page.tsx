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

type SynthesisStatus = 'pending' | 'running' | 'complete' | 'failed';

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

interface VerdictFinding {
  severity: 'critical' | 'major' | 'minor';
  specialist: string;
  description: string;
  ruling?: 'upheld' | 'overturned' | 'inconclusive';
  challengeSources?: Array<'mutineer' | 'human'>;
  recommendation: string;
}

interface SynthesisVerdict {
  findings: VerdictFinding[];
  summary: string;
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
  synthesisStatus?: SynthesisStatus;
  synthesisPartialOutput?: string;
  verdict?: SynthesisVerdict;
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
  synthesisStatus?: SynthesisStatus;
  synthesisPartialOutput?: string;
  verdict?: SynthesisVerdict;
};
type AppState = FloorOpenState | RunningState | CompleteState;

// ── Educational "Why" content ──────────────────────────────────────────────────

interface WhyCopy {
  title: string;
  paragraphs: string[];
}

const WHY_COPY: Record<string, WhyCopy> = {
  'specialist-ironjaw': {
    title: 'IRONJAW — Security Auditor',
    paragraphs: [
      'IRONJAW is a Temporal Activity — a regular async function that can fail, be retried, and heartbeat progress back to the workflow.',
      'Retry policy: up to 3 attempts, 2-second backoff that doubles each retry. Heartbeat timeout: 15 seconds. If no heartbeat arrives within that window, Temporal assumes the activity is stuck and re-schedules it on another worker.',
      'Why the fast queue? Gemini Flash Lite is lightweight and fast — ideal for running three reviewers in parallel without burning through budget.',
      'If this worker crashes right now, Temporal detects the missed heartbeat within 15 seconds and automatically re-dispatches the activity to another available worker. Your workflow state is safe.',
    ],
  },
  'specialist-barnacle': {
    title: 'BARNACLE — Complexity Skeptic',
    paragraphs: [
      'BARNACLE is a Temporal Activity running on the same fast task queue as IRONJAW and GREENHAND. All three start simultaneously the moment the PR diff is fetched.',
      'Retry policy: up to 3 attempts, 2-second initial backoff with exponential increase. Heartbeat timeout: 15 seconds.',
      'BARNACLE streams its ship\'s log back to the workflow via heartbeat metadata, which is forwarded to the UI as partial output in real time.',
      'The finding schema enforces structured output: severity, description, line reference, and recommendation — extracted via a second LLM call after streaming completes.',
    ],
  },
  'specialist-greenhand': {
    title: 'GREENHAND — Domain Reviewer',
    paragraphs: [
      'GREENHAND is the third parallel specialist Activity, reading the diff from a junior\'s literal perspective.',
      'All three specialists are dispatched with Promise.all — if one is rate-limited or slow, the other two proceed independently.',
      'Each specialist is wrapped in a CancellationScope.withTimeout(45s). If the 45-second deadline passes, Temporal cancels the scope and marks the slot timed-out — the join gate still fires when the other two complete.',
      'Finding IDs are prefixed by specialist: greenhand-1, greenhand-2, etc. This makes it easy to trace a finding through the arbitration and synthesis stages.',
    ],
  },
  mutineer: {
    title: 'THE MUTINEER — Dispute Orchestrator',
    paragraphs: [
      'THE MUTINEER runs in parallel with the human review window. It independently decides which findings to challenge — it doesn\'t fill in for the human, it has its own opinion.',
      'Both THE MUTINEER and the human can challenge the same finding. The arbitrator receives all challenges for a finding and rules once — it sees whether the challenge came from Mutineer, human, or both.',
      'This is also a Temporal Activity: same retry policy as the specialists, on the fast queue. The Mutineer streams its reasoning back via heartbeat, just like the specialists do.',
    ],
  },
  signal: {
    title: 'Signal — Extend Window',
    paragraphs: [
      'Fire-and-forget. No validation, no response. The workflow receives the Signal and adds 2 minutes to the countdown.',
      'Durable: this event is recorded in Temporal\'s event history the instant it arrives — even before the workflow task has processed it.',
      'Because Signals are asynchronous, there is no way to reject one from the caller\'s side. Any validation must happen inside the workflow handler after the fact.',
      'The Signal handler is registered before any await in the workflow, so it can never be missed — even if the Signal arrives while the workflow is processing something else.',
    ],
  },
  update: {
    title: 'Update — Submit Challenges',
    paragraphs: [
      'Synchronous and acknowledged. Unlike a Signal, an Update waits for the workflow to accept or reject the request before returning to the caller.',
      'The workflow processed your challenge map and stored it in state. You received { accepted: true } because the Update handler completed successfully.',
      'If the workflow had rejected the Update (for example, because the window was already closed), you would have received an error response instead.',
      'Updates are recorded in Temporal\'s event history just like Signals — fully durable and replayable during workflow reconstruction.',
    ],
  },
  arbitrator: {
    title: 'Arbitrator — Dynamic Dispatch',
    paragraphs: [
      'One Arbitrator Activity is dispatched per disputed finding. The exact count is not known until both THE MUTINEER and the human review window have closed.',
      'All arbitrators run in parallel — a finding challenged by both Mutineer and human resolves at the same time as one challenged only by the Mutineer.',
      'Gemini Flash Lite is sufficient here: the ruling is bounded (upheld / overturned / inconclusive) and the arbitrator weighs at most two short challenge arguments against the original finding.',
      'If all retry attempts are exhausted, the ruling falls back to "inconclusive" — the workflow continues regardless. A single arbitrator failure never blocks the review.',
    ],
  },
  synthesis: {
    title: 'Synthesis — Final Verdict',
    paragraphs: [
      'Synthesis reads every specialist finding and every arbitration outcome, then reconciles them into a single structured verdict.',
      'This is the only activity on the review-deep task queue. It uses Gemini Pro — the heavier model is warranted for the holistic reconciliation step where all evidence must be weighed together.',
      'Synthesis streams its reasoning back via heartbeat, then produces a structured verdict with per-finding severity, ruling, challenge sources, and recommendation.',
      'The workflow waits for all signal/update handlers to finish before calling Synthesis — ensuring the final state snapshot is complete before the verdict is generated.',
    ],
  },
};

// ── WhyDrawer ──────────────────────────────────────────────────────────────────

function WhyDrawer({
  whyKey,
  onClose,
}: {
  whyKey: string;
  onClose: () => void;
}) {
  const content = WHY_COPY[whyKey];
  if (!content) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div className="animate-slide-in-right relative w-full max-w-md h-full bg-gray-950 border-l border-gray-700 p-6 overflow-y-auto shadow-2xl flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <span className="text-xs text-gray-500 uppercase tracking-widest font-semibold">
            Why this?
          </span>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors text-lg leading-none"
            aria-label="Close drawer"
          >
            ✕
          </button>
        </div>
        <h2 className="text-base font-bold text-gray-100 mb-5">{content.title}</h2>
        <div className="space-y-4 flex-1">
          {content.paragraphs.map((p, i) => (
            <p key={i} className="text-sm text-gray-400 leading-relaxed">
              {p}
            </p>
          ))}
        </div>
        <div className="mt-6 pt-4 border-t border-gray-800">
          <p className="text-[10px] text-gray-600 italic">
            Powered by Temporal — durable workflow orchestration
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Specialist Node ────────────────────────────────────────────────────────────

interface SpecialistNodeData {
  name: string;
  character: string;
  state: SpecialistState;
  whyKey: string;
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
      return <span className="h-2 w-2 rounded-full bg-gray-500 shrink-0" />;
    case 'running':
      return (
        <span className="h-2 w-2 animate-pulse rounded-full bg-blue-400 shrink-0" />
      );
    case 'complete':
      return <span className="h-2 w-2 rounded-full bg-green-400 shrink-0" />;
    case 'timed-out':
      return <span className="h-2 w-2 rounded-full bg-yellow-400 shrink-0" />;
    case 'failed':
      return <span className="h-2 w-2 rounded-full bg-red-400 shrink-0" />;
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
      className={`w-56 rounded-xl border-2 p-3 text-xs shadow-lg cursor-pointer hover:ring-2 hover:ring-blue-500/30 transition-all duration-300 ${statusColor(state.status)}`}
      title="Click to learn about this Temporal primitive"
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
      {state.status === 'running' && !state.partialOutput && (
        <p className="text-blue-400 italic">
          Running<span className="animate-pulse">…</span>
        </p>
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
    character: '20-year greybeard. Has seen this pattern sink ships before.',
  },
  {
    key: 'greenhand',
    name: 'GREENHAND',
    character: 'Enthusiastic junior. First voyage. Reads code literally.',
  },
];

function SpecialistDAG({
  specialists,
  onWhyClick,
}: {
  specialists: Specialists;
  onWhyClick: (key: string) => void;
}) {
  const nodes: Node[] = SPECIALISTS.map((s, i) => ({
    id: s.key,
    type: 'specialist',
    position: { x: i * 240, y: 0 },
    data: {
      name: s.name,
      character: s.character,
      state: specialists[s.key],
      whyKey: `specialist-${s.key}`,
    },
  }));

  const edges: Edge[] = [];

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const whyKey = (node.data as { whyKey: string }).whyKey;
      onWhyClick(whyKey);
    },
    [onWhyClick]
  );

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
        onNodeClick={handleNodeClick}
      >
        <Background color="#374151" gap={16} />
      </ReactFlow>
    </div>
  );
}

// ── Why button ─────────────────────────────────────────────────────────────────

function WhyBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 h-4 w-4 rounded-full border border-gray-600 text-gray-500 text-[9px] font-bold hover:border-blue-500 hover:text-blue-400 transition-colors leading-none flex items-center justify-center"
      title="Why this Temporal primitive?"
      aria-label="Why?"
    >
      ?
    </button>
  );
}

// ── Mutineer Panel ─────────────────────────────────────────────────────────────

function MutineerPanel({
  status,
  challenges,
  onWhyClick,
}: {
  status: MutineerStatus;
  challenges: MutineerChallenge[];
  onWhyClick: () => void;
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
      className={`rounded-xl border-2 p-4 text-xs bg-gray-900 transition-all duration-300 ${borderColor}`}
    >
      <div className="flex items-center gap-2 mb-1">
        {status === 'running' ? (
          <span className="h-2 w-2 animate-pulse rounded-full bg-blue-400 shrink-0" />
        ) : status === 'complete' ? (
          <span className="h-2 w-2 rounded-full bg-orange-400 shrink-0" />
        ) : status === 'failed' ? (
          <span className="h-2 w-2 rounded-full bg-red-400 shrink-0" />
        ) : (
          <span className="h-2 w-2 rounded-full bg-gray-500 shrink-0" />
        )}
        <span className="font-bold text-gray-100 uppercase tracking-wide">
          THE MUTINEER
        </span>
        <WhyBtn onClick={onWhyClick} />
      </div>
      <p className="text-gray-500 text-[10px] mb-2 italic">
        Argues the opposite on principle. Decides independently which findings deserve a fight.
      </p>
      {status === 'running' && (
        <p className="text-blue-400 italic">
          Reviewing findings<span className="animate-pulse">…</span>
        </p>
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
  onSignalWhy,
  onUpdateWhy,
}: {
  specialists: Specialists;
  windowOpen: boolean;
  secondsRemaining: number;
  onExtend: () => void;
  onSubmit: (challenges: Record<string, string>) => void;
  submitted: boolean;
  onSignalWhy: () => void;
  onUpdateWhy: () => void;
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
          className={`font-mono text-base font-bold transition-colors duration-300 ${
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
        <div className="flex gap-2 pt-1 flex-wrap">
          <div className="flex items-center gap-1">
            <button
              onClick={onExtend}
              className="rounded-lg border border-gray-600 px-3 py-1.5 text-gray-300 text-[11px] hover:border-blue-500 hover:text-blue-400 transition-colors"
            >
              Extend (+2 min)
            </button>
            <WhyBtn onClick={onSignalWhy} />
          </div>
          <div className="flex items-center gap-1 flex-1">
            <button
              onClick={() => onSubmit(challenges)}
              className="flex-1 rounded-lg bg-blue-600 px-3 py-1.5 font-medium text-white text-[11px] hover:bg-blue-500 transition-colors"
            >
              Submit Challenges
            </button>
            <WhyBtn onClick={onUpdateWhy} />
          </div>
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

function specialistFromFindingId(id: string): string {
  const prefix = id.split('-')[0];
  const map: Record<string, string> = {
    ironjaw: 'IRONJAW',
    barnacle: 'BARNACLE',
    greenhand: 'GREENHAND',
  };
  return map[prefix] ?? prefix.toUpperCase();
}

function ArbitrationPanel({
  specialists,
  arbitrations,
  onWhyClick,
}: {
  specialists: Specialists;
  arbitrations: ArbitrationState[];
  onWhyClick: () => void;
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
      <div className="flex items-center gap-2">
        <p className="text-xs text-gray-500 uppercase tracking-widest">
          Arbitration
        </p>
        <WhyBtn onClick={onWhyClick} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {arbitrations.map((arb) => {
          const finding = findFinding(arb.findingId);
          const specialistName = specialistFromFindingId(arb.findingId);
          return (
            <div
              key={arb.findingId}
              className={`animate-fade-in-up rounded-xl border-2 p-3 text-xs bg-gray-900 transition-all duration-300 ${
                arb.status === 'running'
                  ? 'border-blue-500'
                  : arb.ruling === 'upheld'
                    ? 'border-red-700'
                    : arb.ruling === 'overturned'
                      ? 'border-green-700'
                      : 'border-gray-600'
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                {arb.status === 'running' ? (
                  <span className="h-2 w-2 animate-pulse rounded-full bg-blue-400 shrink-0" />
                ) : arb.ruling === 'upheld' ? (
                  <span className="h-2 w-2 rounded-full bg-red-400 shrink-0" />
                ) : arb.ruling === 'overturned' ? (
                  <span className="h-2 w-2 rounded-full bg-green-400 shrink-0" />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-gray-500 shrink-0" />
                )}
                <span className="font-bold text-gray-100 uppercase tracking-wide text-[10px]">
                  Arbitrator
                </span>
                <span className="text-gray-500 text-[9px]">
                  {specialistName}&apos;s finding
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
                    THE MUTINEER
                  </span>
                )}
                {arb.challengeSources.includes('human') && (
                  <span className="rounded border border-blue-700 bg-blue-900/30 px-1 py-0.5 text-[9px] text-blue-300">
                    Human
                  </span>
                )}
              </div>
              {arb.status === 'running' && (
                <p className="text-blue-400 italic">
                  Deliberating<span className="animate-pulse">…</span>
                </p>
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

// ── Synthesis Panel ────────────────────────────────────────────────────────────

function verdictRulingBadge(ruling?: VerdictFinding['ruling']) {
  if (!ruling) return null;
  const cfg: Record<string, { bg: string; text: string }> = {
    upheld: { bg: 'bg-red-900 border-red-700', text: 'text-red-300' },
    overturned: { bg: 'bg-green-900 border-green-700', text: 'text-green-300' },
    inconclusive: { bg: 'bg-gray-800 border-gray-600', text: 'text-gray-400' },
  };
  const s = cfg[ruling] ?? cfg['inconclusive'];
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${s.bg} ${s.text}`}
    >
      {ruling}
    </span>
  );
}

function SynthesisPanel({
  status,
  partialOutput,
  verdict,
  onWhyClick,
}: {
  status: SynthesisStatus;
  partialOutput?: string;
  verdict?: SynthesisVerdict;
  onWhyClick: () => void;
}) {
  const borderColor =
    status === 'complete'
      ? 'border-purple-500'
      : status === 'running'
        ? 'border-blue-500'
        : status === 'failed'
          ? 'border-red-500'
          : 'border-gray-600';

  const grouped = verdict
    ? {
        critical: verdict.findings.filter((f) => f.severity === 'critical'),
        major: verdict.findings.filter((f) => f.severity === 'major'),
        minor: verdict.findings.filter((f) => f.severity === 'minor'),
      }
    : null;

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500 uppercase tracking-widest">
        Synthesis
      </p>
      <div
        className={`rounded-xl border-2 p-4 text-xs bg-gray-900 transition-all duration-300 ${borderColor}`}
      >
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          {status === 'running' ? (
            <span className="h-2 w-2 animate-pulse rounded-full bg-blue-400 shrink-0" />
          ) : status === 'complete' ? (
            <span className="h-2 w-2 rounded-full bg-purple-400 shrink-0" />
          ) : status === 'failed' ? (
            <span className="h-2 w-2 rounded-full bg-red-400 shrink-0" />
          ) : (
            <span className="h-2 w-2 rounded-full bg-gray-500 shrink-0" />
          )}
          <span className="font-bold text-gray-100 uppercase tracking-wide">
            Synthesis
          </span>
          <WhyBtn onClick={onWhyClick} />
          {status === 'complete' && verdict && (
            <span className="ml-auto text-purple-400 text-[10px]">
              {verdict.findings.length} finding
              {verdict.findings.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <p className="text-gray-500 text-[10px] italic mb-2">
          Reads all findings and all arbitration rulings. Reconciles everything into a structured verdict.
        </p>

        {status === 'running' && partialOutput && (
          <div className="rounded bg-gray-800 p-2 max-h-32 overflow-hidden text-gray-300 leading-relaxed mb-2">
            <span className="line-clamp-6">{partialOutput}</span>
            <span className="animate-pulse">▋</span>
          </div>
        )}
        {status === 'running' && !partialOutput && (
          <p className="text-blue-400 italic">
            Reconciling all findings<span className="animate-pulse">…</span>
          </p>
        )}
        {status === 'failed' && (
          <p className="text-red-400 italic">Synthesis failed.</p>
        )}

        {status === 'complete' && verdict && (
          <div className="space-y-3">
            {verdict.summary && (
              <p className="text-gray-300 leading-relaxed border-l-2 border-purple-700 pl-3">
                {verdict.summary}
              </p>
            )}

            {grouped && grouped.critical.length > 0 && (
              <div>
                <p className="text-red-400 text-[10px] uppercase font-semibold mb-1">
                  Critical
                </p>
                <VerdictFindingList findings={grouped.critical} />
              </div>
            )}
            {grouped && grouped.major.length > 0 && (
              <div>
                <p className="text-orange-400 text-[10px] uppercase font-semibold mb-1">
                  Major
                </p>
                <VerdictFindingList findings={grouped.major} />
              </div>
            )}
            {grouped && grouped.minor.length > 0 && (
              <div>
                <p className="text-yellow-400 text-[10px] uppercase font-semibold mb-1">
                  Minor
                </p>
                <VerdictFindingList findings={grouped.minor} />
              </div>
            )}
            {grouped &&
              grouped.critical.length === 0 &&
              grouped.major.length === 0 &&
              grouped.minor.length === 0 && (
                <p className="text-gray-500 italic">No findings.</p>
              )}
          </div>
        )}
      </div>
    </div>
  );
}

function VerdictFindingList({ findings }: { findings: VerdictFinding[] }) {
  return (
    <ul className="space-y-2">
      {findings.map((f, i) => (
        <li key={i} className="rounded-lg bg-gray-800 p-3 space-y-1.5">
          <div className="flex items-start gap-2 flex-wrap">
            <span className="text-gray-400 text-[9px] font-mono uppercase font-semibold">
              {f.specialist.toUpperCase()}
            </span>
            {verdictRulingBadge(f.ruling)}
            {f.challengeSources && f.challengeSources.length > 0 && (
              <div className="flex gap-1">
                {f.challengeSources.includes('mutineer') && (
                  <span className="rounded border border-orange-700 bg-orange-900/30 px-1 py-0.5 text-[9px] text-orange-300">
                    THE MUTINEER
                  </span>
                )}
                {f.challengeSources.includes('human') && (
                  <span className="rounded border border-blue-700 bg-blue-900/30 px-1 py-0.5 text-[9px] text-blue-300">
                    Human
                  </span>
                )}
              </div>
            )}
          </div>
          <p className="text-gray-300">{f.description}</p>
          <p className="text-gray-500 text-[10px]">
            <span className="text-gray-600">Rec:</span> {f.recommendation}
          </p>
        </li>
      ))}
    </ul>
  );
}

// ── History Sidebar ────────────────────────────────────────────────────────────

interface HistorySummary {
  id: number;
  prTitle: string;
  repoName: string;
  completedAt: string;
  findingCount: number;
}

function HistoryModal({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (id: number) => void;
}) {
  const [items, setItems] = useState<HistorySummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/review/history')
      .then((r) => r.json())
      .then((data: HistorySummary[]) => {
        setItems(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-full max-w-lg rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-gray-100 uppercase tracking-widest">
            Review History
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {loading && <p className="text-gray-500 text-sm">Loading…</p>}
        {!loading && items.length === 0 && (
          <p className="text-gray-500 text-sm italic">No reviews yet.</p>
        )}
        {!loading && items.length > 0 && (
          <ul className="space-y-2 max-h-96 overflow-y-auto">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => {
                    onSelect(item.id);
                    onClose();
                  }}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 p-3 text-left hover:border-purple-600 transition-colors"
                >
                  <p className="text-gray-200 text-xs font-medium">
                    {item.prTitle || 'Untitled PR'}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-gray-500 text-[10px]">
                      {item.repoName}
                    </span>
                    <span className="text-purple-400 text-[10px]">
                      {item.findingCount} finding
                      {item.findingCount !== 1 ? 's' : ''}
                    </span>
                    <span className="text-gray-600 text-[10px] ml-auto">
                      {new Date(item.completedAt).toLocaleDateString()}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Past Review Viewer ─────────────────────────────────────────────────────────

interface PastReview {
  id: number;
  prUrl: string;
  prTitle: string;
  repoName: string;
  completedAt: string;
  verdict: SynthesisVerdict;
}

function PastReviewPanel({
  review,
  onClose,
}: {
  review: PastReview;
  onClose: () => void;
}) {
  const verdict = review.verdict;
  const grouped = {
    critical: verdict.findings.filter((f) => f.severity === 'critical'),
    major: verdict.findings.filter((f) => f.severity === 'major'),
    minor: verdict.findings.filter((f) => f.severity === 'minor'),
  };

  const handleDownload = () => {
    const blob = new Blob([JSON.stringify(review, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `parley-review-${review.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 rounded-xl border border-purple-800/50 bg-gray-900 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-purple-500" />
          <span className="font-medium text-gray-200">Past Review</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownload}
            className="rounded-lg border border-gray-600 px-3 py-1.5 text-gray-300 text-[11px] hover:border-purple-500 hover:text-purple-400 transition-colors"
          >
            Download JSON
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-gray-400 text-[11px] hover:border-gray-500 transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      <div className="rounded-lg bg-gray-800 p-4">
        <p className="text-sm text-gray-400">
          {review.repoName} —{' '}
          {new Date(review.completedAt).toLocaleString()}
        </p>
        <p className="mt-1 font-medium text-gray-200">{review.prTitle}</p>
      </div>

      {verdict.summary && (
        <p className="text-gray-300 text-sm leading-relaxed border-l-2 border-purple-700 pl-3">
          {verdict.summary}
        </p>
      )}

      {(['critical', 'major', 'minor'] as const).map((sev) => {
        const group = grouped[sev];
        if (group.length === 0) return null;
        return (
          <div key={sev}>
            <p
              className={`text-xs uppercase font-semibold mb-2 ${
                sev === 'critical'
                  ? 'text-red-400'
                  : sev === 'major'
                    ? 'text-orange-400'
                    : 'text-yellow-400'
              }`}
            >
              {sev}
            </p>
            <VerdictFindingList findings={group} />
          </div>
        );
      })}
    </div>
  );
}

// ── Event Log ──────────────────────────────────────────────────────────────────

function EventLog({ entries }: { entries: string[] }) {
  const logRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new entries appear
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [entries]);

  if (entries.length === 0) return null;

  return (
    <div className="space-y-1">
      <p className="text-xs text-gray-500 uppercase tracking-widest">
        Event Stream
      </p>
      <div
        ref={logRef}
        className="rounded-lg border border-gray-800 bg-gray-950 p-3 max-h-36 overflow-y-auto space-y-0.5"
      >
        {entries.map((entry, i) => (
          <p key={i} className="text-[11px] text-gray-400 font-mono">
            {entry}
          </p>
        ))}
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
  const [showHistory, setShowHistory] = useState(false);
  const [pastReview, setPastReview] = useState<PastReview | null>(null);
  const [selectedWhy, setSelectedWhy] = useState<string | null>(null);
  const [eventLog, setEventLog] = useState<string[]>([]);
  const prevStateRef = useRef<AppState>({ type: 'floor-open' });
  const eventSourceRef = useRef<EventSource | null>(null);

  // Reset submitted flag when a new review starts
  useEffect(() => {
    if (state.type === 'floor-open') {
      setChallengesSubmitted(false);
      setPastReview(null);
      setEventLog([]);
    }
  }, [state.type]);

  // Track state transitions → semantic event log entries
  useEffect(() => {
    const prev = prevStateRef.current;
    const curr = state;
    const newEntries: string[] = [];

    // Review started
    if (prev.type === 'floor-open' && curr.type === 'running') {
      newEntries.push('🚀 Review started — fetching PR diff');
    }

    // PR fetched
    if (
      curr.type === 'running' &&
      curr.title &&
      !('title' in prev && prev.title)
    ) {
      newEntries.push(
        `🔍 PR fetched: "${curr.title}" (${curr.repoName} #${curr.prNumber})`
      );
      newEntries.push('🚢 Crew dispatched — IRONJAW, BARNACLE, GREENHAND running');
    }

    // Specialist completions
    if (curr.type === 'running' && curr.specialists) {
      const prevSpec =
        'specialists' in prev ? (prev as RunningState).specialists : undefined;
      for (const [name, sp] of Object.entries(curr.specialists) as Array<
        [string, SpecialistState]
      >) {
        const prevSp = prevSpec?.[name as keyof Specialists];
        if (prevSp?.status !== 'complete' && sp.status === 'complete') {
          const count = sp.findings?.length ?? 0;
          newEntries.push(
            `✅ ${name.toUpperCase()}: ${count} finding${count !== 1 ? 's' : ''} filed`
          );
        }
        if (prevSp?.status !== 'timed-out' && sp.status === 'timed-out') {
          newEntries.push(`⏱ ${name.toUpperCase()}: timed out after 45s`);
        }
        if (prevSp?.status !== 'failed' && sp.status === 'failed') {
          newEntries.push(`💥 ${name.toUpperCase()}: failed after 3 attempts`);
        }
      }
    }

    // Challenge window opened
    const prevWindowOpen =
      'windowOpen' in prev ? (prev as RunningState).windowOpen : false;
    const currWindowOpen =
      'windowOpen' in curr ? (curr as RunningState).windowOpen : false;
    if (!prevWindowOpen && currWindowOpen) {
      newEntries.push('⚔️ Challenge window open — 10 minutes');
      newEntries.push('🏴\u200d☠️ THE MUTINEER reviewing findings independently');
    }

    // Mutineer complete
    const prevMutineer =
      'mutineerStatus' in prev
        ? (prev as RunningState).mutineerStatus
        : undefined;
    const currMutineer =
      'mutineerStatus' in curr
        ? (curr as RunningState).mutineerStatus
        : undefined;
    if (prevMutineer !== 'complete' && currMutineer === 'complete') {
      const count = (curr as RunningState).mutineerChallenges?.length ?? 0;
      newEntries.push(
        `🏴\u200d☠️ THE MUTINEER challenged ${count} finding${count !== 1 ? 's' : ''}`
      );
    }

    // Arbitrations resolved
    const prevArbs =
      'arbitrations' in prev
        ? ((prev as RunningState).arbitrations ?? [])
        : [];
    const currArbs =
      'arbitrations' in curr
        ? ((curr as RunningState).arbitrations ?? [])
        : [];
    for (const arb of currArbs) {
      const prevArb = prevArbs.find((a) => a.findingId === arb.findingId);
      if (prevArb?.status !== 'complete' && arb.status === 'complete' && arb.ruling) {
        const specialist = specialistFromFindingId(arb.findingId);
        const rulingLabel =
          arb.ruling === 'upheld'
            ? '🔴 upheld'
            : arb.ruling === 'overturned'
              ? '🟢 overturned'
              : '⚪ inconclusive';
        newEntries.push(`⚖️ ${specialist}'s finding: ${rulingLabel}`);
      }
      // New arbitration slot appeared
      if (!prevArb && arb.status !== 'complete') {
        const specialist = specialistFromFindingId(arb.findingId);
        const sources = arb.challengeSources
          .map((s) => (s === 'mutineer' ? 'THE MUTINEER' : 'Human'))
          .join(' + ');
        newEntries.push(
          `⚖️ Arbitrating ${specialist}'s finding — challenged by ${sources}`
        );
      }
    }

    // Synthesis started
    const prevSynth =
      'synthesisStatus' in prev
        ? (prev as RunningState).synthesisStatus
        : undefined;
    const currSynth =
      'synthesisStatus' in curr
        ? (curr as RunningState).synthesisStatus
        : undefined;
    if (prevSynth !== 'running' && currSynth === 'running') {
      newEntries.push('🔮 Synthesis running — reconciling all findings');
    }
    if (prevSynth !== 'complete' && currSynth === 'complete') {
      const count = (curr as RunningState).verdict?.findings.length ?? 0;
      newEntries.push(
        `✅ Synthesis complete — ${count} finding${count !== 1 ? 's' : ''} in verdict`
      );
    }
    if (prevSynth !== 'failed' && currSynth === 'failed') {
      newEntries.push('💥 Synthesis failed');
    }

    // Review complete
    if (prev.type !== 'complete' && curr.type === 'complete') {
      newEntries.push('🎉 Review complete — floor reopening');
    }

    if (newEntries.length > 0) {
      setEventLog((prev) => [...prev, ...newEntries]);
    }

    prevStateRef.current = curr;
  }, [state]);

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
    setEventLog((prev) => [...prev, '⚡ Window extended (+2 min)']);
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
        setEventLog((prev) => [...prev, '📝 Challenges submitted']);
      }
    },
    []
  );

  const handleSelectHistory = useCallback(async (id: number) => {
    const res = await fetch(`/api/review/history/${id}`);
    if (res.ok) {
      const data = await res.json();
      setPastReview(data as PastReview);
    }
  }, []);

  const handleDownloadCurrent = useCallback(
    (currentState: RunningState | CompleteState) => {
      const blob = new Blob([JSON.stringify(currentState, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `parley-review-current.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    []
  );

  const handleWhyClick = useCallback((key: string) => {
    setSelectedWhy(key);
  }, []);

  const showChallengePhase =
    (state.type === 'running' || state.type === 'complete') &&
    (state.windowOpen === true ||
      challengesSubmitted ||
      (state.mutineerStatus && state.mutineerStatus !== 'pending') ||
      (state.arbitrations && state.arbitrations.length > 0));

  const showSynthesisPhase =
    (state.type === 'running' || state.type === 'complete') &&
    state.synthesisStatus &&
    state.synthesisStatus !== 'pending';

  const showEventLog =
    (state.type === 'running' || state.type === 'complete') &&
    eventLog.length > 0;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      {showHistory && (
        <HistoryModal
          onClose={() => setShowHistory(false)}
          onSelect={handleSelectHistory}
        />
      )}

      {selectedWhy && (
        <WhyDrawer
          whyKey={selectedWhy}
          onClose={() => setSelectedWhy(null)}
        />
      )}

      <div className="w-full max-w-4xl space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">Parley</h1>
            <p className="mt-1 text-gray-400">Adversarial Code Review</p>
          </div>
          <button
            onClick={() => setShowHistory(true)}
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 hover:border-gray-500 hover:text-gray-200 transition-colors"
          >
            History
          </button>
        </header>

        {/* Past review viewer */}
        {pastReview && state.type === 'floor-open' && (
          <PastReviewPanel
            review={pastReview}
            onClose={() => setPastReview(null)}
          />
        )}

        {state.type === 'floor-open' && !pastReview && (
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
            <div className="flex items-center justify-between">
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
              {state.type === 'complete' && (
                <button
                  onClick={() => handleDownloadCurrent(state)}
                  className="rounded-lg border border-gray-600 px-3 py-1.5 text-gray-300 text-[11px] hover:border-purple-500 hover:text-purple-400 transition-colors"
                >
                  Download JSON
                </button>
              )}
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
                <p className="text-sm text-gray-400">Fetching PR details<span className="animate-pulse">…</span></p>
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
                  <span className="ml-2 text-gray-600 normal-case tracking-normal font-normal">
                    (click any node to learn more)
                  </span>
                </p>
                <SpecialistDAG
                  specialists={state.specialists}
                  onWhyClick={handleWhyClick}
                />
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
                    onWhyClick={() => handleWhyClick('mutineer')}
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
                      onSignalWhy={() => handleWhyClick('signal')}
                      onUpdateWhy={() => handleWhyClick('update')}
                    />
                  )}
                </div>

                {state.arbitrations && state.arbitrations.length > 0 && (
                  <ArbitrationPanel
                    specialists={state.specialists}
                    arbitrations={state.arbitrations}
                    onWhyClick={() => handleWhyClick('arbitrator')}
                  />
                )}
              </>
            )}

            {/* Synthesis phase */}
            {showSynthesisPhase && (
              <SynthesisPanel
                status={state.synthesisStatus ?? 'pending'}
                partialOutput={state.synthesisPartialOutput}
                verdict={state.verdict}
                onWhyClick={() => handleWhyClick('synthesis')}
              />
            )}

            {state.type === 'complete' && !showSynthesisPhase && (
              <p className="text-sm text-green-400">
                Done. The floor will reopen shortly.
              </p>
            )}

            {/* Event log */}
            {showEventLog && <EventLog entries={eventLog} />}
          </div>
        )}
      </div>
    </main>
  );
}
