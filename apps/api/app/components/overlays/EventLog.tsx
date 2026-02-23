'use client';

import { useEffect, useRef, useState } from 'react';

export function EventLog({ entries }: { entries: string[] }) {
  const logRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [entries]);

  if (entries.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-30 w-64">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between rounded-t-lg bg-surface-1/95 backdrop-blur border border-border-default border-b-0 px-3 py-1.5 text-[10px] text-text-tertiary uppercase tracking-[0.06em] hover:text-text-secondary transition-colors"
        style={{ fontFamily: 'var(--font-heading)' }}
      >
        <span className="font-medium">Event Stream ({entries.length})</span>
        <span className="text-[8px]">{collapsed ? '▲' : '▼'}</span>
      </button>
      {!collapsed && (
        <div
          ref={logRef}
          className="rounded-b-lg border border-border-default bg-surface-0/95 backdrop-blur p-3 max-h-48 overflow-y-auto space-y-0.5"
        >
          {entries.map((entry, i) => (
            <p key={i} className="text-[11px] text-text-tertiary" style={{ fontFamily: 'var(--font-mono)' }}>
              {entry}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
