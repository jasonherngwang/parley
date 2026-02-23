'use client';

import { Handle, Position } from '@xyflow/react';
import {
  InfoButton,
  FindingIdBadge,
} from '../shared';
import type { FindingLifecycle } from '../shared';

function renderWithCode(text: string) {
  const parts = text.split(/(`[^`]+`)/);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
          return (
            <code key={i} className="rounded px-1 py-0.5 bg-surface-2 text-accent" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875em' }}>
              {part.slice(1, -1)}
            </code>
          );
        }
        return part;
      })}
    </>
  );
}

interface FindingNodeData {
  finding: FindingLifecycle;
  onInfoClick?: () => void;
  [key: string]: unknown;
}

export function FindingNode({ data }: { data: FindingNodeData }) {
  const { finding } = data;
  const isActive = finding.childStatus === 'started';
  const isDone = finding.childStatus === 'complete';
  const isFailed = finding.childStatus === 'failed';

  const borderClass = isDone
    ? 'border-status-done/40'
    : isActive
      ? 'border-accent/50'
      : isFailed
        ? 'border-status-fail/50'
        : 'border-border-default';

  const severityColor =
    finding.severity === 'critical'
      ? 'text-status-fail'
      : finding.severity === 'major'
        ? 'text-accent'
        : 'text-text-tertiary';

  return (
    <div
      className={`relative w-[280px] rounded-lg border p-3 bg-surface-1 transition-all duration-300 animate-node-entrance ${borderClass}`}
      style={{
        outline: '1px solid rgba(90,69,48,0.3)',
        outlineOffset: '2px',
        boxShadow: isActive
          ? '0 1px 3px rgba(0,0,0,0.5), 0 0 8px rgba(200,144,42,0.2), inset 0 1px 0 rgba(240,228,200,0.04)'
          : '0 1px 3px rgba(0,0,0,0.5), inset 0 1px 0 rgba(240,228,200,0.04)',
      }}
    >
      <Handle type="target" position={Position.Top} className="opacity-0" />
      {data.onInfoClick && <InfoButton onClick={data.onInfoClick} />}

      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap pr-6">
        <FindingIdBadge findingId={finding.findingId} />
        <span className={`text-[10px] font-semibold uppercase tracking-wide font-heading ${severityColor}`}>
          {finding.severity}
        </span>
      </div>

      <div className="max-h-[16rem] overflow-y-auto noDrag nowheel">
        <p className="text-text-secondary text-[13px] leading-relaxed mb-2 break-words" style={{ fontFamily: 'var(--font-body)' }}>
          {renderWithCode(finding.description)}
        </p>
      </div>

      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}
