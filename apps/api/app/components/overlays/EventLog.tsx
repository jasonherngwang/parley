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
    <div className="fixed bottom-4 left-4 z-40 w-80">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between rounded-t-lg bg-gray-900/95 backdrop-blur border border-gray-700 border-b-0 px-3 py-1.5 text-[10px] text-gray-500 uppercase tracking-widest font-semibold hover:text-gray-300 transition-colors"
      >
        <span>Event Stream ({entries.length})</span>
        <span>{collapsed ? '\u25B2' : '\u25BC'}</span>
      </button>
      {!collapsed && (
        <div
          ref={logRef}
          className="rounded-b-lg border border-gray-700 bg-gray-950/95 backdrop-blur p-3 max-h-48 overflow-y-auto space-y-0.5"
        >
          {entries.map((entry, i) => (
            <p key={i} className="text-[11px] text-gray-400 font-mono">
              {entry}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
