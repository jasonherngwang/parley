'use client';

import { Handle, Position } from '@xyflow/react';
import {
  statusColor,
  statusDot,
  InfoButton,
} from '../shared';
import type { SpecialistState } from '../shared';

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

interface SpecialistNodeData {
  name: string;
  character: string;
  state: SpecialistState;
  onInfoClick?: () => void;
  [key: string]: unknown;
}

export function SpecialistNode({ data }: { data: SpecialistNodeData }) {
  const { name, character, state } = data;
  const findingCount = state.findings?.length ?? 0;
  const isRunning = state.status === 'running';

  return (
    <div
      className={`relative w-80 rounded-lg border p-4 transition-all duration-300 animate-node-entrance ${statusColor(state.status)}`}
      style={{
        outline: '1px solid rgba(90,69,48,0.3)',
        outlineOffset: '2px',
        boxShadow: isRunning
          ? '0 1px 3px rgba(0,0,0,0.5), 0 0 14px rgba(200,144,42,0.25), inset 0 1px 0 rgba(240,228,200,0.04)'
          : '0 1px 3px rgba(0,0,0,0.5), inset 0 1px 0 rgba(240,228,200,0.04)',
      }}
    >
      <Handle type="target" position={Position.Top} className="opacity-0" />
      {data.onInfoClick && <InfoButton onClick={data.onInfoClick} />}
      <div className="flex items-center gap-2 mb-1.5">
        {statusDot(state.status)}
        <span className="font-heading font-bold text-text-primary uppercase tracking-[0.06em] text-sm">
          {name}
        </span>
      </div>
      <p className="text-text-tertiary text-[11px] mb-1.5 italic" style={{ fontFamily: 'var(--font-body)' }}>{character}</p>

      {state.status === 'running' && state.partialOutput && (
        <div className="rounded-md bg-surface-2 p-3 noDrag nowheel overflow-y-auto max-h-[14rem] text-text-secondary text-[13px] leading-relaxed" style={{ fontFamily: 'var(--font-body)' }}>
          {renderWithCode(state.partialOutput)}
          <span className="animate-cursor-blink">▌</span>
        </div>
      )}
      {state.status === 'running' && !state.partialOutput && (
        <p className="text-accent italic text-[13px]" style={{ fontFamily: 'var(--font-body)' }}>
          Running...
        </p>
      )}

      {state.status === 'complete' && (
        <p className="text-status-done text-[13px]" style={{ fontFamily: 'var(--font-body)' }}>
          ✓ {findingCount} finding{findingCount !== 1 ? 's' : ''}
        </p>
      )}

      {state.status === 'failed' && (
        <p className="text-status-fail italic text-[13px]" style={{ fontFamily: 'var(--font-body)' }}>Analysis failed.</p>
      )}

      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}
