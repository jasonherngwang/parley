'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

import type {
  AppState,
  RunningState,
  SpecialistState,
  Specialists,
  PastReview,
} from './components/shared';
import { specialistFromFindingId } from './components/shared';
import { FlowCanvas } from './components/FlowCanvas';
import { SubmissionCard } from './components/overlays/SubmissionCard';
import { EventLog } from './components/overlays/EventLog';
import { WhyDrawer } from './components/overlays/WhyDrawer';
import { HistoryModal } from './components/overlays/HistoryModal';

export default function Home() {
  const [state, setState] = useState<AppState>({ type: 'floor-open' });
  const [challengesSubmitted, setChallengesSubmitted] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [pastReview, setPastReview] = useState<PastReview | null>(null);
  const [selectedWhy, setSelectedWhy] = useState<string | null>(null);
  const [eventLog, setEventLog] = useState<string[]>([]);
  const prevStateRef = useRef<AppState>({ type: 'floor-open' });

  // Reset on new review
  useEffect(() => {
    if (state.type === 'floor-open') {
      setChallengesSubmitted(false);
      setPastReview(null);
      setEventLog([]);
    }
  }, [state.type]);

  // Track state transitions → semantic event log entries
  useEffect(() => {
    const prev = prevStateRef.current;
    const curr = state;
    const newEntries: string[] = [];

    if (prev.type === 'floor-open' && curr.type === 'running') {
      newEntries.push('\uD83D\uDE80 Review started \u2014 fetching PR diff');
    }

    if (
      curr.type === 'running' &&
      curr.title &&
      !('title' in prev && prev.title)
    ) {
      newEntries.push(
        `\uD83D\uDD0D PR fetched: "${curr.title}" (${curr.repoName} #${curr.prNumber})`
      );
      newEntries.push('\uD83D\uDEA2 Crew dispatched \u2014 IRONJAW, BARNACLE, GREENHAND running');
    }

    if (curr.type === 'running' && curr.specialists) {
      const prevSpec =
        'specialists' in prev ? (prev as RunningState).specialists : undefined;
      for (const [name, sp] of Object.entries(curr.specialists) as Array<
        [string, SpecialistState]
      >) {
        const prevSp = prevSpec?.[name as keyof Specialists];
        if (prevSp?.status !== 'complete' && sp.status === 'complete') {
          const count = sp.findings?.length ?? 0;
          newEntries.push(
            `\u2705 ${name.toUpperCase()}: ${count} finding${count !== 1 ? 's' : ''} filed`
          );
        }
        if (prevSp?.status !== 'timed-out' && sp.status === 'timed-out') {
          newEntries.push(`\u23F1 ${name.toUpperCase()}: timed out after 45s`);
        }
        if (prevSp?.status !== 'failed' && sp.status === 'failed') {
          newEntries.push(`\uD83D\uDCA5 ${name.toUpperCase()}: failed after 3 attempts`);
        }
      }
    }

    const prevWindowOpen =
      'windowOpen' in prev ? (prev as RunningState).windowOpen : false;
    const currWindowOpen =
      'windowOpen' in curr ? (curr as RunningState).windowOpen : false;
    if (!prevWindowOpen && currWindowOpen) {
      newEntries.push('\u2694\uFE0F Challenge window open \u2014 10 minutes');
      newEntries.push('\uD83C\uDFF4\u200D\u2620\uFE0F THE MUTINEER reviewing findings independently');
    }

    const prevMutineer =
      'mutineerStatus' in prev
        ? (prev as RunningState).mutineerStatus
        : undefined;
    const currMutineer =
      'mutineerStatus' in curr
        ? (curr as RunningState).mutineerStatus
        : undefined;
    if (prevMutineer !== 'complete' && currMutineer === 'complete') {
      const count = (curr as RunningState).mutineerChallenges?.length ?? 0;
      newEntries.push(
        `\uD83C\uDFF4\u200D\u2620\uFE0F THE MUTINEER challenged ${count} finding${count !== 1 ? 's' : ''}`
      );
    }

    const prevArbs =
      'arbitrations' in prev
        ? ((prev as RunningState).arbitrations ?? [])
        : [];
    const currArbs =
      'arbitrations' in curr
        ? ((curr as RunningState).arbitrations ?? [])
        : [];
    for (const arb of currArbs) {
      const prevArb = prevArbs.find((a) => a.findingId === arb.findingId);
      if (prevArb?.status !== 'complete' && arb.status === 'complete' && arb.ruling) {
        const specialist = specialistFromFindingId(arb.findingId);
        const rulingLabel =
          arb.ruling === 'upheld'
            ? '\uD83D\uDD34 upheld'
            : arb.ruling === 'overturned'
              ? '\uD83D\uDFE2 overturned'
              : '\u26AA inconclusive';
        newEntries.push(`\u2696\uFE0F ${specialist}'s finding: ${rulingLabel}`);
      }
      if (!prevArb && arb.status !== 'complete') {
        const specialist = specialistFromFindingId(arb.findingId);
        const sources = arb.challengeSources
          .map((s) => (s === 'mutineer' ? 'THE MUTINEER' : 'Human'))
          .join(' + ');
        newEntries.push(
          `\u2696\uFE0F Arbitrating ${specialist}'s finding \u2014 challenged by ${sources}`
        );
      }
    }

    const prevSynth =
      'synthesisStatus' in prev
        ? (prev as RunningState).synthesisStatus
        : undefined;
    const currSynth =
      'synthesisStatus' in curr
        ? (curr as RunningState).synthesisStatus
        : undefined;
    if (prevSynth !== 'running' && currSynth === 'running') {
      newEntries.push('\uD83D\uDD2E Synthesis running \u2014 reconciling all findings');
    }
    if (prevSynth !== 'complete' && currSynth === 'complete') {
      const count = (curr as RunningState).verdict?.findings.length ?? 0;
      newEntries.push(
        `\u2705 Synthesis complete \u2014 ${count} finding${count !== 1 ? 's' : ''} in verdict`
      );
    }
    if (prevSynth !== 'failed' && currSynth === 'failed') {
      newEntries.push('\uD83D\uDCA5 Synthesis failed');
    }

    if (prev.type !== 'complete' && curr.type === 'complete') {
      newEntries.push('\uD83C\uDF89 Review complete \u2014 floor reopening');
    }

    if (newEntries.length > 0) {
      setEventLog((prev) => [...prev, ...newEntries]);
    }

    prevStateRef.current = curr;
  }, [state]);

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

  const handleExtend = useCallback(async () => {
    await fetch('/api/review/extend', { method: 'POST' });
    setEventLog((prev) => [...prev, '\u26A1 Window extended (+2 min)']);
  }, []);

  const handleSubmitChallenges = useCallback(
    async (challenges: Record<string, string>) => {
      const res = await fetch('/api/review/challenges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(challenges),
      });
      if (res.ok) {
        setChallengesSubmitted(true);
        setEventLog((prev) => [...prev, '\uD83D\uDCDD Challenges submitted']);
      }
    },
    [],
  );

  const handleSelectHistory = useCallback(async (id: number) => {
    const res = await fetch(`/api/review/history/${id}`);
    if (res.ok) {
      const data = await res.json();
      setPastReview(data as PastReview);
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

  const isFloorOpen = state.type === 'floor-open' && !pastReview;
  const showEventLogOverlay =
    (state.type === 'running' || state.type === 'complete') &&
    eventLog.length > 0;

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-gray-950">
      {/* Full-viewport ReactFlow canvas */}
      <FlowCanvas
        state={state}
        pastReview={pastReview}
        onExtend={handleExtend}
        onSubmitChallenges={handleSubmitChallenges}
        challengesSubmitted={challengesSubmitted}
        onNodeClick={setSelectedWhy}
      />

      {/* Fixed header bar */}
      <header className="fixed top-0 left-0 right-0 z-20 bg-gray-950/80 backdrop-blur border-b border-gray-800 px-4 py-2 flex items-center justify-between">
        <div>
          <span className="text-sm font-bold tracking-tight text-gray-100">PARLEY</span>
          <span className="ml-2 text-[10px] text-gray-500">Adversarial Code Review</span>
        </div>
        <div className="flex items-center gap-2">
          {state.type === 'complete' && !pastReview && (
            <button
              onClick={handleDownloadCurrent}
              className="rounded-lg border border-gray-600 px-3 py-1 text-gray-300 text-[11px] hover:border-purple-500 hover:text-purple-400 transition-colors"
            >
              Download JSON
            </button>
          )}
          {pastReview && (
            <>
              <button
                onClick={handleDownloadPast}
                className="rounded-lg border border-gray-600 px-3 py-1 text-gray-300 text-[11px] hover:border-purple-500 hover:text-purple-400 transition-colors"
              >
                Download JSON
              </button>
              <button
                onClick={() => setPastReview(null)}
                className="rounded-lg border border-gray-700 px-3 py-1 text-gray-400 text-[11px] hover:border-gray-500 transition-colors"
              >
                Close Past Review
              </button>
            </>
          )}
          <button
            onClick={() => setShowHistory(true)}
            className="rounded-lg border border-gray-700 px-3 py-1 text-gray-400 text-[11px] hover:border-gray-500 hover:text-gray-200 transition-colors"
          >
            History
          </button>
        </div>
      </header>

      {/* Floating submission card (floor-open state) */}
      {isFloorOpen && <SubmissionCard onSubmit={handleSubmit} />}

      {/* New Review button after completion */}
      {state.type === 'floor-open' && pastReview && (
        <div className="fixed top-14 left-4 z-20">
          <button
            onClick={() => setPastReview(null)}
            className="rounded-lg border border-gray-700 bg-gray-900/90 backdrop-blur px-3 py-1.5 text-gray-300 text-xs hover:border-blue-500 hover:text-blue-400 transition-colors"
          >
            New Review
          </button>
        </div>
      )}

      {/* Floating event log */}
      {showEventLogOverlay && <EventLog entries={eventLog} />}

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
