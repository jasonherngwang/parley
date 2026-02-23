'use client';

import { useState, useEffect, useRef } from 'react';
import type { TemporalMeta } from '../shared';

const PHASE_LABELS: Array<{ key: string; startKey: string; endKey?: string; label: string }> = [
  { key: 'fetch', startKey: 'fetchStartedAt', endKey: 'specialistsStartedAt', label: 'Fetch' },
  { key: 'specialists', startKey: 'specialistsStartedAt', endKey: 'specialistsCompletedAt', label: 'Specialists' },
  { key: 'challenge', startKey: 'challengeStartedAt', endKey: 'challengeCompletedAt', label: 'Challenge' },
  { key: 'arbitration', startKey: 'arbitrationStartedAt', endKey: 'arbitrationCompletedAt', label: 'Arbitration' },
  { key: 'synthesis', startKey: 'synthesisStartedAt', endKey: 'completedAt', label: 'Synthesis' },
];

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.floor(s % 60);
  return `${m}m ${rem}s`;
}

export function WorkflowInfoBar({ temporal, isComplete }: { temporal: TemporalMeta; isComplete: boolean }) {
  const [collapsed, setCollapsed] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(new Date(temporal.startedAt).getTime());

  useEffect(() => {
    startRef.current = new Date(temporal.startedAt).getTime();
  }, [temporal.startedAt]);

  useEffect(() => {
    if (isComplete) {
      if (temporal.phaseTiming.completedAt) {
        setElapsed(new Date(temporal.phaseTiming.completedAt).getTime() - startRef.current);
      }
      return;
    }
    const tick = () => setElapsed(Date.now() - startRef.current);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isComplete, temporal.phaseTiming.completedAt]);

  return (
    <div className="fixed top-12 right-4 z-30 w-72 animate-fade-in-up">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between rounded-t-lg border border-border-default bg-surface-1/95 backdrop-blur px-3 py-1.5 text-[11px] text-text-secondary hover:text-text-primary transition-colors"
        style={{ fontFamily: 'var(--font-heading)' }}
      >
        <span className="font-bold uppercase tracking-[0.06em]">Temporal Runtime</span>
        <span className="text-[9px] text-text-tertiary">{collapsed ? '▶' : '▼'}</span>
      </button>

      {!collapsed && (
        <div className="rounded-b-lg border border-t-0 border-border-default bg-surface-1/95 backdrop-blur px-3 py-2.5 space-y-2.5 text-[12px]">
          {/* IDs */}
          <div className="space-y-1.5">
            <Row label="Workflow" value={temporal.workflowId} mono truncate />
            <Row label="Run" value={temporal.runId} mono truncate />
            <Row label="Queue" value={temporal.taskQueue} />
          </div>

          {/* Elapsed */}
          <div className="flex items-center justify-between">
            <span className="text-text-tertiary">Elapsed</span>
            <span className="text-text-primary font-medium" style={{ fontFamily: 'var(--font-mono)' }}>{formatDuration(elapsed)}</span>
          </div>

          {/* History length */}
          <div className="flex items-center justify-between">
            <span className="text-text-tertiary">History events</span>
            <span className="text-text-secondary" style={{ fontFamily: 'var(--font-mono)' }}>
              {temporal.historyLength.toLocaleString()}
            </span>
          </div>

          {/* CAN count */}
          {temporal.continueAsNewCount > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-text-tertiary">Continue-As-New</span>
              <span className="text-accent font-medium" style={{ fontFamily: 'var(--font-mono)' }}>{temporal.continueAsNewCount}x</span>
            </div>
          )}

          {/* Phase timeline */}
          <div>
            <p className="text-text-secondary font-bold uppercase tracking-[0.06em] mb-1.5" style={{ fontFamily: 'var(--font-heading)' }}>
              Phase timeline
            </p>
            <div className="space-y-1">
              {PHASE_LABELS.map(({ key, startKey, endKey, label }) => {
                const start = temporal.phaseTiming[startKey as keyof typeof temporal.phaseTiming];
                if (!start) return null;
                const end = endKey ? temporal.phaseTiming[endKey as keyof typeof temporal.phaseTiming] : undefined;
                const isRunning = start && !end && !isComplete;
                const duration = end
                  ? new Date(end).getTime() - new Date(start).getTime()
                  : isRunning
                    ? Date.now() - new Date(start).getTime()
                    : undefined;

                return (
                  <div key={key} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      {isRunning ? (
                        <span className="h-1.5 w-1.5 rounded-full animate-status-pulse shrink-0" style={{ backgroundColor: 'var(--color-accent)' }} />
                      ) : end ? (
                        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: 'var(--color-status-done)' }} />
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: 'var(--color-text-ghost)' }} />
                      )}
                      <span style={{ color: isRunning ? 'var(--color-accent)' : 'var(--color-text-primary)' }}>
                        {label}
                      </span>
                    </div>
                    {duration !== undefined && (
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          color: isRunning ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                        }}
                      >
                        {formatDuration(duration)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  truncate,
}: {
  label: string;
  value: string;
  mono?: boolean;
  truncate?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-text-tertiary shrink-0">{label}</span>
      <span
        className={`text-text-primary ${truncate ? 'truncate max-w-[160px]' : ''}`}
        style={{ fontFamily: mono ? 'var(--font-mono)' : 'var(--font-body)' }}
        title={truncate ? value : undefined}
      >
        {value}
      </span>
    </div>
  );
}
