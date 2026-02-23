'use client';

import { useEffect, useState, useCallback } from 'react';

import type {
  AppState,
  RunningState,
  PastReview,
  TemporalMeta,
} from './components/shared';
import { FlowCanvas } from './components/FlowCanvas';
import { WorkflowInfoBar } from './components/overlays/WorkflowInfoBar';
import { WhyDrawer } from './components/overlays/WhyDrawer';
import { HistoryModal } from './components/overlays/HistoryModal';

export default function Home() {
  const [state, setState] = useState<AppState>({ type: 'floor-open' });
  const [challengesSubmitted, setChallengesSubmitted] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [pastReview, setPastReview] = useState<PastReview | null>(null);
  const [selectedWhy, setSelectedWhy] = useState<string | null>(null);
  // Reset on new review
  useEffect(() => {
    if (state.type === 'running') {
      setChallengesSubmitted(false);
      setPastReview(null);
    }
  }, [state.type]);

  // SSE connection
  useEffect(() => {
    const es = new EventSource('/api/review/stream');
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as AppState;
        setState(data);
      } catch {
        // Ignore malformed events
      }
    };
    es.onerror = () => {
      // EventSource auto-reconnects
    };
    return () => es.close();
  }, []);

  // ── Callbacks ──────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(
    async (prUrl: string, context?: string): Promise<string | null> => {
      try {
        const res = await fetch('/api/review/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prUrl, context }),
        });
        const data = await res.json();
        if (!res.ok) {
          return data.error ?? 'Failed to start review';
        }
        return null;
      } catch {
        return 'Network error';
      }
    },
    [],
  );

  const handleCancel = useCallback(async () => {
    try {
      await fetch('/api/review/cancel', { method: 'POST' });
    } catch {
      // Best-effort — UI will reconcile via SSE
    }
  }, []);

  const handleExtend = useCallback(async () => {
    try {
      await fetch('/api/review/extend', { method: 'POST' });
    } catch {
      // Best-effort
    }
  }, []);

  const handleSubmitChallenges = useCallback(
    async (challenges: Record<string, string>) => {
      try {
        const res = await fetch('/api/review/challenges', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(challenges),
        });
        if (res.ok) {
          setChallengesSubmitted(true);
        }
      } catch {
        // Network error — user can retry
      }
    },
    [],
  );

  const handleSelectHistory = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/review/history/${id}`);
      if (res.ok) {
        const data = await res.json();
        setPastReview(data as PastReview);
      }
    } catch {
      // Network error — modal already handles empty state
    }
  }, []);

  const handleDownloadCurrent = useCallback(() => {
    if (state.type === 'floor-open') return;
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'parley-review-current.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [state]);

  const handleDownloadPast = useCallback(() => {
    if (!pastReview) return;
    const blob = new Blob([JSON.stringify(pastReview, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `parley-review-${pastReview.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [pastReview]);

  // ── Derived booleans ──────────────────────────────────────────────────────

  const temporalMeta: TemporalMeta | undefined =
    state.type !== 'floor-open' ? (state as RunningState).temporal : undefined;

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-surface-0 grain-overlay">
      {/* Full-viewport ReactFlow canvas (always visible) */}
      <FlowCanvas
        state={state}
        pastReview={pastReview}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        onExtend={handleExtend}
        onSubmitChallenges={handleSubmitChallenges}
        challengesSubmitted={challengesSubmitted}
        onInfoClick={setSelectedWhy}
      />

      {/* Fixed header bar */}
      <header className="fixed top-0 left-0 right-0 z-20 bg-surface-0/90 backdrop-blur-xl border-b border-border-subtle px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-heading text-xl font-black text-text-primary tracking-[0.12em] uppercase">PARLEY</span>
          <span className="text-[11px] text-text-tertiary uppercase tracking-[0.06em]" style={{ fontFamily: 'var(--font-body)' }}>Adversarial Code Review</span>
        </div>
        <div className="flex items-center gap-2">
          {state.type === 'running' && (
            <button
              onClick={handleCancel}
              className="rounded-lg border border-status-fail/30 px-3 py-1 text-status-fail text-[11px] hover:border-status-fail/60 hover:text-status-fail transition-colors"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              Cancel Review
            </button>
          )}
          {state.type === 'complete' && !pastReview && (
            <button
              onClick={handleDownloadCurrent}
              className="rounded-lg border border-border-default px-3 py-1 text-text-secondary text-[11px] hover:border-border-emphasis hover:text-text-primary transition-colors"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              Download JSON
            </button>
          )}
          {pastReview && (
            <>
              <button
                onClick={handleDownloadPast}
                className="rounded-lg border border-border-default px-3 py-1 text-text-secondary text-[11px] hover:border-border-emphasis hover:text-text-primary transition-colors"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                Download JSON
              </button>
              <button
                onClick={() => setPastReview(null)}
                className="rounded-lg border border-border-default px-3 py-1 text-text-tertiary text-[11px] hover:border-border-emphasis hover:text-text-secondary transition-colors"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                Close Past Review
              </button>
            </>
          )}
          <button
            onClick={() => setShowHistory(true)}
            className="rounded-lg border border-border-default px-3 py-1 text-text-tertiary text-[11px] hover:border-border-emphasis hover:text-text-secondary transition-colors"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            History
          </button>
        </div>
      </header>

      {/* Temporal runtime info bar */}
      {temporalMeta && !pastReview && (
        <WorkflowInfoBar
          temporal={temporalMeta}
          isComplete={state.type === 'complete'}
        />
      )}

      {/* Why drawer */}
      {selectedWhy && (
        <WhyDrawer
          whyKey={selectedWhy}
          onClose={() => setSelectedWhy(null)}
        />
      )}

      {/* History modal */}
      {showHistory && (
        <HistoryModal
          onClose={() => setShowHistory(false)}
          onSelect={handleSelectHistory}
        />
      )}
    </main>
  );
}
