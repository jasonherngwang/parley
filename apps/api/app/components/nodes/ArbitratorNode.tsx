'use client';

import { Handle, Position } from '@xyflow/react';
import {
  ActivityBadge,
  rulingBadge,
  specialistFromFindingId,
} from '../shared';
import type { ArbitrationState, Finding, Specialists } from '../shared';

interface ArbitratorNodeData {
  arb: ArbitrationState;
  specialists: Specialists;
  [key: string]: unknown;
}

function findFinding(id: string, specialists: Specialists): Finding | undefined {
  for (const s of Object.values(specialists)) {
    const f = s.findings?.find((f: Finding) => f.id === id);
    if (f) return f;
  }
  return undefined;
}

export function ArbitratorNode({ data }: { data: ArbitratorNodeData }) {
  const { arb, specialists } = data;
  const finding = findFinding(arb.findingId, specialists);
  const specialistName = specialistFromFindingId(arb.findingId);

  const borderColor =
    arb.status === 'running'
      ? 'border-blue-500'
      : arb.ruling === 'upheld'
        ? 'border-red-700'
        : arb.ruling === 'overturned'
          ? 'border-green-700'
          : 'border-gray-600';

  return (
    <div
      className={`w-56 rounded-xl border-2 p-3 text-xs bg-gray-900 shadow-lg transition-all duration-300 animate-node-entrance ${borderColor}`}
    >
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
        {arb.status === 'running' ? (
          <span className="h-2 w-2 animate-pulse rounded-full bg-blue-400 shrink-0" />
        ) : arb.ruling === 'upheld' ? (
          <span className="h-2 w-2 rounded-full bg-red-400 shrink-0" />
        ) : arb.ruling === 'overturned' ? (
          <span className="h-2 w-2 rounded-full bg-green-400 shrink-0" />
        ) : (
          <span className="h-2 w-2 rounded-full bg-gray-500 shrink-0" />
        )}
        <span className="font-bold text-gray-100 uppercase tracking-wide text-[10px]">
          Arbitrator
        </span>
        <ActivityBadge />
      </div>
      <p className="text-gray-500 text-[9px] mb-1.5">
        {specialistName}&apos;s finding
      </p>

      {finding && (
        <p className="text-gray-400 text-[10px] mb-1.5 line-clamp-2">
          {finding.description}
        </p>
      )}

      <div className="flex gap-1 mb-1.5 flex-wrap">
        {arb.challengeSources.includes('mutineer') && (
          <span className="rounded border border-orange-700 bg-orange-900/30 px-1 py-0.5 text-[8px] text-orange-300">
            MUTINEER
          </span>
        )}
        {arb.challengeSources.includes('human') && (
          <span className="rounded border border-blue-700 bg-blue-900/30 px-1 py-0.5 text-[8px] text-blue-300">
            Human
          </span>
        )}
        {rulingBadge(arb.ruling)}
      </div>

      {arb.status === 'running' && (
        <p className="text-blue-400 italic text-[10px]">
          Deliberating<span className="animate-pulse">&hellip;</span>
        </p>
      )}
      {arb.reasoning && (
        <p className="text-gray-400 leading-relaxed text-[10px] line-clamp-3">
          {arb.reasoning}
        </p>
      )}
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}
