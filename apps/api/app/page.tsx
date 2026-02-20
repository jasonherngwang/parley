'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

type FloorOpenState = { type: 'floor-open' };
type RunningState = {
  type: 'running';
  prUrl: string;
  title?: string;
  repoName?: string;
  prNumber?: number;
  status: 'running';
};
type CompleteState = {
  type: 'complete';
  prUrl: string;
  title?: string;
  repoName?: string;
  prNumber?: number;
  status: 'complete';
};
type AppState = FloorOpenState | RunningState | CompleteState;

export default function Home() {
  const [state, setState] = useState<AppState>({ type: 'floor-open' });
  const [prUrl, setPrUrl] = useState('');
  const [context, setContext] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource('/api/review/stream');
    eventSourceRef.current = es;

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

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!prUrl.trim() || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/review/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prUrl: prUrl.trim(),
          context: context.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Failed to start review');
      } else {
        setPrUrl('');
        setContext('');
      }
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  }, [prUrl, context, submitting]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-2xl space-y-8">
        <header className="text-center">
          <h1 className="text-4xl font-bold tracking-tight">Parley</h1>
          <p className="mt-2 text-gray-400">Adversarial Code Review</p>
        </header>

        {state.type === 'floor-open' && (
          <div className="space-y-4 rounded-xl border border-gray-800 bg-gray-900 p-6">
            <p className="text-sm text-gray-400">
              The floor is open. Submit a GitHub PR URL to start a review.
            </p>
            <div className="space-y-3">
              <input
                type="url"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 p-3 text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="https://github.com/owner/repo/pull/123"
                value={prUrl}
                onChange={(e) => setPrUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmit();
                }}
              />
              <textarea
                className="w-full rounded-lg border border-gray-700 bg-gray-800 p-3 text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                rows={3}
                placeholder="Optional: additional context about this PR..."
                value={context}
                onChange={(e) => setContext(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              onClick={handleSubmit}
              disabled={submitting || !prUrl.trim()}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Starting...' : 'Start Review'}
            </button>
          </div>
        )}

        {state.type === 'running' && (
          <div className="space-y-4 rounded-xl border border-blue-800/50 bg-gray-900 p-6">
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 animate-pulse rounded-full bg-blue-500" />
              <span className="font-medium">Review Running</span>
            </div>
            {state.title ? (
              <div className="rounded-lg bg-gray-800 p-4">
                <p className="text-sm text-gray-400">
                  {state.repoName} #{state.prNumber}
                </p>
                <p className="mt-1 font-medium text-gray-200">{state.title}</p>
              </div>
            ) : (
              <div className="rounded-lg bg-gray-800 p-4">
                <p className="text-sm text-gray-400">Fetching PR details...</p>
                <p className="mt-1 break-all text-xs text-gray-500">
                  {state.prUrl}
                </p>
              </div>
            )}
            <p className="text-sm text-gray-400">Processing...</p>
          </div>
        )}

        {state.type === 'complete' && (
          <div className="space-y-4 rounded-xl border border-green-800/50 bg-gray-900 p-6">
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-green-500" />
              <span className="font-medium">Review Complete</span>
            </div>
            {state.title && (
              <div className="rounded-lg bg-gray-800 p-4">
                <p className="text-sm text-gray-400">
                  {state.repoName} #{state.prNumber}
                </p>
                <p className="mt-1 font-medium text-gray-200">{state.title}</p>
              </div>
            )}
            <p className="text-sm text-green-400">
              Done. The floor will reopen shortly.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
