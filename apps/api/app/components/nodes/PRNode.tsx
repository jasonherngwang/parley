'use client';

import { useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { InfoButton } from '../shared';

interface PRNodeData {
  stateType: 'floor-open' | 'running' | 'complete';
  title?: string;
  repoName?: string;
  prNumber?: number;
  prUrl?: string;
  fetchError?: string;
  onSubmit: (prUrl: string, context?: string) => Promise<string | null>;
  onCancel?: () => void;
  onInfoClick?: () => void;
  [key: string]: unknown;
}

const SAMPLE_PRS = [
  { label: 'ghostty #9709', url: 'https://github.com/ghostty-org/ghostty/pull/9709' },
  { label: 'cf/agents #391', url: 'https://github.com/cloudflare/agents/pull/391' },
  { label: 'pydantic-ai #528', url: 'https://github.com/pydantic/pydantic-ai/pull/528' },
];

export function PRNode({ data }: { data: PRNodeData }) {
  const { stateType, title, repoName, prNumber, prUrl, onSubmit, fetchError: workflowError } = data;
  const [inputUrl, setInputUrl] = useState('');
  const [context, setContext] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSample = (url: string) => {
    setInputUrl(url);
    setError(null);
  };

  const isIdle = stateType === 'floor-open';
  const isRunning = stateType === 'running';
  const isComplete = stateType === 'complete';
  const showForm = isIdle || isComplete;
  const fetching = isRunning && !title;
  const fetched = isRunning && !!title;

  const handleSubmit = async () => {
    if (!inputUrl.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    const err = await onSubmit(inputUrl.trim(), context.trim() || undefined);
    if (err) {
      setError(err);
    } else {
      setInputUrl('');
      setContext('');
    }
    setSubmitting(false);
  };

  return (
    <div
      className="relative w-[480px] rounded-lg border border-border-default bg-surface-1 p-5 transition-all duration-300 animate-node-entrance"
      style={{
        outline: '1px solid rgba(90,69,48,0.3)',
        outlineOffset: '2px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.5), inset 0 1px 0 rgba(240,228,200,0.04)',
      }}
    >
      {data.stateType !== 'floor-open' && data.onInfoClick && <InfoButton onClick={data.onInfoClick} />}

      {/* Running state — show PR info */}
      {fetching && (
        <div>
          <p className="text-text-secondary text-[13px]" style={{ fontFamily: 'var(--font-body)' }}>
            Fetching PR details<span className="animate-cursor-blink">▌</span>
          </p>
          <p className="mt-1 break-all text-[11px] text-text-ghost" style={{ fontFamily: 'var(--font-mono)' }}>{prUrl}</p>
        </div>
      )}
      {fetched && (
        <div>
          <a
            href={prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-tertiary hover:text-accent transition-colors text-[11px] noDrag"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {repoName} #{prNumber} ↗
          </a>
          <p className="text-text-primary text-[13px] mt-1 font-medium" style={{ fontFamily: 'var(--font-body)' }}>{title}</p>
        </div>
      )}

      {/* Complete state — show result + new review form */}
      {isComplete && title && (
        <div className="mb-4 pb-4 border-b border-border-subtle">
          <a
            href={prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-tertiary hover:text-accent transition-colors text-[11px] noDrag"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {repoName} #{prNumber} ↗
          </a>
          <p className="text-text-primary text-[13px] mt-1 font-medium" style={{ fontFamily: 'var(--font-body)' }}>{title}</p>
        </div>
      )}

      {/* Input form — idle or complete */}
      {showForm && (
        <div className="space-y-3 noDrag">
          <div>
            <h2 className="font-heading text-base font-bold text-text-primary tracking-[0.05em] uppercase">
              {isComplete ? 'Start New Review' : 'Parley'}
            </h2>
            <p className="text-[13px] text-text-secondary mt-0.5" style={{ fontFamily: 'var(--font-body)' }}>
              {isComplete
                ? 'Enter another PR URL to review.'
                : 'Submit a GitHub PR URL to start an adversarial code review.'}
            </p>
          </div>
          <input
            type="url"
            className="w-full rounded-lg border border-border-default bg-surface-2 p-3 text-[13px] text-text-primary placeholder-text-ghost focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/30 transition-colors"
            style={{ fontFamily: 'var(--font-body)' }}
            placeholder="https://github.com/owner/repo/pull/123"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit();
            }}
          />
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-text-ghost" style={{ fontFamily: 'var(--font-body)' }}>try:</span>
            {SAMPLE_PRS.map((pr) => (
              <button
                key={pr.url}
                onClick={() => handleSample(pr.url)}
                className="text-[11px] text-text-tertiary hover:text-accent transition-colors"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {pr.label}
              </button>
            ))}
          </div>
          <textarea
            className="w-full rounded-lg border border-border-default bg-surface-2 p-3 text-[13px] text-text-primary placeholder-text-ghost focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/30 resize-none transition-colors"
            style={{ fontFamily: 'var(--font-body)' }}
            rows={2}
            placeholder="Optional: additional context about this PR..."
            value={context}
            onChange={(e) => setContext(e.target.value)}
          />
          {(workflowError || error) && (
            <p className="text-[13px] text-status-fail" style={{ fontFamily: 'var(--font-body)' }}>
              {workflowError || error}
            </p>
          )}
          <button
            onClick={handleSubmit}
            disabled={submitting || !inputUrl.trim()}
            className="w-full rounded-lg px-4 py-2.5 text-[13px] font-medium transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              fontFamily: 'var(--font-heading)',
              backgroundColor: 'var(--color-accent)',
              color: 'var(--color-surface-0)',
            }}
          >
            {submitting ? 'Starting...' : 'Start Review'}
          </button>
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}
