'use client';

import { Handle, Position } from '@xyflow/react';
import { ActivityBadge, verdictRulingBadge } from '../shared';
import type { SynthesisStatus, SynthesisVerdict, VerdictFinding } from '../shared';

interface SynthesisNodeData {
  status: SynthesisStatus;
  partialOutput?: string;
  verdict?: SynthesisVerdict;
  [key: string]: unknown;
}

function VerdictFindingList({ findings }: { findings: VerdictFinding[] }) {
  return (
    <ul className="space-y-1.5">
      {findings.map((f, i) => (
        <li key={i} className="rounded-lg bg-gray-800 p-2 space-y-1">
          <div className="flex items-start gap-1.5 flex-wrap">
            <span className="text-gray-400 text-[8px] font-mono uppercase font-semibold">
              {f.specialist.toUpperCase()}
            </span>
            {verdictRulingBadge(f.ruling)}
            {f.challengeSources && f.challengeSources.length > 0 && (
              <div className="flex gap-1">
                {f.challengeSources.includes('mutineer') && (
                  <span className="rounded border border-orange-700 bg-orange-900/30 px-1 py-0.5 text-[8px] text-orange-300">
                    MUTINEER
                  </span>
                )}
                {f.challengeSources.includes('human') && (
                  <span className="rounded border border-blue-700 bg-blue-900/30 px-1 py-0.5 text-[8px] text-blue-300">
                    Human
                  </span>
                )}
              </div>
            )}
          </div>
          <p className="text-gray-300 text-[10px]">{f.description}</p>
          <p className="text-gray-500 text-[9px]">
            <span className="text-gray-600">Rec:</span> {f.recommendation}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function SynthesisNode({ data }: { data: SynthesisNodeData }) {
  const { status, partialOutput, verdict } = data;

  const borderColor =
    status === 'complete'
      ? 'border-purple-500'
      : status === 'running'
        ? 'border-blue-500'
        : status === 'failed'
          ? 'border-red-500'
          : 'border-gray-600';

  const grouped = verdict
    ? {
        critical: verdict.findings.filter((f) => f.severity === 'critical'),
        major: verdict.findings.filter((f) => f.severity === 'major'),
        minor: verdict.findings.filter((f) => f.severity === 'minor'),
      }
    : null;

  return (
    <div
      className={`w-[420px] rounded-xl border-2 p-3 text-xs bg-gray-900 shadow-lg transition-all duration-300 animate-node-entrance ${borderColor}`}
    >
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        {status === 'running' ? (
          <span className="h-2 w-2 animate-pulse rounded-full bg-blue-400 shrink-0" />
        ) : status === 'complete' ? (
          <span className="h-2 w-2 rounded-full bg-purple-400 shrink-0" />
        ) : status === 'failed' ? (
          <span className="h-2 w-2 rounded-full bg-red-400 shrink-0" />
        ) : (
          <span className="h-2 w-2 rounded-full bg-gray-500 shrink-0" />
        )}
        <span className="font-bold text-gray-100 uppercase tracking-wide text-[11px]">
          Synthesis
        </span>
        <ActivityBadge deep />
        {status === 'complete' && verdict && (
          <span className="ml-auto text-purple-400 text-[10px]">
            {verdict.findings.length} finding
            {verdict.findings.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <p className="text-gray-500 text-[10px] italic mb-2">
        Reconciles all findings and rulings into a structured verdict.
      </p>

      {status === 'running' && partialOutput && (
        <div className="rounded bg-gray-800 p-2 max-h-28 overflow-hidden text-gray-300 leading-relaxed mb-2">
          <span className="line-clamp-5">{partialOutput}</span>
          <span className="animate-pulse">&#9612;</span>
        </div>
      )}
      {status === 'running' && !partialOutput && (
        <p className="text-blue-400 italic">
          Reconciling all findings<span className="animate-pulse">&hellip;</span>
        </p>
      )}
      {status === 'failed' && (
        <p className="text-red-400 italic">Synthesis failed.</p>
      )}

      {status === 'complete' && verdict && (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {verdict.summary && (
            <p className="text-gray-300 leading-relaxed border-l-2 border-purple-700 pl-2 text-[10px]">
              {verdict.summary}
            </p>
          )}

          {grouped && grouped.critical.length > 0 && (
            <div>
              <p className="text-red-400 text-[9px] uppercase font-semibold mb-0.5">
                Critical
              </p>
              <VerdictFindingList findings={grouped.critical} />
            </div>
          )}
          {grouped && grouped.major.length > 0 && (
            <div>
              <p className="text-orange-400 text-[9px] uppercase font-semibold mb-0.5">
                Major
              </p>
              <VerdictFindingList findings={grouped.major} />
            </div>
          )}
          {grouped && grouped.minor.length > 0 && (
            <div>
              <p className="text-yellow-400 text-[9px] uppercase font-semibold mb-0.5">
                Minor
              </p>
              <VerdictFindingList findings={grouped.minor} />
            </div>
          )}
          {grouped &&
            grouped.critical.length === 0 &&
            grouped.major.length === 0 &&
            grouped.minor.length === 0 && (
              <p className="text-gray-500 italic">No findings.</p>
            )}
        </div>
      )}

      {status === 'complete' && (
        <div className="mt-2 text-center">
          <span className="rounded-full bg-purple-900/50 border border-purple-700 px-3 py-1 text-[10px] text-purple-300 font-semibold uppercase tracking-wide">
            Review Complete
          </span>
        </div>
      )}
    </div>
  );
}
