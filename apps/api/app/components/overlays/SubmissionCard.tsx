'use client';

import { useState } from 'react';

export function SubmissionCard({
  onSubmit,
}: {
  onSubmit: (prUrl: string, context?: string) => Promise<string | null>;
}) {
  const [prUrl, setPrUrl] = useState('');
  const [context, setContext] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!prUrl.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    const err = await onSubmit(prUrl.trim(), context.trim() || undefined);
    if (err) {
      setError(err);
    } else {
      setPrUrl('');
      setContext('');
    }
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center pointer-events-none">
      <div className="pointer-events-auto w-full max-w-lg rounded-2xl border border-gray-700 bg-gray-900/95 backdrop-blur p-6 shadow-2xl animate-fade-in-up space-y-4">
        <div>
          <h2 className="text-lg font-bold text-gray-100 tracking-tight">Parley</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Submit a GitHub PR URL to start an adversarial code review.
          </p>
        </div>
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
    </div>
  );
}
