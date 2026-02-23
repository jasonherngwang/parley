'use client';

import { useEffect, useState } from 'react';
import type { HistorySummary } from '../shared';

export function HistoryModal({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (id: number) => void;
}) {
  const [items, setItems] = useState<HistorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    fetch('/api/review/history')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load history');
        return r.json();
      })
      .then((data: HistorySummary[]) => {
        setItems(data);
        setLoading(false);
      })
      .catch(() => {
        setFetchError(true);
        setLoading(false);
      });
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-full max-w-lg rounded-lg border border-border-default bg-surface-1 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-heading text-base font-bold text-text-primary tracking-[-0.01em]">
            Review History
          </h2>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {loading && <p className="text-text-tertiary text-[13px]" style={{ fontFamily: 'var(--font-body)' }}>Loading&hellip;</p>}
        {!loading && fetchError && (
          <p className="text-status-fail text-[13px]" style={{ fontFamily: 'var(--font-body)' }}>Failed to load history.</p>
        )}
        {!loading && !fetchError && items.length === 0 && (
          <p className="text-text-tertiary text-[13px] italic" style={{ fontFamily: 'var(--font-body)' }}>No reviews yet.</p>
        )}
        {!loading && !fetchError && items.length > 0 && (
          <ul className="space-y-2 max-h-96 overflow-y-auto">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => {
                    onSelect(item.id);
                    onClose();
                  }}
                  className="w-full rounded-md border border-border-subtle bg-surface-2 p-3 text-left hover:border-accent/40 transition-colors"
                >
                  <p className="text-text-primary text-[13px] font-medium" style={{ fontFamily: 'var(--font-body)' }}>
                    {item.prTitle || 'Untitled PR'}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-text-tertiary text-[11px]" style={{ fontFamily: 'var(--font-mono)' }}>
                      {item.repoName}
                    </span>
                    <span className="text-accent text-[11px]" style={{ fontFamily: 'var(--font-mono)' }}>
                      {item.findingCount} finding
                      {item.findingCount !== 1 ? 's' : ''}
                    </span>
                    <span className="text-text-ghost text-[11px] ml-auto" style={{ fontFamily: 'var(--font-mono)' }}>
                      {new Date(item.completedAt).toLocaleDateString()}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
