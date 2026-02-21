'use client';

import { Handle, Position } from '@xyflow/react';

interface JoinGateNodeData {
  done: number;
  total: number;
  [key: string]: unknown;
}

export function JoinGateNode({ data }: { data: JoinGateNodeData }) {
  const { done, total } = data;
  const complete = done >= total;

  return (
    <div
      className={`w-28 rounded-full border-2 px-3 py-1.5 text-[10px] font-semibold text-center shadow-md transition-all duration-300 bg-gray-900 ${
        complete
          ? 'border-green-500 animate-gate-unlock'
          : 'border-gray-600 border-dashed'
      }`}
    >
      <Handle type="target" position={Position.Top} className="opacity-0" />
      {complete ? (
        <span className="text-green-400">&#10003; Joined</span>
      ) : (
        <span className="text-gray-400">{done}/{total} done</span>
      )}
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}
