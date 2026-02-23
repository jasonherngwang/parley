import React from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

export type SpecialistStatus =
  | 'pending'
  | 'running'
  | 'complete'
  | 'failed';

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
  partialOutput?: string;
  findings: Finding[] | null;
}

export type MutineerVerdict = 'agree' | 'disagree' | 'partial';

export interface FindingLifecycle {
  findingId: string;
  specialist: string;
  severity: 'critical' | 'major' | 'minor';
  description: string;
  recommendation: string;
  childWorkflowId: string;
  childStatus: 'started' | 'complete' | 'failed';
  mutineerChallenge?: string | null;
  mutineerVerdict?: MutineerVerdict;
  mutineerFailed?: boolean;
  humanChallenge?: string | null;
  ruling?: 'upheld' | 'overturned' | 'accepted';
  reasoning?: string;
  arbiterMutineerStance?: 'agrees' | 'disagrees' | 'mixed';
  arbiterHumanStance?: 'agrees' | 'disagrees' | 'mixed';
}

export interface VerdictFinding {
  severity: 'critical' | 'major' | 'minor';
  specialist: string;
  ruling: 'upheld' | 'overturned' | 'accepted';
  finding: string;
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

export interface PhaseTiming {
  fetchStartedAt?: string;
  specialistsStartedAt?: string;
  specialistsCompletedAt?: string;
  findingsStartedAt?: string;
  findingsCompletedAt?: string;
  synthesisStartedAt?: string;
  completedAt?: string;
}

export interface TemporalMeta {
  workflowId: string;
  runId: string;
  taskQueue: string;
  historyLength: number;
  startedAt: string;
  continueAsNewCount: number;
  phaseTiming: PhaseTiming;
}

export type FloorOpenState = { type: 'floor-open' };
export type RunningState = {
  type: 'running';
  prUrl: string;
  title?: string;
  repoName?: string;
  prNumber?: number;
  fetchError?: string;
  specialists?: Specialists;
  findings?: FindingLifecycle[];
  windowOpen?: boolean;
  secondsRemaining?: number;
  humanChallenges?: Record<string, string>;
  synthesisStatus?: SynthesisStatus;
  synthesisPartialOutput?: string;
  verdict?: SynthesisVerdict;
  temporal?: TemporalMeta;
};
export type CompleteState = {
  type: 'complete';
  prUrl: string;
  title?: string;
  repoName?: string;
  prNumber?: number;
  fetchError?: string;
  specialists?: Specialists;
  findings?: FindingLifecycle[];
  windowOpen?: boolean;
  secondsRemaining?: number;
  synthesisStatus?: SynthesisStatus;
  synthesisPartialOutput?: string;
  verdict?: SynthesisVerdict;
  temporal?: TemporalMeta;
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
      return 'border-border-default bg-surface-1';
    case 'running':
      return 'border-accent/50 bg-surface-1';
    case 'complete':
      return 'border-status-done/40 bg-surface-1';
    case 'failed':
      return 'border-status-fail/50 bg-surface-1';
  }
}

export function statusDot(status: SpecialistStatus) {
  switch (status) {
    case 'pending':
      return <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: 'var(--color-text-ghost)' }} />;
    case 'running':
      return (
        <span
          className="h-2.5 w-2.5 rounded-full shrink-0 animate-status-pulse"
          style={{ backgroundColor: 'var(--color-accent)' }}
        />
      );
    case 'complete':
      return <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: 'var(--color-status-done)' }} />;
    case 'failed':
      return <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: 'var(--color-status-fail)' }} />;
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

export function findingRulingBadge(ruling?: FindingLifecycle['ruling']) {
  if (!ruling) return null;
  const colors: Record<string, string> = {
    upheld: 'text-status-fail',
    overturned: 'text-status-done',
    accepted: 'text-text-tertiary',
  };
  return (
    <span
      className={`text-[10px] font-semibold uppercase tracking-wide font-heading ${colors[ruling] ?? colors['accepted']}`}
    >
      {ruling}
    </span>
  );
}

export function verdictRulingBadge(ruling?: FindingLifecycle['ruling']) {
  if (!ruling) return null;
  const colors: Record<string, string> = {
    upheld: 'text-status-fail',
    overturned: 'text-status-done',
    accepted: 'text-text-tertiary',
  };
  return (
    <span
      className={`text-[10px] font-semibold uppercase tracking-wide font-heading ${colors[ruling] ?? colors['accepted']}`}
    >
      {ruling}
    </span>
  );
}

// ── Temporal primitive badges ──────────────────────────────────────────────────

const badgeBase = 'rounded-full border border-border-default bg-surface-2 px-2 py-0.5 text-[10px] font-mono text-text-tertiary';

export function ActivityBadge({ deep }: { deep?: boolean }) {
  return (
    <span className={badgeBase}>
      {deep ? 'Activity · deep queue' : 'Activity'}
    </span>
  );
}

export function ChildWorkflowBadge() {
  return <span className={badgeBase}>Child Workflow</span>;
}

export function TimerBadge() {
  return <span className={badgeBase}>Timer</span>;
}

export function SignalBadge() {
  return <span className={badgeBase}>Signal</span>;
}

export function UpdateBadge() {
  return <span className={badgeBase}>Update</span>;
}

// ── InfoButton ───────────────────────────────────────────────────────────────

export function InfoButton({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      className="absolute top-2 right-2 h-5 w-5 rounded-full border border-border-default bg-surface-2 text-text-tertiary hover:border-accent/50 hover:text-accent transition-colors flex items-center justify-center text-[10px] font-bold leading-none z-10 noDrag"
      style={{ fontFamily: 'var(--font-mono)' }}
      title="What's this?"
      aria-label="Learn more"
    >
      i
    </button>
  );
}

// ── FindingIdBadge ───────────────────────────────────────────────────────────

export const SPECIALIST_BADGE_COLORS: Record<string, string> = {
  ironjaw: 'border-[#7A3528] bg-[#7A3528]/10 text-[#C46858]',
  barnacle: 'border-[#365238] bg-[#365238]/10 text-[#628A6A]',
  greenhand: 'border-[#2A4258] bg-[#2A4258]/10 text-[#507898]',
};

export function FindingIdBadge({ findingId }: { findingId: string }) {
  const prefix = findingId.split('-')[0];
  const colors = SPECIALIST_BADGE_COLORS[prefix] ?? 'border-border-default bg-surface-2 text-text-tertiary';
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-semibold tracking-tight shrink-0 ${colors}`}
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      {findingId}
    </span>
  );
}

export const SEVERITY_PRIORITY: Record<string, number> = {
  critical: 0,
  major: 1,
  minor: 2,
};

// ── Educational "Why" content ──────────────────────────────────────────────────

export interface WhyCopy {
  title: string;
  paragraphs: string[];
  config?: Array<{ label: string; value: string }>;
}

export const WHY_COPY: Record<string, WhyCopy> = {
  pr: {
    title: 'PR Fetch',
    paragraphs: [
      'Submitting a PR URL kicks off the review workflow. The diff is fetched from GitHub\'s API — this is a Temporal Activity, the basic unit of retryable, timeout-bounded work.',
      'If the network fails or GitHub rate-limits the request, Temporal retries automatically without the workflow losing its place.',
    ],
    config: [
      { label: 'Task Queue', value: 'review-fast' },
      { label: 'Timeout', value: '45s' },
      { label: 'Heartbeat', value: '15s' },
      { label: 'Retries', value: '2 × 1s backoff' },
    ],
  },
  'specialist-ironjaw': {
    title: 'Ironjaw — Security Researcher',
    paragraphs: [
      'Ironjaw reviews the diff through an attacker\'s eyes: injection flaws, broken authentication, exposed secrets, privilege escalation, SSRF, XSS.',
      'All three specialists are dispatched simultaneously the moment the diff is ready. Each runs as an independent Activity — if one is slow or fails, the others are unaffected.',
      'During the LLM call, the activity sends a periodic liveness ping to Temporal to signal it\'s still running and prevent a timeout. Once the full response is ready, a second LLM call extracts up to two structured findings.',
    ],
    config: [
      { label: 'Task Queue', value: 'review-fast' },
      { label: 'Model', value: 'Gemini Flash Lite' },
      { label: 'Timeout', value: '45s' },
      { label: 'Heartbeat', value: '15s' },
      { label: 'Retries', value: '3 × 2s exp. backoff' },
    ],
  },
  'specialist-barnacle': {
    title: 'Barnacle — Complexity Skeptic',
    paragraphs: [
      'Barnacle has seen every clever abstraction turn into unmaintainable rot. Focuses on over-engineering, hidden coupling, tangled dependencies, and complexity that doesn\'t carry its weight.',
      'All three specialists are dispatched simultaneously the moment the diff is ready. Each runs as an independent Activity — if one is slow or fails, the others are unaffected.',
      'During the LLM call, the activity sends a periodic liveness ping to Temporal to signal it\'s still running and prevent a timeout. Once the full response is ready, a second LLM call extracts up to two structured findings.',
    ],
    config: [
      { label: 'Task Queue', value: 'review-fast' },
      { label: 'Model', value: 'Gemini Flash Lite' },
      { label: 'Timeout', value: '45s' },
      { label: 'Heartbeat', value: '15s' },
      { label: 'Retries', value: '3 × 2s exp. backoff' },
    ],
  },
  'specialist-greenhand': {
    title: 'Greenhand — Junior Reviewer',
    paragraphs: [
      'Greenhand reads the code literally and asks the questions veterans skip over: missing null checks, unhandled errors, unclear names, undocumented assumptions, missing tests.',
      'All three specialists are dispatched simultaneously the moment the diff is ready. Each runs as an independent Activity — if one is slow or fails, the others are unaffected.',
      'During the LLM call, the activity sends a periodic liveness ping to Temporal to signal it\'s still running and prevent a timeout. Once the full response is ready, a second LLM call extracts up to two structured findings.',
    ],
    config: [
      { label: 'Task Queue', value: 'review-fast' },
      { label: 'Model', value: 'Gemini Flash Lite' },
      { label: 'Timeout', value: '45s' },
      { label: 'Heartbeat', value: '15s' },
      { label: 'Retries', value: '3 × 2s exp. backoff' },
    ],
  },
  childWorkflow: {
    title: 'Per-Finding Child Workflow',
    paragraphs: [
      'Each finding gets its own child workflow, spawned by the parent immediately after all specialists complete. The parent fans out to N children — one per finding — and tracks each independently.',
      'Inside each child: the Mutineer runs first, while the human review window is open in the parent. Once the window closes, the parent sends each child the human\'s input. If either the Mutineer or the human filed a challenge, the Arbiter runs. If neither did, the finding is accepted as-is.',
      'Child workflows are isolated — a failure in one doesn\'t affect the parent or any other finding. The parent waits for all children to finish before proceeding to Synthesis.',
    ],
    config: [
      { label: 'Signal in', value: 'provideHumanInput' },
    ],
  },
  humanwindow: {
    title: 'Human Review Window',
    paragraphs: [
      'The countdown is a durable timer. Temporal records the deadline in the workflow\'s event history — if the server restarts mid-countdown, execution resumes exactly where it left off with no drift.',
      '"Extend" sends a Signal — a one-way message the workflow records immediately. The deadline is pushed out by 2 minutes. No acknowledgment is returned.',
      '"Submit" sends an Update — unlike a signal, the workflow validates and acknowledges the submission before the UI marks success. If the window has already closed, the Update returns an error instead of silently dropping the input.',
    ],
    config: [
      { label: 'Timer', value: '10 min (durable)' },
      { label: 'Signal', value: 'extendWindow (+2m)' },
      { label: 'Update', value: 'submitChallenges' },
    ],
  },
  mutineer: {
    title: 'Mutineer — Devil\'s Advocate',
    paragraphs: [
      'The Mutineer scrutinizes each finding against the actual code. It looks for evidence in the diff — does the code really support the finding, or does the finding overstate or misread it?',
      'The Mutineer runs as soon as the child workflow starts, concurrently with the human review window. The AI challenge and the human challenge are gathered in parallel, not sequentially.',
      'If the finding is sound, the Mutineer concedes. The Arbiter only runs if at least one challenge exists — so an unchallenged finding skips arbitration entirely.',
    ],
    config: [
      { label: 'Task Queue', value: 'review-fast' },
      { label: 'Model', value: 'Gemini Flash Lite' },
      { label: 'Timeout', value: '90s' },
      { label: 'Heartbeat', value: '15s' },
      { label: 'Retries', value: '3 × 2s exp. backoff' },
    ],
  },
  arbiter: {
    title: 'Arbiter — The Judge',
    paragraphs: [
      'The Arbiter reads the original finding alongside all submitted challenges and produces a ruling: upheld (the finding stands) or overturned (the finding is dismissed).',
      'It only runs when at least one challenge exists — from the Mutineer, the human reviewer, or both. An unchallenged finding is accepted as-is with no Arbiter call.',
      'The Arbiter has access to the original diff and weighs each challenge on its merits, noting its stance toward the Mutineer and the human separately.',
    ],
    config: [
      { label: 'Task Queue', value: 'review-fast' },
      { label: 'Model', value: 'Gemini Flash Lite' },
      { label: 'Timeout', value: '30s' },
      { label: 'Retries', value: '3 × 2s exp. backoff' },
    ],
  },
  synthesis: {
    title: 'Synthesis',
    paragraphs: [
      'After all child workflows complete, Synthesis reads every specialist finding and every arbitration outcome, then produces a structured verdict: an overall assessment and ranked action items.',
      'It runs on a separate worker pool from the specialists and child workflows. This prevents a slow, expensive Gemini Pro call from tying up workers that need to stay responsive during the review.',
      'The workflow waits until all in-flight signals and updates have fully resolved before invoking Synthesis, so no challenge input can be missed.',
    ],
    config: [
      { label: 'Task Queue', value: 'review-deep' },
      { label: 'Model', value: 'Gemini Pro' },
      { label: 'Timeout', value: '3m' },
      { label: 'Heartbeat', value: '60s' },
      { label: 'Retries', value: '2 × 5s backoff' },
    ],
  },
};

// ── MetaChip ─────────────────────────────────────────────────────────────────

export function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded border border-border-subtle bg-surface-2 px-1.5 py-0.5 text-[9px] text-text-tertiary"
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      <span className="text-text-ghost">{label}</span>
      {value}
    </span>
  );
}

export const NODE_META: Record<string, Array<{ label: string; value: string }>> = {
  pr: [
    { label: 'Queue', value: 'review-fast' },
    { label: 'Timeout', value: '45s' },
    { label: 'Retries', value: '2' },
  ],
  specialist: [
    { label: 'Queue', value: 'review-fast' },
    { label: 'Timeout', value: '45s' },
    { label: 'Heartbeat', value: '15s' },
    { label: 'Retries', value: '3' },
  ],
  finding: [
    { label: 'Type', value: 'ChildWorkflow' },
    { label: 'Queue', value: 'review-fast' },
  ],
  mutineer: [
    { label: 'Type', value: 'Activity' },
    { label: 'Queue', value: 'review-fast' },
    { label: 'Signal', value: 'provideHumanInput' },
  ],
  humanwindow: [
    { label: 'Timer', value: '10m durable' },
    { label: 'Signal', value: 'extendWindow' },
    { label: 'Update', value: 'submitChallenges' },
  ],
  synthesis: [
    { label: 'Queue', value: 'review-deep' },
    { label: 'Timeout', value: '3m' },
    { label: 'Heartbeat', value: '60s' },
    { label: 'Retries', value: '2' },
  ],
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
    character: 'Security researcher and penetration tester. Thinks like an attacker — hunts injection flaws, broken auth, exposed secrets, and privilege escalation.',
  },
  {
    key: 'barnacle',
    name: 'BARNACLE',
    character: '20-year greybeard complexity skeptic. Has seen this pattern sink ships before — spots over-engineering, tangled dependencies, and unmaintainable abstractions.',
  },
  {
    key: 'greenhand',
    name: 'GREENHAND',
    character: 'Enthusiastic junior on their first voyage. Reads code literally — catches missing null checks, unhandled errors, unclear names, and missing tests.',
  },
];
