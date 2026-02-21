'use client';

import { Handle, Position } from '@xyflow/react';
import { ActivityBadge } from '../shared';
import type { MutineerStatus, MutineerChallenge } from '../shared';

interface MutineerNodeData {
  status: MutineerStatus;
  partialOutput?: string;
  challenges: MutineerChallenge[];
  [key: string]: unknown;
}

export function MutineerNode({ data }: { data: MutineerNodeData }) {
  const { status, partialOutput, challenges } = data;

  const borderColor =
    status === 'complete'
      ? 'border-orange-500'
      : status === 'running'
        ? 'border-blue-500'
        : status === 'failed'
          ? 'border-red-500'
          : 'border-gray-600';

  return (
    <div
      className={`w-64 rounded-xl border-2 p-3 text-xs bg-gray-900 shadow-lg transition-all duration-300 animate-node-entrance ${borderColor}`}
    >
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <div className="flex items-center gap-2 mb-1">
        {status === 'running' ? (
          <span className="h-2 w-2 animate-pulse rounded-full bg-blue-400 shrink-0" />
        ) : status === 'complete' ? (
          <span className="h-2 w-2 rounded-full bg-orange-400 shrink-0" />
        ) : status === 'failed' ? (
          <span className="h-2 w-2 rounded-full bg-red-400 shrink-0" />
        ) : (
          <span className="h-2 w-2 rounded-full bg-gray-500 shrink-0" />
        )}
        <span className="font-bold text-gray-100 uppercase tracking-wide text-[11px]">
          THE MUTINEER
        </span>
        <ActivityBadge />
      </div>
      <p className="text-gray-500 text-[10px] mb-2 italic">
        Argues the opposite on principle.
      </p>

      {status === 'running' && partialOutput && (
        <div className="rounded bg-gray-800 p-2 max-h-20 overflow-hidden text-gray-300 leading-relaxed">
          <span className="line-clamp-3">{partialOutput}</span>
          <span className="animate-pulse">&#9612;</span>
        </div>
      )}
      {status === 'running' && !partialOutput && (
        <p className="text-blue-400 italic">
          Reviewing findings<span className="animate-pulse">&hellip;</span>
        </p>
      )}
      {status === 'complete' && (
        <p className="text-orange-300">
          Challenged {challenges.length} finding
          {challenges.length !== 1 ? 's' : ''}
        </p>
      )}
      {status === 'failed' && (
        <p className="text-red-400 italic">Failed &mdash; no challenges filed</p>
      )}
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}
