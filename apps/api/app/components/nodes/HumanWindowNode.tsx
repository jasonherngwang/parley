'use client';

import { useEffect, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  TimerBadge,
  SignalBadge,
  UpdateBadge,
  formatTime,
} from '../shared';
import type { Finding, Specialists } from '../shared';

interface HumanWindowNodeData {
  specialists: Specialists;
  windowOpen: boolean;
  secondsRemaining: number;
  submitted: boolean;
  onExtend: () => void;
  onSubmit: (challenges: Record<string, string>) => void;
  [key: string]: unknown;
}

export function HumanWindowNode({ data }: { data: HumanWindowNodeData }) {
  const { specialists, windowOpen, secondsRemaining, submitted, onExtend, onSubmit } = data;
  const [challenges, setChallenges] = useState<Record<string, string>>({});
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
    <div className="w-80 rounded-xl border-2 border-gray-700 bg-gray-900 p-3 text-xs shadow-lg transition-all duration-300 animate-node-entrance">
      <Handle type="target" position={Position.Top} className="opacity-0" />

      <div className="flex items-center gap-2 mb-1">
        <span className="font-bold text-gray-100 uppercase tracking-wide text-[11px]">
          Human Review
        </span>
        <TimerBadge />
      </div>

      <div className="flex items-center justify-between mb-2">
        <p className="text-gray-500 text-[10px] italic">Durable Timer</p>
        <span
          className={`font-mono text-sm font-bold transition-colors duration-300 ${
            isExpired
              ? 'text-gray-500'
              : localSeconds < 60
                ? 'text-red-400'
                : 'text-gray-300'
          }`}
        >
          {submitted ? 'Submitted' : isExpired ? 'Expired' : formatTime(localSeconds)}
        </span>
      </div>

      {allFindings.length === 0 && (
        <p className="text-gray-500 italic noDrag">No findings to challenge.</p>
      )}

      {allFindings.length > 0 && (
        <div className="space-y-2 max-h-48 overflow-y-auto pr-1 noDrag">
          {allFindings.map(({ specialist, finding }) => (
            <div
              key={finding.id}
              className="rounded-lg bg-gray-800 p-2 space-y-1"
            >
              <div className="flex items-start justify-between gap-1">
                <span
                  className={`text-[9px] font-semibold uppercase ${
                    finding.severity === 'critical'
                      ? 'text-red-400'
                      : finding.severity === 'major'
                        ? 'text-orange-400'
                        : 'text-yellow-400'
                  }`}
                >
                  {specialist.toUpperCase()} &mdash; {finding.severity}
                </span>
                <span className="text-gray-600 font-mono text-[8px] shrink-0">
                  {finding.id}
                </span>
              </div>
              <p className="text-gray-300 text-[10px]">{finding.description}</p>
              <textarea
                className="noDrag w-full rounded bg-gray-700 border border-gray-600 p-1.5 text-gray-200 placeholder-gray-500 focus:border-blue-500 focus:outline-none resize-none text-[10px]"
                rows={2}
                placeholder="Challenge this finding..."
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
        <div className="flex gap-2 pt-2 noDrag">
          <button
            onClick={onExtend}
            className="noDrag rounded-lg border border-gray-600 px-2 py-1 text-gray-300 text-[10px] hover:border-blue-500 hover:text-blue-400 transition-colors flex items-center gap-1"
          >
            Extend +2m <SignalBadge />
          </button>
          <button
            onClick={() => onSubmit(challenges)}
            className="noDrag flex-1 rounded-lg bg-blue-600 px-2 py-1 font-medium text-white text-[10px] hover:bg-blue-500 transition-colors flex items-center justify-center gap-1"
          >
            Submit <UpdateBadge />
          </button>
        </div>
      )}

      {submitted && (
        <p className="text-green-400 text-[10px] pt-1">Challenges submitted.</p>
      )}
      {isExpired && (
        <p className="text-gray-500 text-[10px] italic pt-1">
          Window expired.
        </p>
      )}

      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}
