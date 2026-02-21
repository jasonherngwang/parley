'use client';

import { Handle, Position } from '@xyflow/react';
import { statusColor, statusDot, ActivityBadge } from '../shared';
import type { SpecialistState } from '../shared';

interface SpecialistNodeData {
  name: string;
  character: string;
  state: SpecialistState;
  [key: string]: unknown;
}

export function SpecialistNode({ data }: { data: SpecialistNodeData }) {
  const { name, character, state } = data;
  const severityCounts =
    state.findings?.reduce(
      (acc, f) => {
        acc[f.severity] = (acc[f.severity] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    ) ?? {};

  return (
    <div
      className={`w-56 rounded-xl border-2 p-3 text-xs shadow-lg transition-all duration-300 animate-node-entrance ${statusColor(state.status)}`}
    >
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <div className="flex items-center gap-2 mb-1">
        {statusDot(state.status)}
        <span className="font-bold text-gray-100 uppercase tracking-wide text-[11px]">
          {name}
        </span>
        <ActivityBadge />
        {state.attemptNumber > 1 && (
          <span className={`ml-auto text-[10px] ${state.status === 'running' ? 'text-amber-400 animate-pulse' : 'text-amber-400'}`}>
            {state.attemptNumber}/3
          </span>
        )}
      </div>
      <p className="text-gray-500 text-[10px] mb-2 italic">{character}</p>

      {state.status === 'running' && state.partialOutput && (
        <div className="rounded bg-gray-800 p-2 max-h-24 overflow-hidden text-gray-300 leading-relaxed">
          <span className="line-clamp-4">{state.partialOutput}</span>
          <span className="animate-pulse">&#9612;</span>
        </div>
      )}
      {state.status === 'running' && !state.partialOutput && (
        <p className="text-blue-400 italic">
          Running<span className="animate-pulse">&hellip;</span>
        </p>
      )}

      {state.status === 'complete' && state.findings && (
        <div className="space-y-1">
          {state.findings.length === 0 ? (
            <p className="text-gray-500 italic">No findings</p>
          ) : (
            <>
              <div className="flex gap-2 text-[10px]">
                {(severityCounts['critical'] ?? 0) > 0 && (
                  <span className="text-red-400">
                    {severityCounts['critical']} critical
                  </span>
                )}
                {(severityCounts['major'] ?? 0) > 0 && (
                  <span className="text-orange-400">
                    {severityCounts['major']} major
                  </span>
                )}
                {(severityCounts['minor'] ?? 0) > 0 && (
                  <span className="text-yellow-400">
                    {severityCounts['minor']} minor
                  </span>
                )}
              </div>
              <ul className="space-y-1 max-h-28 overflow-y-auto">
                {state.findings.slice(0, 3).map((f) => (
                  <li
                    key={f.id}
                    className="rounded bg-gray-800 px-2 py-1 text-gray-300 leading-snug"
                  >
                    <span
                      className={
                        f.severity === 'critical'
                          ? 'text-red-400'
                          : f.severity === 'major'
                            ? 'text-orange-400'
                            : 'text-yellow-400'
                      }
                    >
                      [{f.severity}]
                    </span>{' '}
                    {f.description}
                  </li>
                ))}
                {state.findings.length > 3 && (
                  <li className="text-gray-500 italic">
                    +{state.findings.length - 3} more
                  </li>
                )}
              </ul>
            </>
          )}
        </div>
      )}

      {state.status === 'timed-out' && (
        <p className="text-yellow-400 italic">Timed out after 45s</p>
      )}
      {state.status === 'failed' && (
        <p className="text-red-400 italic">Failed after 3 attempts</p>
      )}

      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}
