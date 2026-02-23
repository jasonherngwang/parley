'use client';

import { WHY_COPY } from '../shared';

function renderWithCode(text: string) {
  const parts = text.split(/(`[^`]+`)/);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
          return (
            <code
              key={i}
              className="rounded px-1 py-0.5 bg-surface-2 text-accent"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875em' }}
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        return part;
      })}
    </>
  );
}

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
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div className="animate-slide-in-right relative w-full max-w-md h-full bg-surface-0 border-l border-border-default p-6 overflow-y-auto shadow-[0_4px_24px_rgba(0,0,0,0.6)] flex flex-col">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-border-subtle">
          <span className="text-[11px] text-text-tertiary uppercase tracking-[0.08em] font-medium" style={{ fontFamily: 'var(--font-heading)' }}>
            What&apos;s this?
          </span>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary transition-colors text-lg leading-none"
            aria-label="Close drawer"
          >
            ✕
          </button>
        </div>
        <h2 className="font-heading text-xl font-bold text-text-primary mb-5 tracking-[0.04em] uppercase">{content.title}</h2>
        <div className="space-y-4 flex-1">
          {content.paragraphs.map((p, i) => (
            <p key={i} className="text-sm text-text-secondary leading-relaxed" style={{ fontFamily: 'var(--font-body)' }}>
              {renderWithCode(p)}
            </p>
          ))}
          {content.config && (
            <div className="mt-2 rounded border border-border-subtle bg-surface-2 p-3">
              <p className="text-[10px] uppercase tracking-[0.08em] text-text-ghost font-semibold mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
                Configuration
              </p>
              <div className="space-y-1.5">
                {content.config.map(({ label, value }, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-4">
                    <span className="text-[10px] text-text-tertiary shrink-0" style={{ fontFamily: 'var(--font-body)' }}>{label}</span>
                    <span className="text-[11px] text-text-secondary text-right" style={{ fontFamily: 'var(--font-mono)' }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
