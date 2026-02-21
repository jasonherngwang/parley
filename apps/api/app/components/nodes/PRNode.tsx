'use client';

import { Handle, Position } from '@xyflow/react';

interface PRNodeData {
  title?: string;
  repoName?: string;
  prNumber?: number;
  prUrl: string;
  [key: string]: unknown;
}

export function PRNode({ data }: { data: PRNodeData }) {
  const { title, repoName, prNumber, prUrl } = data;
  const fetched = !!title;

  return (
    <div className="w-96 rounded-xl border-2 border-gray-600 bg-gray-900 p-3 text-xs shadow-lg transition-all duration-300 animate-node-entrance">
      {fetched ? (
        <>
          <p className="text-gray-500 text-[10px]">
            {repoName} #{prNumber}
          </p>
          <p className="font-medium text-gray-200 mt-0.5">{title}</p>
        </>
      ) : (
        <>
          <p className="text-gray-400 text-sm">
            Fetching PR details<span className="animate-pulse">&hellip;</span>
          </p>
          <p className="mt-0.5 break-all text-[10px] text-gray-600">{prUrl}</p>
        </>
      )}
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}
