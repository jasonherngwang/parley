'use client';

import { WHY_COPY } from '../shared';

export function WhyDrawer({
  whyKey,
  onClose,
}: {
  whyKey: string;
  onClose: () => void;
}) {
  const content = WHY_COPY[whyKey];
  if (!content) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div className="animate-slide-in-right relative w-full max-w-md h-full bg-gray-950 border-l border-gray-700 p-6 overflow-y-auto shadow-2xl flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <span className="text-xs text-gray-500 uppercase tracking-widest font-semibold">
            Why this?
          </span>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors text-lg leading-none"
            aria-label="Close drawer"
          >
            ✕
          </button>
        </div>
        <h2 className="text-base font-bold text-gray-100 mb-5">{content.title}</h2>
        <div className="space-y-4 flex-1">
          {content.paragraphs.map((p, i) => (
            <p key={i} className="text-sm text-gray-400 leading-relaxed">
              {p}
            </p>
          ))}
        </div>
        <div className="mt-6 pt-4 border-t border-gray-800">
          <p className="text-[10px] text-gray-600 italic">
            Powered by Temporal &mdash; durable workflow orchestration
          </p>
        </div>
      </div>
    </div>
  );
}
