'use client';

import { Handle, Position } from '@xyflow/react';
import { InfoButton } from '../shared';
import type { SynthesisStatus, SynthesisVerdict, VerdictFinding } from '../shared';

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

interface SynthesisNodeData {
  status: SynthesisStatus;
  partialOutput?: string;
  verdict?: SynthesisVerdict;
  onInfoClick?: () => void;
  [key: string]: unknown;
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: '#D44040',
  major: '#C8902A',
  minor: '#A8845C',
};

const SEVERITY_RANK: Record<string, number> = { critical: 0, major: 1, minor: 2 };

function VerdictDocument({ findings, summary }: { findings: VerdictFinding[]; summary: string }) {
  const active = [...findings]
    .filter((f) => f.ruling !== 'overturned')
    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9));
  const overturned = [...findings]
    .filter((f) => f.ruling === 'overturned')
    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9));
  const ordered = [...active, ...overturned];

  return (
    <div className="space-y-3">
      {summary && (
        <p className="text-text-secondary leading-relaxed text-[13px]" style={{ fontFamily: 'var(--font-body)' }}>
          {renderWithCode(summary)}
        </p>
      )}

      {ordered.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] text-text-tertiary uppercase font-semibold tracking-wide font-heading">
            Findings
          </p>
          {ordered.map((f, i) => {
            const overturned = f.ruling === 'overturned';
            return (
              <div key={i} className="pt-3 space-y-2 border-t border-border-subtle first:border-t-0 first:pt-0">
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-[10px] font-semibold uppercase font-heading"
                    style={{
                      color: SEVERITY_COLOR[f.severity] ?? '#A8845C',
                      opacity: overturned ? 0.4 : 1,
                      textDecoration: overturned ? 'line-through' : undefined,
                    }}
                  >
                    {f.severity}
                  </span>
                  <span className="text-text-ghost text-[10px]" style={{ fontFamily: 'var(--font-mono)' }}>
                    via {f.specialist.toUpperCase()}
                  </span>
                  {overturned && (
                    <span className="text-[10px] font-semibold uppercase font-heading text-text-ghost">
                      · overturned
                    </span>
                  )}
                </div>
                <p className={`text-[13px] leading-relaxed ${overturned ? 'text-text-tertiary line-through' : 'text-text-primary'}`} style={{ fontFamily: 'var(--font-body)' }}>
                  {renderWithCode(f.finding)}
                </p>
                <div className="pl-3 border-l-2" style={{ borderColor: overturned ? 'rgba(106,80,64,0.4)' : 'rgba(200,144,42,0.4)' }}>
                  <p className={`text-[13px] leading-relaxed italic ${overturned ? 'text-text-tertiary' : 'text-text-secondary'}`} style={{ fontFamily: 'var(--font-body)' }}>
                    {renderWithCode(f.recommendation)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {ordered.length === 0 && (
        <p className="text-text-ghost italic text-[13px]" style={{ fontFamily: 'var(--font-body)' }}>No actionable findings.</p>
      )}
    </div>
  );
}

export function SynthesisNode({ data }: { data: SynthesisNodeData }) {
  const { status, partialOutput, verdict } = data;
  const isRunning = status === 'running';

  const borderClass =
    status === 'complete'
      ? 'border-accent/60'
      : isRunning
        ? 'border-accent/50'
        : status === 'failed'
          ? 'border-status-fail/50'
          : 'border-border-default';

  return (
    <div
      className={`relative w-[720px] rounded-lg border p-5 bg-surface-1 transition-all duration-300 animate-node-entrance ${borderClass}`}
      style={{
        outline: '1px solid rgba(90,69,48,0.3)',
        outlineOffset: '2px',
        boxShadow: isRunning
          ? '0 2px 8px rgba(0,0,0,0.6), 0 0 20px rgba(200,144,42,0.3), inset 0 1px 0 rgba(240,228,200,0.04)'
          : status === 'complete'
            ? '0 2px 8px rgba(0,0,0,0.6), 0 0 12px rgba(200,144,42,0.15), inset 0 1px 0 rgba(240,228,200,0.04)'
            : '0 2px 8px rgba(0,0,0,0.6), inset 0 1px 0 rgba(240,228,200,0.04)',
      }}
    >
      <Handle type="target" position={Position.Top} className="opacity-0" />
      {data.onInfoClick && <InfoButton onClick={data.onInfoClick} />}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {isRunning ? (
          <span className="h-2.5 w-2.5 rounded-full shrink-0 animate-status-pulse" style={{ backgroundColor: 'var(--color-accent)' }} />
        ) : status === 'complete' ? (
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: 'var(--color-accent)' }} />
        ) : status === 'failed' ? (
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: 'var(--color-status-fail)' }} />
        ) : (
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: 'var(--color-text-ghost)' }} />
        )}
        <span className="font-heading font-bold text-text-primary uppercase tracking-[0.06em] text-sm">
          Synthesis
        </span>
      </div>
      {isRunning && partialOutput && (
        <div className="rounded-md bg-surface-2 p-3 max-h-64 overflow-y-auto noDrag nowheel text-text-secondary text-[13px] leading-relaxed mb-3" style={{ fontFamily: 'var(--font-body)' }}>
          {partialOutput}
          <span className="animate-cursor-blink">▌</span>
        </div>
      )}
      {isRunning && !partialOutput && (
        <p className="text-accent italic text-[13px]" style={{ fontFamily: 'var(--font-body)' }}>
          Reconciling all findings...
        </p>
      )}
      {status === 'failed' && (
        <p className="text-status-fail italic text-[13px]" style={{ fontFamily: 'var(--font-body)' }}>Synthesis failed.</p>
      )}

      {status === 'complete' && verdict && (
        <div className="noDrag nowheel">
          <VerdictDocument findings={verdict.findings} summary={verdict.summary} />
        </div>
      )}

      {status === 'complete' && (
        <div className="mt-8 mb-2 text-center">
          <span
            className="rounded-full border px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] font-heading"
            style={{
              borderColor: 'rgba(200, 144, 42, 0.3)',
              backgroundColor: 'rgba(200, 144, 42, 0.08)',
              color: 'var(--color-accent)',
            }}
          >
            Review Complete
          </span>
        </div>
      )}
    </div>
  );
}
