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

  useEffect(() => {
    fetch('/api/review/history')
      .then((r) => r.json())
      .then((data: HistorySummary[]) => {
        setItems(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-full max-w-lg rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-gray-100 uppercase tracking-widest">
            Review History
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {loading && <p className="text-gray-500 text-sm">Loading&hellip;</p>}
        {!loading && items.length === 0 && (
          <p className="text-gray-500 text-sm italic">No reviews yet.</p>
        )}
        {!loading && items.length > 0 && (
          <ul className="space-y-2 max-h-96 overflow-y-auto">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => {
                    onSelect(item.id);
                    onClose();
                  }}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 p-3 text-left hover:border-purple-600 transition-colors"
                >
                  <p className="text-gray-200 text-xs font-medium">
                    {item.prTitle || 'Untitled PR'}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-gray-500 text-[10px]">
                      {item.repoName}
                    </span>
                    <span className="text-purple-400 text-[10px]">
                      {item.findingCount} finding
                      {item.findingCount !== 1 ? 's' : ''}
                    </span>
                    <span className="text-gray-600 text-[10px] ml-auto">
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
