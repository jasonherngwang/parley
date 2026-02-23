'use client';

import { Handle, Position } from '@xyflow/react';
import { InfoButton } from '../shared';

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

type ArbiterStance = 'agrees' | 'disagrees' | 'mixed';

interface ArbiterNodeData {
  childStatus: 'started' | 'complete' | 'failed';
  mutineerChallenge?: string | null;
  humanChallenge?: string | null;
  ruling?: 'upheld' | 'overturned' | 'accepted';
  reasoning?: string;
  arbiterMutineerStance?: ArbiterStance;
  arbiterHumanStance?: ArbiterStance;
  onInfoClick?: () => void;
  [key: string]: unknown;
}

const STANCE_LABEL: Record<ArbiterStance, string> = {
  agrees: 'Agrees with',
  disagrees: 'Disagrees with',
  mixed: 'Mixed on',
};

function stanceLines(
  mutineerStance?: ArbiterStance,
  humanStance?: ArbiterStance,
): string[] {
  const lines: string[] = [];
  if (mutineerStance) lines.push(`${STANCE_LABEL[mutineerStance]} Mutineer`);
  if (humanStance) lines.push(`${STANCE_LABEL[humanStance]} Human`);
  return lines;
}

export function ArbiterNode({ data }: { data: ArbiterNodeData }) {
  const { childStatus, mutineerChallenge, humanChallenge, ruling, reasoning, arbiterMutineerStance, arbiterHumanStance } = data;
  const isDone = childStatus === 'complete' || childStatus === 'failed';
  const hasChallenges = !!mutineerChallenge || !!humanChallenge;
  const isArbitrating = hasChallenges && !ruling && childStatus === 'started';
  const wasAccepted = ruling === 'accepted';

  const borderClass = isDone
    ? 'border-border-default'
    : isArbitrating
      ? 'border-accent/50'
      : 'border-border-default';

  const stances = stanceLines(arbiterMutineerStance, arbiterHumanStance);

  return (
    <div
      className={`relative w-[280px] rounded-lg border p-3 bg-surface-1 transition-all duration-300 animate-node-entrance ${borderClass}`}
      style={{
        outline: '1px solid rgba(90,69,48,0.3)',
        outlineOffset: '2px',
        boxShadow: isArbitrating
          ? '0 1px 3px rgba(0,0,0,0.5), 0 0 8px rgba(200,144,42,0.2), inset 0 1px 0 rgba(240,228,200,0.04)'
          : '0 1px 3px rgba(0,0,0,0.5), inset 0 1px 0 rgba(240,228,200,0.04)',
      }}
    >
      <Handle type="target" position={Position.Top} className="opacity-0" />
      {data.onInfoClick && <InfoButton onClick={data.onInfoClick} />}

      <div className="flex items-center gap-1.5 mb-1">
        <span className="font-heading font-bold text-text-primary uppercase tracking-[0.06em] text-[12px]">
          Arbiter
        </span>
      </div>

      {/* Stance summary */}
      {stances.length > 0 && (
        <p className="text-text-tertiary text-[10px] mb-1.5" style={{ fontFamily: 'var(--font-mono)' }}>
          {stances.join(' · ')}
        </p>
      )}

      {/* Waiting for challenges */}
      {!isDone && !hasChallenges && (
        <p className="text-text-ghost text-[13px] italic" style={{ fontFamily: 'var(--font-body)' }}>Awaiting challenges...</p>
      )}

      {/* Arbitrating */}
      {isArbitrating && (
        <p className="text-accent italic text-[13px]" style={{ fontFamily: 'var(--font-body)' }}>
          Deliberating...
        </p>
      )}

      {/* No challenges — accepted */}
      {isDone && wasAccepted && (
        <p className="text-text-ghost text-[13px] italic" style={{ fontFamily: 'var(--font-body)' }}>No challenges filed. Finding accepted.</p>
      )}

      {/* Ruling with reasoning */}
      {isDone && !wasAccepted && reasoning && (
        <div className="max-h-[32rem] overflow-y-auto noDrag nowheel">
          <p className="text-text-secondary text-[13px] leading-relaxed break-words" style={{ fontFamily: 'var(--font-body)' }}>
            {renderWithCode(reasoning)}
          </p>
        </div>
      )}

      {/* Failed */}
      {childStatus === 'failed' && !reasoning && (
        <p className="text-status-fail text-[13px] italic" style={{ fontFamily: 'var(--font-body)' }}>Arbitration failed.</p>
      )}

      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}
