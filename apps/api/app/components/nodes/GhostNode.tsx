'use client';

import { Handle, Position } from '@xyflow/react';
import { InfoButton } from '../shared';

interface GhostNodeData {
  label: string;
  sublabel?: string;
  metaKey?: string;
  nodeWidth?: number;
  onInfoClick?: () => void;
  [key: string]: unknown;
}

export function GhostNode({ data }: { data: GhostNodeData }) {
  const { label, sublabel, nodeWidth } = data;

  return (
    <div
      className="relative rounded-lg border border-dashed border-border-subtle bg-surface-1/25 p-4 opacity-40 animate-node-entrance"
      style={{
        width: nodeWidth ?? 280,
        outline: '1px solid rgba(90,69,48,0.15)',
        outlineOffset: '2px',
      }}
    >
      <Handle type="target" position={Position.Top} className="opacity-0" />
      {data.onInfoClick && <InfoButton onClick={data.onInfoClick} />}
      <div className="flex items-center gap-2 mb-1">
        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: 'var(--color-text-ghost)' }} />
        <span className="font-heading font-bold text-text-ghost uppercase tracking-[0.06em] text-sm">
          {label}
        </span>
      </div>
      {sublabel && (
        <p className="text-text-ghost text-[11px] italic" style={{ fontFamily: 'var(--font-body)' }}>{sublabel}</p>
      )}
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}
