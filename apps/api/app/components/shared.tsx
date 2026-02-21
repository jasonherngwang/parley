import React from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

export type SpecialistStatus =
  | 'pending'
  | 'running'
  | 'complete'
  | 'timed-out'
  | 'failed';

export type MutineerStatus = 'pending' | 'running' | 'complete' | 'failed';

export type SynthesisStatus = 'pending' | 'running' | 'complete' | 'failed';

export interface Finding {
  id: string;
  severity: 'critical' | 'major' | 'minor';
  description: string;
  lineReference?: number;
  recommendation: string;
}

export interface SpecialistState {
  status: SpecialistStatus;
  attemptNumber: number;
  partialOutput?: string;
  findings: Finding[] | null;
}

export interface MutineerChallenge {
  findingId: string;
  specialistName: string;
  challengeText: string;
}

export interface ArbitrationState {
  findingId: string;
  status: 'pending' | 'running' | 'complete';
  ruling?: 'upheld' | 'overturned' | 'inconclusive';
  reasoning?: string;
  challengeSources: Array<'mutineer' | 'human'>;
}

export interface VerdictFinding {
  severity: 'critical' | 'major' | 'minor';
  specialist: string;
  description: string;
  ruling?: 'upheld' | 'overturned' | 'inconclusive';
  challengeSources?: Array<'mutineer' | 'human'>;
  recommendation: string;
}

export interface SynthesisVerdict {
  findings: VerdictFinding[];
  summary: string;
}

export interface Specialists {
  ironjaw: SpecialistState;
  barnacle: SpecialistState;
  greenhand: SpecialistState;
}

export type FloorOpenState = { type: 'floor-open' };
export type RunningState = {
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
export type CompleteState = {
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
export type AppState = FloorOpenState | RunningState | CompleteState;

export interface HistorySummary {
  id: number;
  prTitle: string;
  repoName: string;
  completedAt: string;
  findingCount: number;
}

export interface PastReview {
  id: number;
  prUrl: string;
  prTitle: string;
  repoName: string;
  completedAt: string;
  verdict: SynthesisVerdict;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

export function statusColor(status: SpecialistStatus): string {
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

export function statusDot(status: SpecialistStatus) {
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

export function specialistFromFindingId(id: string): string {
  const prefix = id.split('-')[0];
  const map: Record<string, string> = {
    ironjaw: 'IRONJAW',
    barnacle: 'BARNACLE',
    greenhand: 'GREENHAND',
  };
  return map[prefix] ?? prefix.toUpperCase();
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function rulingBadge(ruling?: ArbitrationState['ruling']) {
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

export function verdictRulingBadge(ruling?: VerdictFinding['ruling']) {
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

// ── Temporal primitive badges ──────────────────────────────────────────────────

export function ActivityBadge({ deep }: { deep?: boolean }) {
  return deep ? (
    <span className="rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-purple-900 text-purple-300 border-purple-700">
      Activity &middot; deep queue
    </span>
  ) : (
    <span className="rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-blue-900 text-blue-300 border-blue-700">
      Activity
    </span>
  );
}

export function TimerBadge() {
  return (
    <span className="rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-teal-900 text-teal-300 border-teal-700">
      Timer
    </span>
  );
}

export function SignalBadge() {
  return (
    <span className="rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-amber-900 text-amber-300 border-amber-700">
      Signal
    </span>
  );
}

export function UpdateBadge() {
  return (
    <span className="rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-violet-900 text-violet-300 border-violet-700">
      Update
    </span>
  );
}

// ── Educational "Why" content ──────────────────────────────────────────────────

export interface WhyCopy {
  title: string;
  paragraphs: string[];
}

export const WHY_COPY: Record<string, WhyCopy> = {
  pr: {
    title: 'Workflow Input — PR Submission',
    paragraphs: [
      'This node represents the workflow input. The PR URL is validated, then the diff is fetched via a Temporal Activity (fetchGitHubPRDiff).',
      'If the fetch fails (network error, private repo), Temporal retries up to 2 times with 1-second backoff before reporting an error.',
    ],
  },
  'specialist-ironjaw': {
    title: 'IRONJAW — Security Auditor',
    paragraphs: [
      'IRONJAW is a Temporal Activity \u2014 a regular async function that can fail, be retried, and heartbeat progress back to the workflow.',
      'Retry policy: up to 3 attempts, 2-second backoff that doubles each retry. Heartbeat timeout: 15 seconds. If no heartbeat arrives within that window, Temporal assumes the activity is stuck and re-schedules it on another worker.',
      'Why the fast queue? Gemini Flash Lite is lightweight and fast \u2014 ideal for running three reviewers in parallel without burning through budget.',
      'If this worker crashes right now, Temporal detects the missed heartbeat within 15 seconds and automatically re-dispatches the activity to another available worker. Your workflow state is safe.',
    ],
  },
  'specialist-barnacle': {
    title: 'BARNACLE — Complexity Skeptic',
    paragraphs: [
      'BARNACLE is a Temporal Activity running on the same fast task queue as IRONJAW and GREENHAND. All three start simultaneously the moment the PR diff is fetched.',
      'Retry policy: up to 3 attempts, 2-second initial backoff with exponential increase. Heartbeat timeout: 15 seconds.',
      'BARNACLE streams its ship\'s log back to the workflow via heartbeat metadata, which is forwarded to the UI as partial output in real time.',
      'The finding schema enforces structured output: severity, description, line reference, and recommendation \u2014 extracted via a second LLM call after streaming completes.',
    ],
  },
  'specialist-greenhand': {
    title: 'GREENHAND — Domain Reviewer',
    paragraphs: [
      'GREENHAND is the third parallel specialist Activity, reading the diff from a junior\'s literal perspective.',
      'All three specialists are dispatched with Promise.all \u2014 if one is rate-limited or slow, the other two proceed independently.',
      'Each specialist is wrapped in a CancellationScope.withTimeout(45s). If the 45-second deadline passes, Temporal cancels the scope and marks the slot timed-out \u2014 the join gate still fires when the other two complete.',
      'Finding IDs are prefixed by specialist: greenhand-1, greenhand-2, etc. This makes it easy to trace a finding through the arbitration and synthesis stages.',
    ],
  },
  joingate: {
    title: 'Join Gate — Synchronization Barrier',
    paragraphs: [
      'A join gate waits for all upstream activities to complete (or time out) before the workflow proceeds.',
      'This is implemented with Promise.all in the workflow code. Temporal guarantees that even if a worker crashes mid-wait, the gate state is fully reconstructed on replay.',
      'Each completed input fills a progress segment. When all inputs resolve, the gate opens and the next pipeline stage begins.',
    ],
  },
  mutineer: {
    title: 'THE MUTINEER — Dispute Orchestrator',
    paragraphs: [
      'THE MUTINEER runs in parallel with the human review window. It independently decides which findings to challenge \u2014 it doesn\'t fill in for the human, it has its own opinion.',
      'Both THE MUTINEER and the human can challenge the same finding. The arbitrator receives all challenges for a finding and rules once \u2014 it sees whether the challenge came from Mutineer, human, or both.',
      'This is also a Temporal Activity: same retry policy as the specialists, on the fast queue. The Mutineer streams its reasoning back via heartbeat, just like the specialists do.',
    ],
  },
  humanwindow: {
    title: 'Human Review Window — Timer + Signal + Update',
    paragraphs: [
      'This node demonstrates three Temporal primitives in one place.',
      'The countdown is a durable Timer (wf.sleep). If the server restarts, the timer resumes exactly where it left off \u2014 no time drift.',
      'The "Extend" button sends a Signal: fire-and-forget, no validation, no response. The event is in Temporal history the instant it arrives.',
      'The "Submit" button sends an Update: synchronous, validated, acknowledged. The workflow confirms acceptance before the UI shows success.',
    ],
  },
  signal: {
    title: 'Signal — Extend Window',
    paragraphs: [
      'Fire-and-forget. No validation, no response. The workflow receives the Signal and adds 2 minutes to the countdown.',
      'Durable: this event is recorded in Temporal\'s event history the instant it arrives \u2014 even before the workflow task has processed it.',
      'Because Signals are asynchronous, there is no way to reject one from the caller\'s side. Any validation must happen inside the workflow handler after the fact.',
      'The Signal handler is registered before any await in the workflow, so it can never be missed \u2014 even if the Signal arrives while the workflow is processing something else.',
    ],
  },
  update: {
    title: 'Update — Submit Challenges',
    paragraphs: [
      'Synchronous and acknowledged. Unlike a Signal, an Update waits for the workflow to accept or reject the request before returning to the caller.',
      'The workflow processed your challenge map and stored it in state. You received { accepted: true } because the Update handler completed successfully.',
      'If the workflow had rejected the Update (for example, because the window was already closed), you would have received an error response instead.',
      'Updates are recorded in Temporal\'s event history just like Signals \u2014 fully durable and replayable during workflow reconstruction.',
    ],
  },
  arbitrator: {
    title: 'Arbitrator — Dynamic Dispatch',
    paragraphs: [
      'One Arbitrator Activity is dispatched per disputed finding. The exact count is not known until both THE MUTINEER and the human review window have closed.',
      'All arbitrators run in parallel \u2014 a finding challenged by both Mutineer and human resolves at the same time as one challenged only by the Mutineer.',
      'Gemini Flash Lite is sufficient here: the ruling is bounded (upheld / overturned / inconclusive) and the arbitrator weighs at most two short challenge arguments against the original finding.',
      'If all retry attempts are exhausted, the ruling falls back to "inconclusive" \u2014 the workflow continues regardless. A single arbitrator failure never blocks the review.',
    ],
  },
  synthesis: {
    title: 'Synthesis — Final Verdict',
    paragraphs: [
      'Synthesis reads every specialist finding and every arbitration outcome, then reconciles them into a single structured verdict.',
      'This is the only activity on the review-deep task queue. It uses Gemini Pro \u2014 the heavier model is warranted for the holistic reconciliation step where all evidence must be weighed together.',
      'Synthesis streams its reasoning back via heartbeat, then produces a structured verdict with per-finding severity, ruling, challenge sources, and recommendation.',
      'The workflow waits for all signal/update handlers to finish before calling Synthesis \u2014 ensuring the final state snapshot is complete before the verdict is generated.',
    ],
  },
};

// ── Specialist metadata ────────────────────────────────────────────────────────

export const SPECIALISTS: Array<{
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
