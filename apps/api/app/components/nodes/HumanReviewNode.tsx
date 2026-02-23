'use client';

import { Handle, Position } from '@xyflow/react';
import { InfoButton } from '../shared';

interface HumanReviewNodeData {
  findingId: string;
  challengeText: string;
  onChallengeChange: (findingId: string, text: string) => void;
  windowOpen: boolean;
  submitted: boolean;
  childStatus: 'started' | 'complete' | 'failed';
  humanChallenge?: string | null;
  tabIndex?: number;
  onInfoClick?: () => void;
  [key: string]: unknown;
}

export function HumanReviewNode({ data }: { data: HumanReviewNodeData }) {
  const {
    findingId,
    challengeText,
    onChallengeChange,
    windowOpen,
    submitted,
    childStatus,
    humanChallenge,
  } = data;

  const isDone = childStatus === 'complete' || childStatus === 'failed';
  const isExpired = !windowOpen && !submitted && !isDone;

  const borderClass = windowOpen
    ? 'border-accent/50'
    : submitted || isDone
      ? 'border-border-default'
      : 'border-border-default';

  return (
    <div
      className={`relative w-[280px] rounded-lg border p-3 bg-surface-1 transition-all duration-300 animate-node-entrance ${borderClass}`}
      style={{
        outline: '1px solid rgba(90,69,48,0.3)',
        outlineOffset: '2px',
        boxShadow: windowOpen
          ? '0 1px 3px rgba(0,0,0,0.5), 0 0 8px rgba(200,144,42,0.2), inset 0 1px 0 rgba(240,228,200,0.04)'
          : '0 1px 3px rgba(0,0,0,0.5), inset 0 1px 0 rgba(240,228,200,0.04)',
      }}
    >
      <Handle type="target" position={Position.Top} className="opacity-0" />
      {data.onInfoClick && <InfoButton onClick={data.onInfoClick} />}

      <div className="flex items-center gap-1.5 mb-1.5 pr-6">
        <span className="font-heading font-bold text-text-primary uppercase tracking-[0.06em] text-[12px]">
          Human Review
        </span>
      </div>

      {/* Editable textarea when window is open */}
      {windowOpen && !submitted && (
        <textarea
          className="noDrag w-full rounded-md bg-surface-2 border border-border-default p-2 text-text-primary placeholder-text-ghost focus:border-accent/60 focus:outline-none resize-none text-[13px] transition-colors"
          style={{ fontFamily: 'var(--font-body)' }}
          rows={4}
          tabIndex={data.tabIndex ?? 0}
          placeholder="Challenge this finding..."
          value={challengeText}
          onChange={(e) => onChallengeChange(findingId, e.target.value)}
        />
      )}

      {/* Submitted state */}
      {submitted && !isDone && (
        humanChallenge ? (
          <p className="text-text-secondary text-[13px] leading-relaxed max-h-20 overflow-y-auto break-words noDrag nowheel" style={{ fontFamily: 'var(--font-body)' }}>
            {humanChallenge}
          </p>
        ) : challengeText ? (
          <p className="text-text-secondary text-[13px] leading-relaxed max-h-20 overflow-y-auto break-words noDrag nowheel" style={{ fontFamily: 'var(--font-body)' }}>
            {challengeText}
          </p>
        ) : (
          <p className="text-text-ghost text-[13px] italic" style={{ fontFamily: 'var(--font-body)' }}>No challenge</p>
        )
      )}

      {/* Expired state */}
      {isExpired && (
        <p className="text-text-ghost text-[13px] italic" style={{ fontFamily: 'var(--font-body)' }}>Expired</p>
      )}

      {/* Complete state — just show human challenge */}
      {isDone && (
        humanChallenge ? (
          <p className="text-text-secondary text-[13px] leading-relaxed max-h-20 overflow-y-auto break-words noDrag nowheel" style={{ fontFamily: 'var(--font-body)' }}>
            {humanChallenge}
          </p>
        ) : (
          <p className="text-text-ghost text-[13px]">&mdash;</p>
        )
      )}

      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}
