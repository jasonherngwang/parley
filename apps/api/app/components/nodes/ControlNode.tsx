'use client';

import { useEffect, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  TimerBadge,
  formatTime,
  InfoButton,
} from '../shared';

interface ControlNodeData {
  windowOpen: boolean;
  secondsRemaining: number;
  submitted: boolean;
  onExtend: () => void;
  onSubmit: () => void;
  onInfoClick?: () => void;
  [key: string]: unknown;
}

export function ControlNode({ data }: { data: ControlNodeData }) {
  const { windowOpen, secondsRemaining, submitted, onExtend, onSubmit } = data;
  const [localSeconds, setLocalSeconds] = useState(secondsRemaining);

  useEffect(() => {
    setLocalSeconds(secondsRemaining);
  }, [secondsRemaining]);

  useEffect(() => {
    if (!windowOpen || submitted) return;
    const interval = setInterval(() => {
      setLocalSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [windowOpen, submitted]);

  const isExpired = !windowOpen && !submitted;

  return (
    <div
      className="relative w-[300px] rounded-lg border border-border-default bg-surface-1 p-4 transition-all duration-300 animate-node-entrance"
      style={{
        outline: '1px solid rgba(90,69,48,0.3)',
        outlineOffset: '2px',
        boxShadow: windowOpen && !submitted
          ? '0 1px 3px rgba(0,0,0,0.5), 0 0 10px rgba(200,144,42,0.15), inset 0 1px 0 rgba(240,228,200,0.04)'
          : '0 1px 3px rgba(0,0,0,0.5), inset 0 1px 0 rgba(240,228,200,0.04)',
      }}
    >
      <Handle type="target" position={Position.Top} className="opacity-0" />
      {data.onInfoClick && <InfoButton onClick={data.onInfoClick} />}

      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <span className="font-heading font-bold text-text-primary uppercase tracking-[0.06em] text-sm">
          Human Review Control
        </span>
        <TimerBadge />
      </div>

      <div className="flex items-center justify-between mb-3">
        <p className="text-text-tertiary text-[11px] italic" style={{ fontFamily: 'var(--font-body)' }}>Durable Timer</p>
        <span
          className={`font-bold transition-colors duration-300 ${submitted || isExpired ? 'text-[13px]' : 'text-lg'}`}
          style={{
            fontFamily: submitted || isExpired ? 'var(--font-body)' : 'var(--font-mono)',
            color: isExpired
              ? 'var(--color-text-tertiary)'
              : submitted
                ? 'var(--color-status-done)'
                : localSeconds < 60
                  ? 'var(--color-status-fail)'
                  : 'var(--color-text-primary)',
          }}
        >
          {submitted ? 'Submitted' : isExpired ? 'Expired' : formatTime(localSeconds)}
        </span>
      </div>

      {windowOpen && !submitted && (
        <div className="flex gap-2 noDrag">
          <button
            onClick={onExtend}
            className="noDrag rounded-lg border border-border-default px-4 py-2 text-text-secondary text-[13px] font-medium hover:border-accent/50 hover:text-accent transition-colors"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            Extend +2m
          </button>
          <button
            onClick={onSubmit}
            className="noDrag flex-1 rounded-lg px-4 py-2 text-[13px] font-medium transition-colors hover:opacity-90"
            style={{
              fontFamily: 'var(--font-heading)',
              backgroundColor: 'var(--color-accent)',
              color: 'var(--color-surface-0)',
            }}
          >
            Submit All
          </button>
        </div>
      )}

      {submitted && (
        <p className="text-status-done text-[13px]" style={{ fontFamily: 'var(--font-body)' }}>Challenges submitted.</p>
      )}
      {isExpired && (
        <p className="text-text-ghost text-[13px] italic" style={{ fontFamily: 'var(--font-body)' }}>Window expired.</p>
      )}

      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}
