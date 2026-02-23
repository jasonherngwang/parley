'use client';

import { Handle, Position } from '@xyflow/react';
import { InfoButton } from '../shared';
import type { MutineerVerdict } from '../shared';

function renderWithCode(text: string) {
  const parts = text.split(/(`[^`]+`)/);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
          return (
            <code key={i} className="rounded px-1 py-0.5 bg-surface-2 text-accent" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875em' }}>
              {part.slice(1, -1)}
            </code>
          );
        }
        return part;
      })}
    </>
  );
}

interface MutineerNodeData {
  findingId: string;
  childStatus: 'started' | 'complete' | 'failed';
  mutineerChallenge?: string | null;
  mutineerVerdict?: MutineerVerdict;
  mutineerFailed?: boolean;
  onInfoClick?: () => void;
  [key: string]: unknown;
}

const VERDICT_LABEL: Record<MutineerVerdict, { label: string; className: string }> = {
  agree: { label: 'Agrees', className: 'text-status-done' },
  disagree: { label: 'Disagrees', className: 'text-accent' },
  partial: { label: 'Partial', className: 'text-text-secondary' },
};

export function MutineerNode({ data }: { data: MutineerNodeData }) {
  const { childStatus, mutineerChallenge, mutineerVerdict } = data;
  const isActive = childStatus === 'started';
  const isDone = childStatus === 'complete' || childStatus === 'failed';
  const hasMutineerResult = mutineerChallenge !== undefined;
  const challenged = !!mutineerChallenge;
  const isRunning = isActive && !hasMutineerResult;

  const borderClass = isRunning
    ? 'border-accent/50'
    : challenged
      ? 'border-accent/30'
      : isDone || hasMutineerResult
        ? 'border-border-default'
        : 'border-border-default';

  const verdictLabel = mutineerVerdict ? VERDICT_LABEL[mutineerVerdict] : null;

  return (
    <div
      className={`relative w-[280px] rounded-lg border p-3 bg-surface-1 transition-all duration-300 animate-node-entrance ${borderClass}`}
      style={{
        outline: '1px solid rgba(90,69,48,0.3)',
        outlineOffset: '2px',
        boxShadow: isRunning
          ? '0 1px 3px rgba(0,0,0,0.5), 0 0 8px rgba(200,144,42,0.2), inset 0 1px 0 rgba(240,228,200,0.04)'
          : '0 1px 3px rgba(0,0,0,0.5), inset 0 1px 0 rgba(240,228,200,0.04)',
      }}
    >
      <Handle type="target" position={Position.Top} className="opacity-0" />
      {data.onInfoClick && <InfoButton onClick={data.onInfoClick} />}

      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="font-heading font-bold text-text-primary uppercase tracking-[0.06em] text-[12px]">
          Mutineer
        </span>
        {verdictLabel && (
          <span className={`text-[10px] font-semibold font-heading uppercase tracking-wide ${verdictLabel.className}`}>
            · {verdictLabel.label}
          </span>
        )}
      </div>

      {isActive && !hasMutineerResult && (
        <p className="text-accent italic text-[13px]" style={{ fontFamily: 'var(--font-body)' }}>
          Reviewing...
        </p>
      )}

      {challenged && (
        <div className="max-h-[22rem] overflow-y-auto noDrag nowheel">
          <p className="text-text-secondary text-[13px] leading-relaxed break-words" style={{ fontFamily: 'var(--font-body)' }}>
            {renderWithCode(mutineerChallenge!)}
          </p>
        </div>
      )}

      {hasMutineerResult && !challenged && !data.mutineerFailed && (
        <p className="text-text-ghost text-[13px] italic" style={{ fontFamily: 'var(--font-body)' }}>No challenge</p>
      )}
      {data.mutineerFailed && (
        <p className="text-status-fail text-[13px] italic" style={{ fontFamily: 'var(--font-body)' }}>Analysis failed.</p>
      )}

      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}
